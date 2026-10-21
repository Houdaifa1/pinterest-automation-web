import { Hono } from "hono";
import { z } from "zod";
import { owned } from "./access";
import {
  ap,
  getIntegration,
  syncConnections,
  safeSheet,
  type Connection,
  type Integration,
} from "./activepieces";
import { configSchema } from "./config";
import { scheduleSchema } from "./schedule-plan";
import { decrypt, hash, id, now, PublicError, rateLimit } from "./security";
import type { AppEnv, Automation, Env } from "./types";

const uuid = /^[a-f0-9-]{36}$/;
export function readExistingFlow(
  flow: any,
  connections: Connection[],
  previous: any = {},
) {
  if (!flow.publishedVersionId || flow.version?.id !== flow.publishedVersionId)
    return null;
  const steps = new Map<string, any>();
  let step = flow.version?.trigger;
  for (let n = 0; step && n < 40; n++, step = step.nextAction)
    steps.set(step.name, step);
  const prepare = steps.get("step_3");
  const source = prepare?.settings?.sourceCode?.code || "";
  if (typeof source !== "string") return null;
  const marker = source.match(/const CONTROL_MARKER = 'control-sheet([^']*)';/);
  const root = source.match(/const ROOT_MARKER = 'root-folder([^']*)';/);
  if (!marker || !root || marker[1] !== root[1]) return null;
  const workspace = marker[1] ? marker[1].slice(1) : "";
  if (marker[1] && (marker[1][0] !== ":" || !uuid.test(workspace))) return null;
  let raw: any;
  try {
    raw =
      typeof prepare.settings.input.config === "string"
        ? JSON.parse(prepare.settings.input.config)
        : prepare.settings.input.config;
  } catch {
    return null;
  }
  if (
    !raw?.settings ||
    typeof raw.settings !== "object" ||
    !Array.isArray(raw.accounts) ||
    !raw.accounts.length ||
    raw.accounts.length > 20
  )
    return null;
  const resolve = (external: string, service: string) =>
    connections.find(
      (c) =>
        c.external_id === external &&
        c.service === service &&
        c.status === "ACTIVE",
    );
  const login = (name: string, service: string) =>
    resolve(steps.get(name)?.settings?.input?.connection_name, service);
  const google = login("step_1", "google"),
    gmail = login("step_2", "gmail"),
    telegram = login("step_tg", "telegram");
  if (
    !google ||
    (raw.settings.notifyEmail !== false && !gmail) ||
    (raw.settings.notifyTelegram && !telegram)
  )
    return null;
  const accounts = [];
  for (const a of raw.accounts) {
    if (
      !a ||
      !Array.isArray(a.hours) ||
      (a.on !== undefined && typeof a.on !== "boolean")
    )
      return null;
    const connection = resolve(a.connection, "pinterest");
    if (
      !connection ||
      !/^[A-Za-z0-9_]{1,30}$/.test(connection.identity.replace(/^@/, ""))
    )
      return null;
    const hours: number[] = [...new Set<number>(a.hours || [])];

    const before = previous.accounts?.find(
      (p: any) => p.connection === connection.id,
    );
    const niche = String(a.niche || "").slice(0, 300);
    const category = /crochet|knit|yarn/i.test(niche)
      ? "crochet"
      : /recipe|cook|food|kitchen/i.test(niche)
        ? "food"
        : "other";
    const schedule = scheduleSchema.safeParse(a.websiteSchedule);
    accounts.push({
      ...before,
      schedule: schedule.success ? schedule.data : undefined,
      id: before?.id || connection.id,
      name: a.name,
      username: connection.identity.replace(/^@/, ""),
      connection: connection.id,
      niche: /^General\b/i.test(niche)
        ? niche.match(/\((.*)\)$/)?.[1] || ""
        : niche,
      general: !niche || /^general\b/i.test(niche),
      category: before?.category || category,
      source: before?.source || "niche",
      website: before?.website || "",
      pinsPerProduct: before?.pinsPerProduct || 6,
      pinsPerDay: schedule.success ? a.dailyCap : hours.length,
      legacyDailyCap: a.dailyCap || hours.length,

      hours,
      on: a.on !== false,
    });
  }
  const parsed = configSchema.safeParse({
    ...raw.settings,
    google: google.id,
    gmail: gmail?.id || "",
    telegram: telegram?.id || "",
    botEmail: google.identity.includes("@") ? google.identity : "",
    accounts,
  });
  if (!parsed.success) return null;
  return {
    name: String(flow.version.displayName || "Pinterest automation")
      .replace(/autopilot/gi, "Automation")
      .slice(0, 60),
    config: parsed.data,
    workspace,
    executionEndpoint:
      typeof raw.settings.website === "string" ? raw.settings.website : null,
  };
}
async function providerFlows(key: string, projectId: string) {
  const result = await ap(
    key,
    `/flows?projectId=${encodeURIComponent(projectId)}&limit=100`,
  );
  if (!Array.isArray(result?.data))
    throw new PublicError(
      "discovery",
      "Your existing automations could not be checked. Try again.",
      502,
    );
  const flows = result.data.filter(
    (f: any) =>
      f.projectId === projectId &&
      typeof f.id === "string" &&
      f.publishedVersionId,
  );
  if (result.next || flows.length > 30)
    throw new PublicError(
      "discovery_limit",
      "This project has too many flows to check at once. Use a separate project for these automations.",
      409,
    );
  const published = [];
  for (const f of flows) {
    const current =
      f.version?.id === f.publishedVersionId
        ? f
        : await ap(
            key,
            `/flows/${encodeURIComponent(f.id)}?versionId=${encodeURIComponent(f.publishedVersionId)}`,
          );
    if (current.projectId === projectId) published.push(current);
  }
  return published;
}
async function connectionRows(env: Env, userId: string, integrationId: string) {
  return (
    await env.DB.prepare(
      "SELECT * FROM connections WHERE user_id=? AND integration_id=?",
    )
      .bind(userId, integrationId)
      .all<Connection>()
  ).results;
}
export const discovery = new Hono<AppEnv>();
discovery.get("/:id/discovery", async (c) => {
  const a = await owned(c),
    userId = c.get("user").id;
  await rateLimit(c, `discover:${a.id}`, 12, 600);
  const { integration, key } = await getIntegration(c.env, userId, a);
  const connections = await syncConnections(c.env, userId, integration, key);
  const rows = await connectionRows(c.env, userId, integration.id);
  const flows = await providerFlows(key, integration.project_id);
  const choices = [];
  for (const flow of flows) {
    const parsed = readExistingFlow(flow, rows, JSON.parse(a.config));
    if (!parsed) continue;
    const bound = await c.env.DB.prepare(
      "SELECT automation_id,user_id FROM flow_bindings WHERE project_id=? AND flow_id=?",
    )
      .bind(integration.project_id, flow.id)
      .first<{ automation_id: string; user_id: string }>();
    if (bound && bound.user_id !== userId) continue;
    choices.push({
      choice: await hash(a.id + ":" + flow.id),
      name: parsed.name,
      config: parsed.config,
      status: flow.status === "ENABLED" ? "running" : "paused",
      websiteAutomationId: bound?.automation_id || null,
    });
  }
  choices.sort(
    (a, b) => Number(b.status === "running") - Number(a.status === "running"),
  );
  return c.json({
    connections,
    flows: choices,
    connectionsUrl: `https://cloud.activepieces.com/projects/${encodeURIComponent(integration.project_id)}/connections`,
  });
});
discovery.post("/:id/adopt", async (c) => {
  const a = await owned(c),
    userId = c.get("user").id;
  await rateLimit(c, `adopt:${a.id}`, 5, 600);
  if (a.flow_id)
    throw new PublicError(
      "already_connected",
      "This automation is already connected. Open Summary.",
      409,
    );
  const { choice } = z
    .object({ choice: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
    .parse(await c.req.json());
  const { integration, key } = await getIntegration(c.env, userId, a);
  await syncConnections(c.env, userId, integration, key);
  const rows = await connectionRows(c.env, userId, integration.id);
  const flows = await providerFlows(key, integration.project_id);
  let flow: any;
  for (const f of flows)
    if ((await hash(a.id + ":" + f.id)) === choice) flow = f;
  const parsed = flow && readExistingFlow(flow, rows, JSON.parse(a.config));
  if (!parsed)
    throw new PublicError(
      "existing_changed",
      "This automation changed. Check your saved automations again.",
      409,
    );
  await adoptFlow(c.env, userId, a, flow, parsed, key, integration);
  return c.json({ adopted: true });
});

async function adoptFlow(
  env: Env,
  userId: string,
  a: Automation,
  flow: any,
  parsed: NonNullable<ReturnType<typeof readExistingFlow>>,
  key: string,
  integration: Integration,
) {
  const runs = await ap(
    key,
    `/flow-runs?projectId=${encodeURIComponent(integration.project_id)}&flowId=${encodeURIComponent(flow.id)}&limit=25`,
  );
  const seed = (runs.data || []).find(
    (r: any) =>
      r.flowId === flow.id &&
      r.status === "SUCCEEDED" &&
      (!r.projectId || r.projectId === integration.project_id),
  );
  let sheet: string | null = null;
  if (seed) {
    const detail = await ap(key, `/flow-runs/${encodeURIComponent(seed.id)}`);
    if (detail.flowId === flow.id && detail.status === "SUCCEEDED")
      sheet = safeSheet(detail);
  }
  const config = JSON.stringify(parsed.config),
    revision = a.revision + 1;
  const statements = [
    env.DB.prepare(
      "INSERT INTO flow_bindings SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM automations WHERE id=? AND user_id=? AND revision=? AND flow_id IS NULL AND operation_id IS NULL)",
    ).bind(
      integration.project_id,
      flow.id,
      userId,
      a.id,
      a.id,
      userId,
      a.revision,
    ),
    env.DB.prepare(
      "UPDATE automations SET name=?,config=?,revision=?,applied_revision=?,applied_config=?,flow_id=?,flow_version_id=?,seed_run_id=?,sheet_url=?,workspace_id=?,status=?,setup_step=3,error_code=?,updated_at=? WHERE id=? AND user_id=? AND flow_id IS NULL AND operation_id IS NULL AND revision=?",
    ).bind(
      parsed.name,
      config,
      revision,
      revision,
      config,
      flow.id,
      flow.publishedVersionId,
      seed?.id || null,
      sheet,
      parsed.workspace,
      flow.status === "ENABLED" ? "running" : "paused",
      parsed.executionEndpoint ? "schedule_reconnect" : null,
      now(),
      a.id,
      userId,
      a.revision,
    ),
    env.DB.prepare(
      "INSERT INTO versions SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM automations WHERE id=? AND user_id=? AND revision=? AND flow_id=?)",
    ).bind(
      id(),
      userId,
      a.id,
      revision,
      config,
      now(),
      a.id,
      userId,
      revision,
      flow.id,
    ),
  ];
  for (const account of parsed.config.accounts.filter((p: any) => p.on))
    statements.push(
      env.DB.prepare(
        "INSERT INTO profile_claims SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM automations WHERE id=? AND user_id=? AND revision=? AND flow_id=?)",
      ).bind(userId, account.connection, a.id, a.id, userId, revision, flow.id),
    );
  try {
    const results = await env.DB.batch(statements);
    if (results[1].meta.changes !== 1) throw new Error("adoption_changed");
  } catch {
    throw new PublicError(
      "already_managed",
      "This flow or Pinterest profile is already managed here. Open its existing automation instead.",
      409,
    );
  }
}

async function savedFlows(env: Env, userId: string) {
  const integrations = (
    await env.DB.prepare("SELECT * FROM integrations WHERE user_id=?")
      .bind(userId)
      .all<Integration>()
  ).results;
  const found = [];
  for (const integration of integrations) {
    const key = await decrypt(env, integration.encrypted_key, userId);
    await syncConnections(env, userId, integration, key);
    const rows = await connectionRows(env, userId, integration.id);
    for (const flow of await providerFlows(key, integration.project_id)) {
      const parsed = readExistingFlow(flow, rows);
      if (!parsed) continue;
      const binding = await env.DB.prepare(
        "SELECT user_id,automation_id FROM flow_bindings WHERE project_id=? AND flow_id=?",
      )
        .bind(integration.project_id, flow.id)
        .first<{ user_id: string; automation_id: string }>();
      if (binding && binding.user_id !== userId) continue;
      found.push({
        choice: await hash(integration.id + ":" + flow.id),
        integration,
        key,
        flow,
        parsed,
        websiteId: binding?.automation_id || null,
      });
    }
  }
  return { found, needsKey: integrations.length === 0 };
}
export const existingSetups = new Hono<AppEnv>();
existingSetups.get("/", async (c) => {
  await rateLimit(c, `saved-flows:${c.get("user").id}`, 12, 600);
  const { found, needsKey } = await savedFlows(c.env, c.get("user").id);
  return c.json({
    needsKey,
    flows: found.map((f) => ({
      choice: f.choice,
      name: f.parsed.name,
      project: f.integration.platform_name,
      profiles: f.parsed.config.accounts.map((a) => a.username),
      status: f.flow.status === "ENABLED" ? "running" : "paused",
      websiteId: f.websiteId,
    })),
  });
});
existingSetups.post("/open", async (c) => {
  const userId = c.get("user").id;
  await rateLimit(c, `open-saved:${userId}`, 8, 600);
  const { choice } = z
    .object({ choice: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
    .parse(await c.req.json());
  const { found } = await savedFlows(c.env, userId),
    selected = found.find((f) => f.choice === choice);
  if (!selected)
    throw new PublicError(
      "existing_changed",
      "This automation changed. Refresh the list.",
      409,
    );
  if (selected.websiteId) return c.json({ id: selected.websiteId });
  const automationId = id();
  const created = await c.env.DB.prepare(
    "INSERT INTO automations(id,user_id,integration_id,name,created_at,updated_at,setup_intent) SELECT ?,?,?,?,?,?,'existing' WHERE (SELECT COUNT(*) FROM automations WHERE user_id=? AND archived_at IS NULL)<20 RETURNING *",
  )
    .bind(
      automationId,
      userId,
      selected.integration.id,
      selected.parsed.name,
      now(),
      now(),
      userId,
    )
    .first<Automation>();
  if (!created)
    throw new PublicError(
      "limit",
      "Remove an unused draft before adding another automation.",
      409,
    );
  try {
    await adoptFlow(
      c.env,
      userId,
      created,
      selected.flow,
      selected.parsed,
      selected.key,
      selected.integration,
    );
  } catch (error) {
    await c.env.DB.prepare(
      "UPDATE automations SET archived_at=? WHERE id=? AND user_id=? AND flow_id IS NULL",
    )
      .bind(now(), automationId, userId)
      .run();
    throw error;
  }
  return c.json({ id: automationId });
});

export async function existingTelegramSheet(
  env: Env,
  userId: string,
  a: Automation,
  connectionId: string,
  googleId: string,
) {
  const { integration, key } = await getIntegration(env, userId, a);
  const rows = await connectionRows(env, userId, integration.id);
  const sources = (await providerFlows(key, integration.project_id)).filter(
    (f) => {
      const existing = readExistingFlow(f, rows);
      return (
        existing?.config.notifyTelegram &&
        existing.config.telegram === connectionId &&
        existing.config.google === googleId
      );
    },
  );
  const sheets = new Set<string>();
  for (const source of sources.slice(0, 5)) {
    const runs = await ap(
      key,
      `/flow-runs?projectId=${encodeURIComponent(integration.project_id)}&flowId=${encodeURIComponent(source.id)}&limit=25`,
    );
    const successful = (runs.data || []).find(
      (r: any) => r.flowId === source.id && r.status === "SUCCEEDED",
    );
    if (!successful) continue;
    const run = await ap(
      key,
      `/flow-runs/${encodeURIComponent(successful.id)}`,
    );
    if (run.flowId !== source.id || run.status !== "SUCCEEDED") continue;
    const sheet = safeSheet(run);
    if (sheet) sheets.add(new URL(sheet).pathname.split("/")[3]);
  }
  if (sheets.size !== 1)
    throw new PublicError(
      "telegram_existing",
      "Choose your existing automation to keep its Telegram setup, or add a new bot in Notifications.",
      409,
    );
  return [...sheets][0];
}

export async function checkExistingProfiles(
  env: Env,
  userId: string,
  a: Automation,
  config: any,
) {
  const selected = new Set(
    config.accounts.filter((p: any) => p.on).map((p: any) => p.connection),
  );
  if (!selected.size) return;
  const { integration, key } = await getIntegration(env, userId, a);
  const rows = await connectionRows(env, userId, integration.id);
  for (const flow of await providerFlows(key, integration.project_id)) {
    if (flow.id === a.flow_id || flow.status !== "ENABLED") continue;
    const existing = readExistingFlow(flow, rows);
    if (
      existing?.config.accounts.some((p) => p.on && selected.has(p.connection))
    )
      throw new PublicError(
        "duplicate_profile",
        "This Pinterest account already has a running automation. Choose Use existing automation to update it, or pause it before starting a separate one.",
        409,
      );
  }
}
