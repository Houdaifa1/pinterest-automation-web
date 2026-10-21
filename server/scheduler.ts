import { Hono } from "hono";
import { z } from "zod";
import { owned } from "./access";
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
export async function ensurePlan(env: Env, a: ScheduledAutomation, at = now()) {
  if (!a.scheduler_enabled || !a.applied_config) return;
  const config = JSON.parse(a.applied_config),
    today = localDay(at, config.timeZone),
    through = nextDay(today, 2);
  if (a.planned_through && a.planned_through >= through) return;
  const rows: any[] = [];
  for (const account of config.accounts.filter((x: any) => x.on)) {
    const schedule = scheduleSchema.parse(
      account.schedule || {
        mode: "fixed",
        times: account.hours.map(
          (h: number) => `${String(h).padStart(2, "0")}:00`,
        ),
        minSpacing: 1,
      },
    );
    for (let d = today; d < through; d = nextDay(d)) {
      const exists = await env.DB.prepare(
        "SELECT id FROM schedule_jobs WHERE automation_id=? AND account_id=? AND local_day=? AND schedule_revision=? AND detail IS NOT 'manual' LIMIT 1",
      )
        .bind(a.id, account.id, d, a.applied_revision)
        .first();
      if (exists) continue;
      for (const minute of dailyMinutes(schedule, account.pinsPerDay)) {
        const planned = utcFor(d, minute, config.timeZone);
        if (planned !== null)
          rows.push({
            id: id(),
            accountId: account.id,
            name: account.name,
            day: d,
            at: planned,
            status: planned < at ? "missed" : "pending",
          });
      }
    }
  }
  for (let start = 0; start < rows.length; start += 100) {
    await env.DB.prepare(
      `INSERT INTO schedule_jobs(id,automation_id,account_id,account_name,schedule_revision,planned_at,local_day,status) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.accountId'),json_extract(value,'$.name'),?,json_extract(value,'$.at'),json_extract(value,'$.day'),json_extract(value,'$.status') FROM json_each(?) WHERE true
       ON CONFLICT(automation_id,account_id,planned_at) DO UPDATE SET id=excluded.id,account_name=excluded.account_name,schedule_revision=excluded.schedule_revision,local_day=excluded.local_day,status=excluded.status,lease_token=NULL,started_at=NULL,finished_at=NULL,remote_run_id=NULL,detail=NULL
       WHERE schedule_jobs.status='cancelled' AND schedule_jobs.planned_at>=? AND schedule_jobs.schedule_revision<>excluded.schedule_revision`,
    )
      .bind(
        a.id,
        a.applied_revision,
        JSON.stringify(rows.slice(start, start + 100)),
        at,
      )
      .run();
  }
  await env.DB.prepare(
    "UPDATE automations SET planned_through=? WHERE id=? AND applied_revision=?",
  )
    .bind(through, a.id, a.applied_revision)
    .run();
}
export function pendingPlanChanges(
  env: Env,
  previous: Automation,
  configText: string,
  revision: number,
  at = now(),
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
  return [
    env.DB.prepare(
      "UPDATE schedule_jobs SET schedule_revision=? WHERE automation_id=? AND status='pending' AND planned_at>=? AND schedule_revision=? AND account_id IN(SELECT value FROM json_each(?))",
    ).bind(
      revision,
      previous.id,
      at,
      previous.applied_revision,
      JSON.stringify(keep),
    ),
    env.DB.prepare(
      "UPDATE schedule_jobs SET status='cancelled' WHERE automation_id=? AND status IN('pending','dispatched','claimed') AND schedule_revision<>?",
    ).bind(previous.id, revision),
    env.DB.prepare(
      "UPDATE automations SET planned_through=NULL WHERE id=?",
    ).bind(previous.id),
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
    "UPDATE schedule_jobs SET status='started',started_at=? WHERE id=? AND automation_id=? AND status='claimed' AND lease_token=? AND schedule_revision=? RETURNING id",
  )
    .bind(now(), jobId, a.id, token, a.applied_revision)
    .first();
  return c.json({ allowed: Boolean(job) });
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
              pins: z.array(pinSchema).max(500),
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
  return c.json({ ok: true });
});
export const queue = new Hono<AppEnv>();
queue.get("/:id/queue", async (c) => {
  const a = (await owned(c)) as ScheduledAutomation;
  const snapshots = (
    await c.env.DB.prepare(
      "SELECT * FROM queue_snapshots WHERE automation_id=?",
    )
      .bind(a.id)
      .all<any>()
  ).results;
  const schedule = (
    await c.env.DB.prepare(
      "SELECT id,account_id,planned_at,status,detail FROM schedule_jobs WHERE automation_id=? AND (planned_at>=? OR status='review') ORDER BY planned_at LIMIT 300",
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
  return c.json({
    schedulerEnabled: Boolean(a.scheduler_enabled),
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
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO schedule_jobs(id,automation_id,account_id,account_name,schedule_revision,planned_at,local_day,status,detail) VALUES(?,?,?,?,?,?,?,'pending',?)",
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
