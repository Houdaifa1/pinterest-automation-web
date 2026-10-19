import { Hono } from "hono";
import { z } from "zod";
import { template } from "../.build/engine";
import { buildWebsiteFlow } from "./flow-builder.mjs";
import { defaultState } from "../engine/panel/generator.js";
import { owned } from "./access";
import { verifiedBotChat } from "./telegram";
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
  applied_config: string | null;
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
  const google = resolve(config.google, "google");
  if (config.notifyEmail) {
    const gmail = resolve(config.gmail, "gmail");
    if (
      google.identity &&
      gmail.identity &&
      google.identity.toLowerCase() !== gmail.identity.toLowerCase()
    )
      throw new PublicError(
        "email_mismatch",
        "Google Sheets and Gmail use different accounts. Choose matching logins before starting.",
        409,
      );
  }
  config.google = google.external_id;
  delete config.telegramChat;
  if (config.notifyEmail)
    config.gmail = resolve(config.gmail, "gmail").external_id;
  if (config.notifyTelegram) {
    config.telegramChat = await verifiedBotChat(
      env,
      userId,
      a.id,
      config.telegram,
    );
    config.telegram = resolve(config.telegram, "telegram").external_id;
  }
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
  try {
    buildWebsiteFlow(template, config, a.id, a.name, "check", null);
  } catch {
    throw new PublicError(
      "setup_incomplete",
      "Choose at least one notification channel and finish your account settings before starting.",
      409,
    );
  }
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
  let a = raw as DeployAutomation;
  const operation = await lock(env, a);
  try {
    a = (await env.DB.prepare(
      "SELECT * FROM automations WHERE id=? AND user_id=?",
    )
      .bind(a.id, userId)
      .first<DeployAutomation>())!;
    if (["starting", "applying"].includes(a.status)) return { pending: true };
    const { integration, key } = await getIntegration(env, userId, a);
    await resolveConfig(env, userId, a, a.config);
    const config = JSON.parse(a.config);
    if (!config.accounts?.length)
      throw new PublicError(
        "accounts",
        "Connect a Pinterest account before starting.",
      );
    const selected = JSON.stringify(
      config.accounts.filter((x: any) => x.on).map((x: any) => x.connection),
    );
    await env.DB.prepare(
      `INSERT INTO profile_claims(user_id,connection_id,automation_id)
      SELECT ?,value,? FROM json_each(?) WHERE NOT EXISTS(
        SELECT 1 FROM profile_claims WHERE user_id=? AND automation_id<>?
        AND connection_id IN (SELECT value FROM json_each(?)))
      ON CONFLICT(user_id,connection_id) DO NOTHING`,
    )
      .bind(userId, a.id, selected, userId, a.id, selected)
      .run();
    const claimed = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM profile_claims WHERE user_id=? AND automation_id=? AND connection_id IN(SELECT value FROM json_each(?))`,
    )
      .bind(userId, a.id, selected)
      .first<{ n: number }>();
    if (claimed!.n !== JSON.parse(selected).length)
      throw new PublicError(
        "duplicate_profile",
        "This Pinterest profile belongs to another automation. Turn posting off there and apply that change first.",
        409,
      );
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
      "UPDATE automations SET status='running',bootstrap=0,applied_config=deploy_config,applied_revision=?,seed_run_id=?,last_run_id=NULL,sheet_url=?,error_code=NULL WHERE id=?",
    )
      .bind(a.target_revision, run.id, sheet, a.id)
      .run();
    const selected = JSON.parse(a.deploy_config!)
      .accounts.filter((x: any) => x.on)
      .map((x: any) => x.connection);
    await env.DB.prepare(
      "DELETE FROM profile_claims WHERE automation_id=? AND connection_id NOT IN(SELECT value FROM json_each(?))",
    )
      .bind(a.id, JSON.stringify(selected))
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
    if (
      (a as DeployAutomation).bootstrap ||
      ["starting", "applying"].includes(a.status)
    )
      throw new PublicError(
        "setup",
        "Wait for the current setup check to finish before changing the schedule.",
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
    let run;
    try {
      run = await ap(
        key,
        `/flow-runs/${encodeURIComponent(a.seed_run_id)}/retry`,
        "POST",
        { projectId: integration.project_id, strategy: "ON_LATEST_VERSION" },
      );
    } catch (e) {
      if (e instanceof PublicError && e.code === "service_not_found") {
        await c.env.DB.prepare(
          "UPDATE automations SET seed_run_id=NULL,status='problem',error_code='seed_expired' WHERE id=?",
        )
          .bind(a.id)
          .run();
        throw new PublicError(
          "seed_expired",
          "The first-run record expired. Open Summary and retry setup to restore Run now.",
          409,
        );
      }
      throw e;
    }
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
deployment.delete("/:id", async (c) => {
  const a = await owned(c);
  z.object({ confirm: z.literal(true) }).parse(await c.req.json());
  const operation = await lock(c.env, a);
  try {
    if (a.flow_id) {
      const { key } = await getIntegration(c.env, c.get("user").id, a);
      try {
        await ap(key, `/flows/${encodeURIComponent(a.flow_id)}`, "DELETE");
      } catch (e) {
        if (!(e instanceof PublicError && e.code === "service_not_found"))
          throw e;
      }
    }
    await c.env.DB.prepare(
      "DELETE FROM automations WHERE id=? AND user_id=? AND operation_id=?",
    )
      .bind(a.id, c.get("user").id, operation)
      .run();
    return c.json({ ok: true });
  } finally {
    await unlock(c.env, a, operation);
  }
});
callbacks.post("/:id/:token", async (c) => {
  const a = await c.env.DB.prepare(
    "SELECT * FROM automations WHERE id=? AND callback_hash=? AND user_id IN(SELECT id FROM users WHERE status='active')",
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
