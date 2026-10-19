import { Hono } from "hono";
import { z } from "zod";
import { template } from "../.build/engine";
import { buildWebsiteFlow } from "./flow-builder.mjs";
import { defaultState } from "../engine/panel/generator.js";
import { owned } from "./access";
import { ap, getIntegration, safeSheet, type Connection } from "./activepieces";
import {
  decrypt,
  encrypt,
  hash,
  id,
  now,
  PublicError,
  randomToken,
  rateLimit,
} from "./security";
import type { AppEnv, Automation, Env } from "./types";
interface DeployAutomation extends Automation {
  target_revision: number | null;
  deploy_config: string | null;
  flow_version_id: string | null;
  last_run_id: string | null;
  bootstrap: number;
  error_code: string | null;
  operation_started_at: number | null;
  callback_hash: string | null;
  encrypted_callback: string | null;
}
async function resolveConfig(
  env: Env,
  userId: string,
  a: Automation,
  configText: string,
) {
  const config = { ...defaultState(), ...JSON.parse(configText) };
  const rows = (
    await env.DB.prepare(
      "SELECT * FROM connections WHERE integration_id=? AND user_id=?",
    )
      .bind(a.integration_id, userId)
      .all<Connection>()
  ).results;
  const resolve = (value: string, service: string) => {
    const c = rows.find(
      (c) => c.id === value && c.service === service && c.status === "ACTIVE",
    );
    if (!c)
      throw new PublicError(
        "reconnect",
        "Check your saved connections before starting.",
        409,
      );
    return c;
  };
  config.google = resolve(config.google, "google").external_id;
  if (config.notifyEmail)
    config.gmail = resolve(config.gmail, "gmail").external_id;
  if (config.notifyTelegram)
    config.telegram = resolve(config.telegram, "telegram").external_id;
  config.accounts = config.accounts.map((account: any) => {
    const connection = resolve(account.connection, "pinterest");
    if (
      connection.identity.replace(/^@/, "").toLowerCase() !==
      account.username.toLowerCase()
    )
      throw new PublicError(
        "pinterest_identity",
        "Reconnect Pinterest so we can confirm the correct profile.",
        409,
      );
    return { ...account, connection: connection.external_id };
  });
  return config;
}
async function lock(env: Env, a: Automation) {
  const operation = id();
  const got = await env.DB.prepare(
    "UPDATE automations SET operation_id=?,operation_started_at=? WHERE id=? AND (operation_id IS NULL OR operation_started_at<?) RETURNING id",
  )
    .bind(operation, now(), a.id, now() - 180)
    .first();
  if (!got)
    throw new PublicError(
      "busy",
      "An action is already in progress. Refresh its status.",
      409,
    );
  return operation;
}
async function unlock(env: Env, a: Automation, operation: string) {
  await env.DB.prepare(
    "UPDATE automations SET operation_id=NULL WHERE id=? AND operation_id=?",
  )
    .bind(a.id, operation)
    .run();
}
async function publish(key: string, flowId: string) {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await ap(key, `/flows/${encodeURIComponent(flowId)}`, "POST", {
        type: "LOCK_AND_PUBLISH",
        request: {},
      });
    } catch (e) {
      last = e;
    }
    const current = await ap(key, `/flows/${encodeURIComponent(flowId)}`);
    if (
      current.publishedVersionId &&
      current.publishedVersionId === current.version?.id
    )
      return current;
  }
  throw (
    last ||
    new PublicError(
      "publish",
      "Publishing could not be confirmed. Refresh before trying again.",
      502,
    )
  );
}
async function install(
  env: Env,
  userId: string,
  a: DeployAutomation,
  key: string,
  configText: string,
  revision: number,
  bootstrapAt: string | null,
) {
  const state = await resolveConfig(env, userId, a, configText);
  let callback: string;
  if (a.encrypted_callback)
    callback = await decrypt(env, a.encrypted_callback, userId);
  else {
    callback = `${env.APP_ORIGIN}/api/callback/${a.id}/${randomToken()}`;
    await env.DB.prepare(
      "UPDATE automations SET callback_hash=?,encrypted_callback=? WHERE id=?",
    )
      .bind(
        await hash(callback.split("/").at(-1)!),
        await encrypt(env, callback, userId),
        a.id,
      )
      .run();
  }
  const flow = buildWebsiteFlow(
    template,
    state,
    a.id,
    a.name,
    `website-${a.id}-${revision}`,
    callback,
    bootstrapAt,
  );
  await ap(key, `/flows/${encodeURIComponent(a.flow_id!)}`, "POST", {
    type: "IMPORT_FLOW",
    request: {
      displayName: a.name,
      trigger: flow.trigger,
      schemaVersion: flow.schemaVersion,
    },
  });
  return publish(key, a.flow_id!);
}
export async function deploy(env: Env, userId: string, raw: Automation) {
  const a = raw as DeployAutomation;
  if (["starting", "applying"].includes(a.status)) return { pending: true };
  const { integration, key } = await getIntegration(env, userId, a);
  await resolveConfig(env, userId, a, a.config);
  const config = JSON.parse(a.config);
  if (!config.accounts?.length)
    throw new PublicError(
      "accounts",
      "Connect a Pinterest account before starting.",
    );
  const others = (
    await env.DB.prepare(
      "SELECT id,config FROM automations WHERE user_id=? AND id<>? AND flow_id IS NOT NULL",
    )
      .bind(userId, a.id)
      .all<{ id: string; config: string }>()
  ).results;
  if (
    others.some((other) =>
      JSON.parse(other.config).accounts?.some((account: any) =>
        config.accounts.some(
          (selected: any) =>
            selected.connection === account.connection &&
            selected.on &&
            account.on,
        ),
      ),
    )
  )
    throw new PublicError(
      "duplicate_profile",
      "This Pinterest profile is already active in another automation. Pause its posting there first.",
      409,
    );
  const operation = await lock(env, a);
  try {
    if (!a.flow_id) {
      const remoteName = `${a.name} · ${a.id.slice(0, 8)}`;
      const listed = await ap(
        key,
        `/flows?projectId=${encodeURIComponent(integration.project_id)}&limit=100`,
      );
      const matches = (listed.data || []).filter(
        (f: any) => f.version?.displayName === remoteName,
      );
      if (matches.length > 1)
        throw new PublicError(
          "duplicate_flow",
          "More than one setup flow was found. Pause setup and contact the owner.",
          409,
        );
      const flow =
        matches[0] ||
        (await ap(key, "/flows", "POST", {
          projectId: integration.project_id,
          displayName: remoteName,
        }));
      if (!flow?.id)
        throw new PublicError(
          "create",
          "The new flow could not be confirmed. Refresh before trying again.",
          502,
        );
      a.flow_id = flow.id;
      await env.DB.prepare("UPDATE automations SET flow_id=? WHERE id=?")
        .bind(a.flow_id, a.id)
        .run();
    }
    await env.DB.prepare(
      "UPDATE automations SET deploy_config=?,target_revision=?,error_code=NULL WHERE id=?",
    )
      .bind(a.config, a.revision, a.id)
      .run();
    let seed = a.seed_run_id;
    if (seed) {
      try {
        const run = await ap(key, `/flow-runs/${encodeURIComponent(seed)}`);
        if (run.flowId !== a.flow_id) seed = null;
      } catch (e) {
        if (e instanceof PublicError && e.code === "service_not_found")
          seed = null;
        else throw e;
      }
    }
    const bootstrap = !seed;
    const result = await install(
      env,
      userId,
      a,
      key,
      a.config,
      a.revision,
      bootstrap ? new Date(Date.now() + 180000).toISOString() : null,
    );
    await env.DB.prepare(
      "UPDATE automations SET flow_version_id=?,bootstrap=?,status=?,seed_run_id=? WHERE id=?",
    )
      .bind(
        result.publishedVersionId,
        bootstrap ? 1 : 0,
        bootstrap ? "starting" : "applying",
        seed,
        a.id,
      )
      .run();
    if (bootstrap) {
      await ap(key, `/flows/${encodeURIComponent(a.flow_id!)}`, "POST", {
        type: "CHANGE_STATUS",
        request: { status: "ENABLED" },
      });
    } else {
      const run = await ap(
        key,
        `/flow-runs/${encodeURIComponent(seed!)}/retry`,
        "POST",
        { projectId: integration.project_id, strategy: "ON_LATEST_VERSION" },
      );
      if (!run?.id)
        throw new PublicError(
          "run_unknown",
          "Check the latest run before starting another one.",
          409,
        );
      await env.DB.prepare("UPDATE automations SET last_run_id=? WHERE id=?")
        .bind(run.id, a.id)
        .run();
    }
    return { pending: true };
  } catch (error) {
    await env.DB.prepare(
      "UPDATE automations SET status='problem',error_code=? WHERE id=?",
    )
      .bind(error instanceof PublicError ? error.code : "deployment", a.id)
      .run();
    throw error;
  } finally {
    await unlock(env, a, operation);
  }
}
export async function reconcile(env: Env, userId: string, raw: Automation) {
  const a = raw as DeployAutomation;
  if (!["starting", "applying"].includes(a.status) || !a.flow_id)
    return { status: a.status };
  const { integration, key } = await getIntegration(env, userId, a);
  const list = await ap(
    key,
    `/flow-runs?projectId=${encodeURIComponent(integration.project_id)}&flowId=${encodeURIComponent(a.flow_id!)}&limit=25`,
  );
  const candidates = (list.data || []).filter(
    (r: any) => r.flowId === a.flow_id && r.flowVersionId === a.flow_version_id,
  );
  const run = a.last_run_id
    ? candidates.find((r: any) => r.id === a.last_run_id)
    : candidates.find((r: any) => r.status === "SUCCEEDED") || candidates[0];
  if (!run || ["RUNNING", "QUEUED", "PAUSED"].includes(run.status))
    return { status: a.status };
  if (run.status !== "SUCCEEDED") {
    await env.DB.prepare(
      "UPDATE automations SET status='problem',error_code='run_failed' WHERE id=?",
    )
      .bind(a.id)
      .run();
    return { status: "problem" };
  }
  const operation = await lock(env, a);
  try {
    const detail = await ap(key, `/flow-runs/${encodeURIComponent(run.id)}`);
    const sheet = safeSheet(detail);
    if (!sheet)
      throw new PublicError(
        "sheet",
        "The run finished, but its Google Sheet was not confirmed. Check the saved Google connection.",
        409,
      );
    if (a.bootstrap) {
      await ap(key, `/flows/${encodeURIComponent(a.flow_id!)}`, "POST", {
        type: "CHANGE_STATUS",
        request: { status: "DISABLED" },
      });
      await install(
        env,
        userId,
        a,
        key,
        a.deploy_config!,
        a.target_revision!,
        null,
      );
    }
    const flow = await ap(
      key,
      `/flows/${encodeURIComponent(a.flow_id!)}`,
      "POST",
      { type: "CHANGE_STATUS", request: { status: "ENABLED" } },
    );
    if (flow.status !== "ENABLED")
      throw new PublicError(
        "enable",
        "The posting schedule could not be confirmed. Refresh its status.",
        502,
      );
    await env.DB.prepare(
      "UPDATE automations SET status='running',bootstrap=0,applied_revision=?,seed_run_id=?,last_run_id=NULL,sheet_url=?,error_code=NULL WHERE id=?",
    )
      .bind(a.target_revision, run.id, sheet, a.id)
      .run();
    return { status: "running", sheetUrl: sheet };
  } finally {
    await unlock(env, a, operation);
  }
}
export const deployment = new Hono<AppEnv>();
deployment.post("/:id/deploy", async (c) => {
  const a = await owned(c);
  await rateLimit(c, `deploy:${a.id}`, 5, 300);
  return c.json(await deploy(c.env, c.get("user").id, a), 202);
});
deployment.post("/:id/reconcile", async (c) =>
  c.json(await reconcile(c.env, c.get("user").id, await owned(c))),
);
for (const action of ["pause", "resume"] as const)
  deployment.post(`/:id/${action}`, async (c) => {
    const a = await owned(c);
    if (!a.flow_id) throw new PublicError("deploy", "Finish setup first.", 409);
    if (action === "resume" && (a as DeployAutomation).bootstrap)
      throw new PublicError(
        "setup",
        "Finish the first-run check before resuming.",
        409,
      );
    const { key } = await getIntegration(c.env, c.get("user").id, a),
      operation = await lock(c.env, a);
    try {
      const status = action === "pause" ? "DISABLED" : "ENABLED";
      const remote = await ap(
        key,
        `/flows/${encodeURIComponent(a.flow_id!)}`,
        "POST",
        { type: "CHANGE_STATUS", request: { status } },
      );
      if (remote.status !== status)
        throw new PublicError(
          "status",
          "The change could not be confirmed. Refresh its status.",
          502,
        );
      await c.env.DB.prepare("UPDATE automations SET status=? WHERE id=?")
        .bind(action === "pause" ? "paused" : "running", a.id)
        .run();
      return c.json({ ok: true });
    } finally {
      await unlock(c.env, a, operation);
    }
  });
deployment.post("/:id/run", async (c) => {
  const a = await owned(c);
  if (a.status !== "running" || !a.seed_run_id)
    throw new PublicError(
      "first_run",
      "Wait for the first successful run before starting another.",
      409,
    );
  const { requestId } = z
    .object({ requestId: z.uuid() })
    .parse(await c.req.json());
  const existing = await c.env.DB.prepare(
    "SELECT status FROM operations WHERE id=? AND user_id=? AND automation_id=?",
  )
    .bind(requestId, c.get("user").id, a.id)
    .first();
  if (existing) return c.json({ pending: true }, 202);
  await rateLimit(c, `run:${a.id}`, 1, 60);
  const { integration, key } = await getIntegration(c.env, c.get("user").id, a),
    operation = await lock(c.env, a);
  try {
    await c.env.DB.prepare("INSERT INTO operations VALUES(?,?,?,?,?,?,?)")
      .bind(requestId, c.get("user").id, a.id, "run", "pending", null, now())
      .run();
    const run = await ap(
      key,
      `/flow-runs/${encodeURIComponent(a.seed_run_id)}/retry`,
      "POST",
      { projectId: integration.project_id, strategy: "ON_LATEST_VERSION" },
    );
    if (!run?.id)
      throw new PublicError(
        "run_unknown",
        "Check the latest run before starting another.",
        409,
      );
    await c.env.DB.prepare(
      "UPDATE operations SET status='started',remote_id=? WHERE id=?",
    )
      .bind(run.id, requestId)
      .run();
    return c.json({ started: true }, 202);
  } finally {
    await unlock(c.env, a, operation);
  }
});
export const callbacks = new Hono<AppEnv>();
callbacks.post("/:id/:token", async (c) => {
  const a = await c.env.DB.prepare(
    "SELECT * FROM automations WHERE id=? AND callback_hash=?",
  )
    .bind(c.req.param("id"), await hash(c.req.param("token")))
    .first<Automation>();
  if (!a) return c.notFound();
  await rateLimit(c, `callback:${a.id}`, 20, 3600);
  c.executionCtx.waitUntil(
    (async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const fresh = await c.env.DB.prepare(
            "SELECT * FROM automations WHERE id=?",
          )
            .bind(a.id)
            .first<Automation>();
          if (!fresh || !["starting", "applying"].includes(fresh.status)) break;
          await reconcile(c.env, a.user_id, fresh);
        } catch {
          /* The next status check resumes from the saved stage. */
        }
      }
    })(),
  );
  return c.json({ accepted: true }, 202);
});
