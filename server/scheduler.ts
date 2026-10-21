import { Hono } from "hono";
import { z } from "zod";
import { owned } from "./access";
import {
  batchPolicies,
  batchPostingSchema,
  saveBatchSchedule,
} from "./batch-schedule";
import { ap, getIntegration } from "./activepieces";
import {
  dailyMinutes,
  localDay,
  nextDay,
  scheduleSchema,
  utcFor,
} from "./schedule-plan";
import { hash, id, now, PublicError, randomToken, rateLimit } from "./security";
import type { AppEnv, Automation, Env } from "./types";
export type ScheduledAutomation = Automation & {
  scheduler_enabled: number;
  planned_through: string | null;
  flow_version_id: string | null;
};
export async function ensurePlan(
  env: Env,
  a: ScheduledAutomation,
  at = now(),
  requestedDay?: string,
) {
  if (
    !a.scheduler_enabled ||
    !a.applied_config ||
    a.operation_id ||
    !["running", "paused"].includes(a.status)
  )
    return;
  const config = JSON.parse(a.applied_config),
    policies = await batchPolicies(env, a),
    today = requestedDay || localDay(at, config.timeZone),
    through = nextDay(today, requestedDay ? 1 : 2);
  const keys = await Promise.all(
    policies.map(async (p: any) => ({
      ...p,
      key: await hash(JSON.stringify([p.batchId, p.pinsPerDay, p.schedule])),
    })),
  );
  const scope = JSON.stringify(keys.map((p) => [p.accountId, p.key]));
  if (
    !requestedDay &&
    (a as any).plan_scope === scope &&
    a.planned_through &&
    a.planned_through >= through
  )
    return;
  for (const account of config.accounts.filter((x: any) => x.on)) {
    const policy = keys.find((p) => p.accountId === account.id)!;
    const mutations = [
      env.DB.prepare(
        "INSERT INTO account_batch_state VALUES(?,?,?) ON CONFLICT(automation_id,account_id) DO UPDATE SET batch_id=excluded.batch_id",
      ).bind(a.id, account.id, policy.batchId),
    ];
    // Adopt existing default slots without rerolling saved times or losing removals.
    if (!policy.batchId)
      mutations.push(
        env.DB.prepare(
          "UPDATE schedule_jobs SET plan_key=? WHERE automation_id=? AND account_id=? AND plan_key='' AND batch_id='' AND schedule_revision=?",
        ).bind(policy.key, a.id, account.id, a.applied_revision),
      );
    mutations.push(
      env.DB.prepare(
        "UPDATE schedule_jobs SET status='cancelled',detail='Posting policy changed' WHERE automation_id=? AND account_id=? AND origin='scheduled' AND status IN('pending','dispatched','claimed') AND plan_key<>? AND planned_at>=?",
      ).bind(a.id, account.id, policy.key, at),
    );
    mutations.push(
      env.DB.prepare(
        "UPDATE schedule_jobs SET status='pending',detail=NULL,schedule_revision=? WHERE automation_id=? AND account_id=? AND origin='scheduled' AND status='cancelled' AND (detail='Posting policy changed' OR (schedule_revision<>? AND detail IS NOT 'Removed from this day')) AND plan_key=? AND planned_at>=?",
      ).bind(
        a.applied_revision,
        a.id,
        account.id,
        a.applied_revision,
        policy.key,
        at,
      ),
    );
    for (let d = today; d < through; d = nextDay(d)) {
      const token = id(),
        rows = dailyMinutes(policy.schedule, policy.pinsPerDay)
          .map((minute) => utcFor(d, minute, config.timeZone))
          .filter((v): v is number => v !== null)
          .map((planned) => ({
            id: id(),
            at: planned,
            status: planned < at ? "skipped" : "pending",
          }));
      const existing = (
        await env.DB.prepare(
          "SELECT id,planned_at,status,detail FROM schedule_jobs WHERE automation_id=? AND account_id=? AND local_day=? AND origin='scheduled' AND schedule_revision=? AND (plan_key=? OR (plan_key='' AND batch_id='' AND ?='')) ORDER BY planned_at",
        )
          .bind(
            a.id,
            account.id,
            d,
            a.applied_revision,
            policy.key,
            policy.batchId,
          )
          .all<any>()
      ).results;
      const saved = existing.length
        ? existing.map((j) => ({
            id: j.id,
            at: j.planned_at,
            removed:
              j.status === "cancelled" && j.detail === "Removed from this day"
                ? 1
                : 0,
          }))
        : rows;
      mutations.push(
        env.DB.prepare(
          "INSERT INTO schedule_day_plans VALUES(?,?,?,?,?,?) ON CONFLICT(automation_id,account_id,local_day,plan_key) DO NOTHING",
        ).bind(a.id, account.id, d, policy.key, token, JSON.stringify(saved)),
      );
      mutations.push(
        env.DB.prepare(
          `INSERT INTO schedule_jobs(id,automation_id,account_id,account_name,schedule_revision,planned_at,local_day,status,batch_id,plan_key,detail)
        SELECT json_extract(value,'$.id'),?,?,?, ?,json_extract(value,'$.at'),?,CASE WHEN json_extract(value,'$.removed')=1 THEN 'cancelled' WHEN json_extract(value,'$.at')<? THEN 'skipped' ELSE 'pending' END,?,?,CASE WHEN json_extract(value,'$.removed')=1 THEN 'Removed from this day' ELSE NULL END
        FROM json_each((SELECT plan FROM schedule_day_plans WHERE automation_id=? AND account_id=? AND local_day=? AND plan_key=?)) WHERE true
        ON CONFLICT(id) DO NOTHING
        ON CONFLICT(automation_id,account_id,planned_at) DO UPDATE SET id=excluded.id,account_name=excluded.account_name,schedule_revision=excluded.schedule_revision,local_day=excluded.local_day,status=excluded.status,lease_token=NULL,started_at=NULL,finished_at=NULL,remote_run_id=NULL,detail=excluded.detail,batch_id=excluded.batch_id,plan_key=excluded.plan_key
        WHERE schedule_jobs.status='cancelled' AND schedule_jobs.planned_at>=? AND (schedule_jobs.schedule_revision<>excluded.schedule_revision OR schedule_jobs.plan_key<>excluded.plan_key)`,
        ).bind(
          a.id,
          account.id,
          account.name,
          a.applied_revision,
          d,
          at,
          policy.batchId,
          policy.key,
          a.id,
          account.id,
          d,
          policy.key,
          at,
        ),
      );
    }
    await env.DB.batch(mutations);
  }
  if (!requestedDay)
    await env.DB.prepare(
      "UPDATE automations SET planned_through=?,plan_scope=? WHERE id=? AND applied_revision=?",
    )
      .bind(through, scope, a.id, a.applied_revision)
      .run();
}

function rememberSlotEdit(env: Env, automationId: string, jobId: string) {
  return env.DB.prepare(
    `UPDATE schedule_day_plans SET plan=(SELECT json_group_array(json(CASE WHEN json_extract(value,'$.id')=j.id THEN json_set(value,'$.at',j.planned_at,'$.removed',CASE WHEN j.status='cancelled' AND j.detail='Removed from this day' THEN 1 ELSE 0 END) ELSE value END)) FROM json_each(plan))
    FROM schedule_jobs j WHERE j.id=? AND j.automation_id=? AND schedule_day_plans.automation_id=j.automation_id AND schedule_day_plans.account_id=j.account_id AND schedule_day_plans.local_day=j.local_day AND schedule_day_plans.plan_key=j.plan_key`,
  ).bind(jobId, automationId);
}
export function pendingPlanChanges(
  env: Env,
  previous: Automation,
  configText: string,
  revision: number,
  at = now(),
  operation?: string,
) {
  const old = JSON.parse(previous.applied_config || "{}"),
    next = JSON.parse(configText);
  const key = (config: any, account: any) =>
    JSON.stringify({
      zone: config.timeZone,
      name: account.name,
      username: account.username,
      connection: account.connection,
      on: account.on,
      count: account.pinsPerDay,
      cap: account.legacyDailyCap,
      schedule: account.schedule
        ? {
            mode: account.schedule.mode,
            start: account.schedule.start,
            end: account.schedule.end,
            minSpacing: account.schedule.minSpacing,
            spacingMode: account.schedule.spacingMode,
            times: [...account.schedule.times].sort(),
          }
        : [...account.hours].sort((a: number, b: number) => a - b),
    });
  const keep = (next.accounts || [])
    .filter((account: any) => {
      const before = old.accounts?.find((a: any) => a.id === account.id);
      return account.on && before && key(old, before) === key(next, account);
    })
    .map((a: any) => a.id);
  const prepared = (sql: string, ...values: any[]) =>
    env.DB.prepare(
      sql +
        (operation
          ? " AND EXISTS(SELECT 1 FROM automations guard WHERE guard.id=? AND guard.operation_id=? AND guard.applied_revision=?)"
          : ""),
    ).bind(...values, ...(operation ? [previous.id, operation, revision] : []));
  return [
    prepared(
      "UPDATE schedule_jobs SET schedule_revision=? WHERE automation_id=? AND (status='pending' OR (status='cancelled' AND detail='Removed from this day')) AND planned_at>=? AND schedule_revision=? AND account_id IN(SELECT value FROM json_each(?))",
      revision,
      previous.id,
      at,
      previous.applied_revision,
      JSON.stringify(keep),
    ),
    prepared(
      "UPDATE schedule_jobs SET status='cancelled' WHERE automation_id=? AND status IN('pending','dispatched','claimed') AND schedule_revision<>?",
      previous.id,
      revision,
    ),
    prepared(
      "UPDATE automations SET planned_through=NULL WHERE id=?",
      previous.id,
    ),
  ];
}
export async function dispatchAutomation(env: Env, a: ScheduledAutomation) {
  if (
    !["running", "paused"].includes(a.status) ||
    !a.scheduler_enabled ||
    !a.seed_run_id ||
    !a.flow_id
  )
    return false;
  const operation = id(),
    at = now();
  const got = await env.DB.prepare(
    "UPDATE automations SET operation_id=?,operation_started_at=? WHERE id=? AND status=? AND (operation_id IS NULL OR operation_started_at<?) RETURNING id",
  )
    .bind(operation, at, a.id, a.status, at - 180)
    .first();
  if (!got) return false;
  try {
    const { integration, key } = await getIntegration(env, a.user_id, a);
    const remote = await ap(key, `/flows/${encodeURIComponent(a.flow_id)}`);
    if (
      remote.status !== (a.status === "paused" ? "DISABLED" : "ENABLED") ||
      remote.publishedVersionId !== a.flow_version_id ||
      (remote.version?.id && remote.version.id !== a.flow_version_id)
    ) {
      await env.DB.prepare(
        "UPDATE automations SET status='problem',error_code='external_change' WHERE id=?",
      )
        .bind(a.id)
        .run();
      return false;
    }
    const inflight = await env.DB.prepare(
      "SELECT id FROM schedule_jobs WHERE automation_id=? AND status IN('dispatched','claimed','started') LIMIT 1",
    )
      .bind(a.id)
      .first();
    if (inflight) return false;
    const due = (
      await env.DB.prepare(
        "SELECT * FROM schedule_jobs WHERE automation_id=? AND status='pending' AND planned_at<=? AND planned_at>=? AND schedule_revision=? ORDER BY planned_at,id LIMIT 100",
      )
        .bind(a.id, at, at - 300, a.applied_revision)
        .all<any>()
    ).results;
    const eligible =
      a.status === "paused" ? due.filter((j) => j.account_id === "_sync") : due;
    const selected = eligible.filter(
      (j, i) => eligible.findIndex((x) => x.account_id === j.account_id) === i,
    );
    if (!selected.length) return false;
    const ids = JSON.stringify(selected.map((j) => j.id));
    await env.DB.prepare(
      "UPDATE schedule_jobs SET status='dispatched',started_at=? WHERE id IN(SELECT value FROM json_each(?)) AND status='pending'",
    )
      .bind(at, ids)
      .run();
    try {
      const run = await ap(
        key,
        `/flow-runs/${encodeURIComponent(a.seed_run_id)}/retry`,
        "POST",
        { projectId: integration.project_id, strategy: "ON_LATEST_VERSION" },
      );
      if (!run?.id) throw Error("run_unconfirmed");
      await env.DB.prepare(
        "UPDATE schedule_jobs SET remote_run_id=? WHERE id IN(SELECT value FROM json_each(?))",
      )
        .bind(run.id, ids)
        .run();
      return true;
    } catch {
      // A lost provider response can still have started execution. Hold; never dispatch it twice.
      await env.DB.prepare(
        "UPDATE schedule_jobs SET status='review',detail='Execution could not be confirmed. Check Activity before creating another attempt.' WHERE id IN(SELECT value FROM json_each(?)) AND status IN('dispatched','claimed')",
      )
        .bind(ids)
        .run();
      return false;
    }
  } finally {
    await env.DB.prepare(
      "UPDATE automations SET operation_id=NULL WHERE id=? AND operation_id=?",
    )
      .bind(a.id, operation)
      .run();
  }
}
export async function tick(env: Env) {
  const at = now();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE schedule_jobs SET status='missed',detail='Missed slot; no catch-up burst' WHERE status='pending' AND planned_at<?",
    ).bind(at - 300),
    env.DB.prepare(
      "UPDATE schedule_jobs SET status='review',detail='Execution did not finish; reconcile Pinterest before retrying' WHERE status IN('dispatched','claimed','started') AND started_at<?",
    ).bind(at - 900),
  ]);
  await env.DB.prepare(
    "UPDATE queue_commands SET status='conflict',detail='Sync was interrupted. Check the Sheet and refresh before making another change.' WHERE status='processing' AND started_at<?",
  )
    .bind(at - 900)
    .run();
  const automations = (
    await env.DB.prepare(
      "SELECT * FROM automations WHERE scheduler_enabled=1 AND status='running' AND archived_at IS NULL AND user_id IN(SELECT id FROM users WHERE status='active') LIMIT 500",
    ).all<ScheduledAutomation>()
  ).results;
  let dispatched = 0;
  for (const a of automations) {
    try {
      await ensurePlan(env, a);
      if (await dispatchAutomation(env, a)) dispatched++;
    } catch {
      /* One unavailable provider cannot stop the other members. */
    }
  }
  return { checked: automations.length, dispatched };
}
export const dispatcher = new Hono<AppEnv>();
dispatcher.post("/tick", async (c) => {
  if (
    !c.env.DISPATCH_KEY ||
    (await hash(c.req.header("Authorization") || "")) !==
      (await hash(`Bearer ${c.env.DISPATCH_KEY}`))
  )
    return c.notFound();
  return c.json(await tick(c.env));
});
export const scheduleCallbacks = new Hono<AppEnv>();
scheduleCallbacks.use("/:id/:token/*", async (c, next) => {
  const a = await c.env.DB.prepare(
    "SELECT * FROM automations WHERE id=? AND callback_hash=? AND archived_at IS NULL AND user_id IN(SELECT id FROM users WHERE status='active')",
  )
    .bind(c.req.param("id"), await hash(c.req.param("token")!))
    .first<ScheduledAutomation>();
  if (!a) return c.notFound();
  c.set("scheduled" as any, a);
  await next();
});
const current = (c: any) => c.get("scheduled") as ScheduledAutomation;
scheduleCallbacks.post("/:id/:token/claim", async (c) => {
  const a = current(c),
    at = now();
  if (!a.scheduler_enabled || !["running", "paused"].includes(a.status))
    return c.json({ jobs: [], commands: [] });
  const token = randomToken();
  const jobs = (
    await c.env.DB.prepare(
      "UPDATE schedule_jobs SET status='claimed',lease_token=? WHERE automation_id=? AND status='dispatched' AND schedule_revision=? AND planned_at>=? AND (?='running' OR account_id='_sync') RETURNING id,account_id,account_name",
    )
      .bind(token, a.id, a.applied_revision, at - 300, a.status)
      .all<any>()
  ).results;
  const commands = (
    await c.env.DB.prepare(
      "UPDATE queue_commands SET status='processing',started_at=? WHERE id IN(SELECT id FROM queue_commands WHERE automation_id=? AND status='pending' ORDER BY created_at LIMIT 50) RETURNING id,account_id,pin_id,expected,patch",
    )
      .bind(now(), a.id)
      .all<any>()
  ).results;
  return c.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      accountId: j.account_id,
      name: j.account_name,
      token,
    })),
    commands: commands.map((cmd) => ({
      ...cmd,
      expected: JSON.parse(cmd.expected),
      patch: JSON.parse(cmd.patch),
    })),
  });
});
scheduleCallbacks.post("/:id/:token/authorize", async (c) => {
  const a = current(c),
    { id: jobId, token } = z
      .object({ id: z.uuid(), token: z.string().max(100) })
      .parse(await c.req.json());
  if (a.status !== "running" || !a.scheduler_enabled)
    return c.json({ allowed: false });
  const job = await c.env.DB.prepare(
    "UPDATE schedule_jobs SET status='started',started_at=? WHERE id=? AND automation_id=? AND status='claimed' AND lease_token=? AND schedule_revision=? RETURNING id,account_id,local_day,batch_id,origin",
  )
    .bind(now(), jobId, a.id, token, a.applied_revision)
    .first();
  let dailyCap: number | undefined;
  let batchPolicy: any = null;
  if (job && (a as any).batch_schedule_enabled) {
    const policies = await batchPolicies(c.env, a),
      policy = policies.find((p: any) => p.accountId === job.account_id);
    if (policy) {
      const chosen =
        job.batch_id &&
        policy.overrides.find((o: any) => o.batchId === job.batch_id);
      dailyCap = chosen
        ? chosen.pinsPerDay
        : JSON.parse(a.applied_config || a.config).accounts.find(
            (p: any) => p.id === job.account_id,
          )?.legacyDailyCap ||
          JSON.parse(a.applied_config || a.config).accounts.find(
            (p: any) => p.id === job.account_id,
          )?.pinsPerDay;
      batchPolicy = {
        batchId: job.batch_id || "",
        excludedBatches: policy.overrides.map((p: any) => p.batchId),
      };
    }
  }
  if (job && !batchPolicy && (a as any).day_slots_enabled) {
    const config = JSON.parse(a.applied_config || a.config),
      account = config.accounts.find((p: any) => p.id === job.account_id);
    if (account) {
      const count = await c.env.DB.prepare(
        "SELECT COUNT(*) AS n FROM schedule_jobs WHERE automation_id=? AND account_id=? AND local_day=? AND status NOT IN('cancelled','missed','skipped') AND origin='scheduled'",
      )
        .bind(a.id, job.account_id, job.local_day)
        .first<any>();
      dailyCap = Math.min(
        1440,
        Math.max(account.legacyDailyCap || account.pinsPerDay, count.n),
      );
    }
  }
  return c.json({
    allowed: Boolean(job),
    ...(dailyCap ? { dailyCap } : {}),
    ...(batchPolicy ? { batchPolicy } : {}),
  });
});
scheduleCallbacks.post("/:id/:token/finish", async (c) => {
  const a = current(c),
    body = z
      .object({
        id: z.uuid(),
        token: z.string().max(100),
        outcome: z.string().max(300),
      })
      .parse(await c.req.json());
  await c.env.DB.prepare(
    "UPDATE schedule_jobs SET status=?,finished_at=?,detail=? WHERE id=? AND automation_id=? AND lease_token=? AND status IN('started','claimed')",
  )
    .bind(
      body.outcome === "published"
        ? "completed"
        : body.outcome.includes("review") || body.outcome === "error"
          ? "review"
          : "finished",
      now(),
      body.outcome,
      body.id,
      a.id,
      body.token,
    )
    .run();
  return c.json({ ok: true });
});
const pinSchema = z.object({
  id: z.string().max(100),
  status: z.enum([
    "Draft",
    "Ready",
    "Posting",
    "Done",
    "Error",
    "Needs review",
    "Skip",
    "Unknown",
  ]),
  title: z.string().max(500),
  description: z.string().max(3000),
  link: z.string().max(2048),
  media: z.string().max(2000),
  board: z.string().max(300),
  batch: z.string().max(100),
  pinUrl: z.string().max(300),
  postedAt: z.string().max(100),
  rowNumber: z.number().int().min(2).max(10001).optional(),
  publishAfter: z.string().max(100).nullable().optional(),
  productPaused: z.boolean().optional(),
  error: z.string().max(1000),
});
scheduleCallbacks.post("/:id/:token/snapshot", async (c) => {
  const a = current(c),
    body = z
      .object({
        accounts: z
          .array(
            z.object({
              name: z.string().max(80),
              complete: z.boolean(),
              counts: z.record(z.string(), z.number().int().nonnegative()),
              batchReady: z
                .record(z.string().max(100), z.number().int().min(0).max(5000))
                .optional(),
              pins: z.array(pinSchema).max(500),
              health: z.string().max(300).optional(),
              lastRun: z.string().max(100).optional(),
              lastPost: z.string().max(100).optional(),
            }),
          )
          .max(20),
        commands: z
          .array(
            z.object({
              id: z.uuid(),
              ok: z.boolean(),
              detail: z.string().max(300),
            }),
          )
          .max(50)
          .default([]),
      })
      .parse(await c.req.json());
  const config = JSON.parse(a.applied_config || a.config);
  const writes = [];
  for (const data of body.accounts) {
    const account = config.accounts.find((x: any) => x.name === data.name);
    if (!account) continue;
    writes.push(
      c.env.DB.prepare(
        "INSERT INTO queue_snapshots VALUES(?,?,?,?,?) ON CONFLICT(automation_id,account_id) DO UPDATE SET data=excluded.data,synced_at=excluded.synced_at,complete=excluded.complete",
      ).bind(
        a.id,
        account.id,
        JSON.stringify(data),
        now(),
        data.complete ? 1 : 0,
      ),
    );
  }
  for (const cmd of body.commands)
    writes.push(
      c.env.DB.prepare(
        "UPDATE queue_commands SET status=?,finished_at=?,detail=? WHERE id=? AND automation_id=? AND status='processing'",
      ).bind(cmd.ok ? "applied" : "conflict", now(), cmd.detail, cmd.id, a.id),
    );
  if (writes.length) await c.env.DB.batch(writes);
  if (a.scheduler_enabled && ["running", "paused"].includes(a.status))
    await ensurePlan(c.env, a);
  return c.json({ ok: true });
});
export const queue = new Hono<AppEnv>();
queue.get("/:id/queue", async (c) => {
  const a = (await owned(c)) as ScheduledAutomation;
  if (a.scheduler_enabled && ["running", "paused"].includes(a.status))
    await ensurePlan(c.env, a);
  const config = JSON.parse(a.applied_config || a.config),
    today = localDay(now(), config.timeZone || "UTC"),
    day = c.req.query("day") || today;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(day + "T12:00:00Z")) ||
    new Date(day + "T12:00:00Z").toISOString().slice(0, 10) !== day ||
    day < nextDay(today, -30) ||
    day > nextDay(today, 30)
  )
    throw new PublicError("day", "Choose a date within 30 days of today.");
  if (
    a.scheduler_enabled &&
    day >= today &&
    ["running", "paused"].includes(a.status)
  )
    await ensurePlan(c.env, a, now(), day);
  const daySlots = (
    await c.env.DB.prepare(
      "SELECT id,account_id,planned_at,status,detail,origin FROM schedule_jobs WHERE automation_id=? AND local_day=? AND account_id<>'_sync' ORDER BY planned_at",
    )
      .bind(a.id, day)
      .all()
  ).results;
  const snapshots = (
    await c.env.DB.prepare(
      "SELECT * FROM queue_snapshots WHERE automation_id=?",
    )
      .bind(a.id)
      .all<any>()
  ).results;
  const schedule = (
    await c.env.DB.prepare(
      "SELECT id,account_id,planned_at,status,detail,batch_id FROM schedule_jobs WHERE automation_id=? AND ((planned_at>=? AND status='pending') OR status='review') ORDER BY planned_at LIMIT 300",
    )
      .bind(a.id, now())
      .all()
  ).results;
  const commands = (
    await c.env.DB.prepare(
      "SELECT id,pin_id,status,detail FROM queue_commands WHERE automation_id=? ORDER BY created_at DESC LIMIT 100",
    )
      .bind(a.id)
      .all()
  ).results;
  const recent = (
    await c.env.DB.prepare(
      "SELECT id,account_id,planned_at,status,detail,started_at,finished_at FROM schedule_jobs WHERE automation_id=? AND planned_at>=? AND status NOT IN('pending','skipped') ORDER BY planned_at DESC LIMIT 60",
    )
      .bind(a.id, now() - 3 * 86400)
      .all()
  ).results;
  return c.json({
    schedulerEnabled: Boolean(a.scheduler_enabled),
    daySlotsEnabled: Boolean((a as any).day_slots_enabled),
    batchSchedules: await batchPolicies(c.env, a),
    day,
    daySlots,
    recent,
    snapshots: snapshots.map((s) => ({
      accountId: s.account_id,
      ...JSON.parse(s.data),
      syncedAt: s.synced_at,
      complete: Boolean(s.complete),
    })),
    schedule,
    commands,
  });
});
queue.put("/:id/accounts/:accountId/batch-schedule", async (c) => {
  const a = await owned(c),
    accountId = c.req.param("accountId");
  if (a.operation_id || !["running", "paused"].includes(a.status))
    throw new PublicError(
      "busy",
      "Wait for the current update to finish.",
      409,
    );
  const body = z
    .object({
      batchId: z.string().trim().min(1).max(100),
      posting: batchPostingSchema.nullable(),
    })
    .parse(await c.req.json());
  const config = JSON.parse(a.applied_config || a.config);
  if (!config.accounts.some((p: any) => p.id === accountId))
    return c.notFound();
  const snap = await c.env.DB.prepare(
    "SELECT data FROM queue_snapshots WHERE automation_id=? AND account_id=?",
  )
    .bind(a.id, accountId)
    .first<any>();
  const known = await c.env.DB.prepare(
    "SELECT id FROM batches WHERE automation_id=? AND account_id=? AND id=?",
  )
    .bind(a.id, accountId, body.batchId)
    .first();
  if (
    !known &&
    !JSON.parse(snap?.data || '{"pins":[]}').pins.some(
      (p: any) => p.batch === body.batchId,
    )
  )
    throw new PublicError(
      "batch",
      "Sync the queue and choose a saved batch.",
      409,
    );
  if (body.posting)
    await saveBatchSchedule(c.env, a.id, accountId, body.batchId, body.posting);
  else
    await c.env.DB.prepare(
      "DELETE FROM batch_schedules WHERE automation_id=? AND account_id=? AND batch_id=?",
    )
      .bind(a.id, accountId, body.batchId)
      .run();
  await ensurePlan(c.env, a as ScheduledAutomation);
  return c.json({
    saved: true,
    needsUpdate: Boolean(body.posting && !(a as any).batch_schedule_enabled),
  });
});
queue.post("/:id/queue/schedule", async (c) => {
  const a = (await owned(c)) as ScheduledAutomation;
  const body = z
    .object({
      requestId: z.uuid(),
      accountId: z.string().max(80),
      time: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    })
    .parse(await c.req.json());
  if (!(a as any).day_slots_enabled)
    throw new PublicError(
      "day_update",
      "Update this automation once to enable extra day slots.",
      409,
    );
  if (
    !a.scheduler_enabled ||
    !["running", "paused"].includes(a.status) ||
    a.operation_id
  )
    throw new PublicError(
      "schedule_busy",
      "Finish the current update before adding a time.",
      409,
    );
  const config = JSON.parse(a.applied_config || a.config),
    account = config.accounts.find((p: any) => p.id === body.accountId);
  if (!account)
    throw new PublicError(
      "account",
      "Choose an account from this automation.",
      404,
    );
  const [day, clock] = body.time.split("T"),
    [h, m] = clock.split(":").map(Number);
  if (
    h > 23 ||
    m > 59 ||
    !Number.isFinite(Date.parse(day + "T12:00:00Z")) ||
    new Date(day + "T12:00:00Z").toISOString().slice(0, 10) !== day
  )
    throw new PublicError("time", "Choose a valid date and time.");
  const target = utcFor(day, h * 60 + m, config.timeZone);
  const existing = await c.env.DB.prepare(
    "SELECT id,automation_id,account_id,planned_at,status FROM schedule_jobs WHERE id=?",
  )
    .bind(body.requestId)
    .first<any>();
  if (existing) {
    if (
      existing.automation_id !== a.id ||
      existing.account_id !== body.accountId ||
      existing.status === "cancelled" ||
      existing.planned_at !== target
    )
      throw new PublicError(
        "conflict",
        "Refresh before adding another time.",
        409,
      );
    return c.json({ saved: true });
  }
  if (target === null || target < now() + 60 || target > now() + 30 * 86400)
    throw new PublicError(
      "time",
      "Choose a future time, at least one minute away and within 30 days.",
    );
  await ensurePlan(c.env, a, now(), day);
  const gap = Math.max(1, account.schedule?.minSpacing || 1) * 60;
  await rateLimit(c, `day-add:${a.id}`, 30, 600);
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      "DELETE FROM schedule_jobs WHERE automation_id=? AND account_id=? AND planned_at=? AND status='cancelled'",
    ).bind(a.id, body.accountId, target),
    c.env.DB.prepare(
      "INSERT INTO schedule_jobs(id,automation_id,account_id,account_name,schedule_revision,planned_at,local_day,status,detail) SELECT ?,?,?,?,?,?,?,'pending','Added for this day' WHERE EXISTS(SELECT 1 FROM automations WHERE id=? AND applied_revision=? AND operation_id IS NULL AND status IN('running','paused')) AND NOT EXISTS(SELECT 1 FROM schedule_jobs WHERE automation_id=? AND account_id=? AND status NOT IN('cancelled','missed','skipped') AND ABS(planned_at-?)<?) ON CONFLICT(id) DO NOTHING RETURNING id",
    ).bind(
      body.requestId,
      a.id,
      body.accountId,
      account.name,
      a.applied_revision,
      target,
      day,
      a.id,
      a.applied_revision,
      a.id,
      body.accountId,
      target,
      gap,
    ),
  ]);
  if (!result[1].results.length) {
    const repeated = await c.env.DB.prepare(
      "SELECT id FROM schedule_jobs WHERE id=? AND automation_id=? AND account_id=? AND planned_at=?",
    )
      .bind(body.requestId, a.id, body.accountId, target)
      .first();
    if (repeated) return c.json({ saved: true, plannedAt: target });
    throw new PublicError(
      "slot_spacing",
      "This time conflicts with another slot or the schedule changed. Choose another minute or refresh.",
      409,
    );
  }
  return c.json({ saved: true, plannedAt: target });
});
queue.delete("/:id/queue/schedule/:jobId", async (c) => {
  const a = (await owned(c)) as ScheduledAutomation;
  const body = z
    .object({ expectedAt: z.number().int().positive() })
    .parse(await c.req.json());
  if (
    !a.scheduler_enabled ||
    a.operation_id ||
    !["running", "paused"].includes(a.status)
  )
    throw new PublicError(
      "schedule_busy",
      "Finish the current update before removing a time.",
      409,
    );
  const changed = c.env.DB.prepare(
    "UPDATE schedule_jobs SET status='cancelled',detail='Removed from this day' WHERE id=? AND automation_id=? AND status='pending' AND planned_at=? AND planned_at>? AND schedule_revision=? AND EXISTS(SELECT 1 FROM automations WHERE id=? AND applied_revision=? AND operation_id IS NULL AND status IN('running','paused')) RETURNING id",
  ).bind(
    c.req.param("jobId"),
    a.id,
    body.expectedAt,
    now(),
    a.applied_revision,
    a.id,
    a.applied_revision,
  );
  const edits = await c.env.DB.batch([
    changed,
    rememberSlotEdit(c.env, a.id, c.req.param("jobId")),
  ]);
  const result = edits[0].results[0];
  if (!result)
    throw new PublicError(
      "slot_changed",
      "This slot changed or started. Refresh the queue.",
      409,
    );
  return c.json({ saved: true });
});
queue.post("/:id/queue/schedule/:jobId", async (c) => {
  const a = (await owned(c)) as ScheduledAutomation;
  const body = z
    .object({
      expectedAt: z.number().int().positive(),
      time: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    })
    .parse(await c.req.json());
  if (
    !a.scheduler_enabled ||
    !["running", "paused"].includes(a.status) ||
    a.operation_id
  )
    throw new PublicError(
      "schedule_busy",
      "Finish the current schedule update before moving this slot.",
      409,
    );
  const job = await c.env.DB.prepare(
    "SELECT * FROM schedule_jobs WHERE id=? AND automation_id=?",
  )
    .bind(c.req.param("jobId"), a.id)
    .first<any>();
  if (!job)
    throw new PublicError("not_found", "This posting slot was not found.", 404);
  if (
    job.status !== "pending" ||
    job.planned_at !== body.expectedAt ||
    job.schedule_revision !== a.applied_revision ||
    job.planned_at <= now()
  )
    throw new PublicError(
      "slot_changed",
      "This slot already changed or started. Refresh the queue.",
      409,
    );
  const config = JSON.parse(a.applied_config || a.config),
    account = config.accounts.find((p: any) => p.id === job.account_id);
  if (!account)
    throw new PublicError(
      "account",
      "This account changed. Refresh its queue.",
      409,
    );
  const [day, clock] = body.time.split("T"),
    [hour, minute] = clock.split(":").map(Number);
  if (
    hour > 23 ||
    minute > 59 ||
    !Number.isFinite(Date.parse(day + "T12:00:00Z")) ||
    new Date(day + "T12:00:00Z").toISOString().slice(0, 10) !== day
  )
    throw new PublicError("time", "Choose a valid date and time.");
  const target = utcFor(day, hour * 60 + minute, config.timeZone);
  if (target === null || target < now() + 60 || target > now() + 31 * 86400)
    throw new PublicError(
      "time",
      "Choose a future time, at least one minute away and within 31 days.",
    );
  const gap = Math.max(1, account.schedule?.minSpacing || 1) * 60;
  const conflict = await c.env.DB.prepare(
    "SELECT id FROM schedule_jobs WHERE automation_id=? AND account_id=? AND id<>? AND status NOT IN('cancelled','missed','skipped') AND ABS(planned_at-?)<? LIMIT 1",
  )
    .bind(a.id, job.account_id, job.id, target, gap)
    .first();
  if (conflict)
    throw new PublicError(
      "slot_spacing",
      "This time is too close to another saved posting slot. Choose a different minute.",
      409,
    );
  if (day !== localDay(job.planned_at, config.timeZone))
    throw new PublicError(
      "slot_day",
      "Choose another time on this slot's day. Use Posting schedule for daily changes.",
      409,
    );
  await rateLimit(c, `move-slot:${a.id}`, 30, 600);
  const guard =
    "EXISTS(SELECT 1 FROM schedule_jobs j JOIN automations a ON a.id=j.automation_id WHERE j.id=? AND j.automation_id=? AND j.planned_at=? AND j.status='pending' AND j.planned_at>unixepoch() AND j.schedule_revision=a.applied_revision AND a.operation_id IS NULL AND a.status IN('running','paused'))";
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      "DELETE FROM schedule_jobs WHERE automation_id=? AND account_id=? AND planned_at=? AND status='cancelled' AND " +
        guard,
    ).bind(a.id, job.account_id, target, job.id, a.id, body.expectedAt),
    c.env.DB.prepare(
      "UPDATE schedule_jobs SET planned_at=?,local_day=?,detail=? WHERE id=? AND automation_id=? AND planned_at=? AND status='pending' AND schedule_revision=? AND " +
        guard +
        " AND NOT EXISTS(SELECT 1 FROM schedule_jobs other WHERE other.automation_id=? AND other.account_id=? AND other.id<>? AND other.status NOT IN('cancelled','missed','skipped') AND ABS(other.planned_at-?)<?) RETURNING id",
    ).bind(
      target,
      day,
      `Moved from ${job.planned_at}`,
      job.id,
      a.id,
      body.expectedAt,
      a.applied_revision,
      job.id,
      a.id,
      body.expectedAt,
      a.id,
      job.account_id,
      job.id,
      target,
      gap,
    ),
    rememberSlotEdit(c.env, a.id, job.id),
  ]);
  if (!result[1].results.length)
    throw new PublicError(
      "slot_changed",
      "This slot already changed or started. Refresh the queue.",
      409,
    );
  return c.json({ saved: true, plannedAt: target });
});
queue.post("/:id/queue/run", async (c) => {
  const a = (await owned(c)) as ScheduledAutomation;
  if (!a.scheduler_enabled)
    throw new PublicError(
      "schedule_update",
      "Update this automation to enable the new scheduling and queue controls.",
      409,
    );

  const body = z
    .object({
      requestId: z.uuid(),
      accountId: z.string().max(80),
      sync: z.boolean().default(false),
    })
    .parse(await c.req.json());
  if (a.status !== "running" && !(body.sync && a.status === "paused"))
    throw new PublicError(
      "paused",
      "Resume the automation before publishing.",
      409,
    );
  const config = JSON.parse(a.applied_config || a.config),
    account = config.accounts.find((x: any) => x.id === body.accountId && x.on);
  if (!account && !body.sync)
    throw new PublicError("account", "Choose an active Pinterest account.");
  await rateLimit(c, `manual:${a.id}`, 3, 300);
  const at = now();
  const policy = (await batchPolicies(c.env, a)).find(
    (p: any) => p.accountId === body.accountId,
  );
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO schedule_jobs(id,automation_id,account_id,account_name,schedule_revision,planned_at,local_day,status,detail,origin,batch_id) VALUES(?,?,?,?,?,?,?,'pending',?,?,?)",
  )
    .bind(
      body.requestId,
      a.id,
      body.sync ? "_sync" : account.id,
      body.sync ? "_sync" : account.name,
      a.applied_revision,
      at,
      localDay(at, config.timeZone),
      body.sync ? "sync" : "manual",
      body.sync ? "sync" : "manual",
      body.sync ? "" : policy?.batchId || "",
    )
    .run();
  await dispatchAutomation(c.env, a);
  return c.json({ accepted: true }, 202);
});
queue.post("/:id/queue/commands", async (c) => {
  const a = (await owned(c)) as ScheduledAutomation;
  if (!a.scheduler_enabled)
    throw new PublicError(
      "schedule_update",
      "Update this automation first.",
      409,
    );
  const body = z
    .object({
      requestId: z.uuid(),
      accountId: z.string().max(80),
      pinId: z.string().min(1).max(100),
      patch: z.object({
        status: z.enum(["Draft", "Ready", "Skip"]).optional(),
        title: z.string().trim().min(1).max(100).optional(),
        description: z.string().max(800).optional(),
        link: z.string().max(2048).optional(),
      }),
    })
    .parse(await c.req.json());
  const snap = await c.env.DB.prepare(
    "SELECT data,synced_at FROM queue_snapshots WHERE automation_id=? AND account_id=?",
  )
    .bind(a.id, body.accountId)
    .first<any>();
  if (!snap || snap.synced_at < now() - 900)
    throw new PublicError(
      "stale_queue",
      "Refresh the queue before changing a pin.",
      409,
    );
  const pin = JSON.parse(snap.data).pins.find((p: any) => p.id === body.pinId);
  if (!pin || ["Posting", "Done"].includes(pin.status) || pin.pinUrl)
    throw new PublicError(
      "pin",
      "Only unposted pins can be changed here.",
      409,
    );
  if (!Object.keys(body.patch).length)
    throw new PublicError("empty", "There are no changes to save.");
  await rateLimit(c, `queue-edit:${a.id}`, 30, 600);
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO queue_commands(id,automation_id,account_id,pin_id,expected,patch,created_at) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(
      body.requestId,
      a.id,
      body.accountId,
      body.pinId,
      JSON.stringify(pin),
      JSON.stringify(body.patch),
      now(),
    )
    .run();
  return c.json(
    {
      accepted: true,
      message:
        "Saved for the next sync. Refresh the queue to apply and confirm.",
    },
    202,
  );
});
