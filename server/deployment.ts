import { Hono } from "hono";
import { z } from "zod";
import { template } from "../.build/engine";
import { buildWebsiteFlow } from "./flow-builder.mjs";
import { defaultState } from "../engine/panel/generator.js";
import { owned } from "./access";
import { pendingPlanChanges } from "./scheduler";
import { verifiedBotChat } from "./telegram";
import {
  existingTelegramSheet,
  checkExistingProfiles,
  readExistingFlow,
} from "./discovery";
import {
  ap,
  getIntegration,
  safeSheet,
  syncConnections,
  type Connection,
} from "./activepieces";
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
  resume_after_apply: number;
}
async function resolveConfig(
  env: Env,
  userId: string,
  a: Automation,
  configText: string,
) {
  const config = {
    ...defaultState(),
    ...JSON.parse(configText),
    websiteSchedule: Boolean(env.DISPATCH_KEY),
  };
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
  delete config.reuseTelegramRecipient;
  delete config.telegramRecipientSheet;
  if (config.notifyEmail)
    config.gmail = resolve(config.gmail, "gmail").external_id;
  if (config.notifyTelegram) {
    const applied = a.applied_config ? JSON.parse(a.applied_config) : null;
    if (
      a.sheet_url &&
      applied?.notifyTelegram &&
      applied.telegram === config.telegram &&
      applied.google === google.id
    )
      config.reuseTelegramRecipient = true;
    else {
      try {
        config.telegramChat = await verifiedBotChat(
          env,
          userId,
          a.id,
          config.telegram,
        );
      } catch (e) {
        if (!(e instanceof PublicError) || e.code !== "telegram_unverified")
          throw e;
        const googleId = JSON.parse(configText).google;
        const saved = await env.DB.prepare(
          "SELECT sheet_id FROM telegram_recipients WHERE automation_id=? AND user_id=? AND connection_id=? AND google_id=?",
        )
          .bind(a.id, userId, config.telegram, googleId)
          .first<{ sheet_id: string }>();
        config.telegramRecipientSheet =
          saved?.sheet_id ||
          (await existingTelegramSheet(
            env,
            userId,
            a,
            config.telegram,
            googleId,
          ));
        if (!saved)
          await env.DB.prepare(
            "INSERT INTO telegram_recipients VALUES(?,?,?,?,?) ON CONFLICT(automation_id) DO UPDATE SET connection_id=excluded.connection_id,google_id=excluded.google_id,sheet_id=excluded.sheet_id",
          )
            .bind(
              a.id,
              userId,
              config.telegram,
              googleId,
              config.telegramRecipientSheet,
            )
            .run();
      }
    }
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
    buildWebsiteFlow(
      template,
      config,
      a.id,
      a.name,
      "check",
      null,
      null,
      a.workspace_id ?? a.id,
    );
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
  maintenance = false,
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
    a.workspace_id ?? a.id,
    maintenance,
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
  if (!a.flow_id && (a as any).setup_intent === "existing")
    throw new PublicError(
      "existing_required",
      "Choose your existing Activepieces flow first. This setup cannot create a new flow. To start separately, choose Create new automation.",
      409,
    );
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
    if (a.flow_id && a.applied_revision > 0 && a.flow_version_id) {
      const remote = await ap(key, `/flows/${encodeURIComponent(a.flow_id)}`);
      if (
        remote.publishedVersionId !== a.flow_version_id ||
        remote.version?.id !== a.flow_version_id
      )
        throw new PublicError(
          "external_change",
          "This flow changed in Activepieces. Review its current version before updating it from the website.",
          409,
        );
    }
    const config = JSON.parse(a.config);
    await checkExistingProfiles(env, userId, a, config);
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
      "INSERT INTO flow_bindings VALUES(?,?,?,?) ON CONFLICT DO NOTHING",
    )
      .bind(integration.project_id, a.flow_id, userId, a.id)
      .run();
    const binding = await env.DB.prepare(
      "SELECT automation_id,user_id FROM flow_bindings WHERE project_id=? AND flow_id=?",
    )
      .bind(integration.project_id, a.flow_id)
      .first<{ automation_id: string; user_id: string }>();
    if (binding?.automation_id !== a.id || binding.user_id !== userId)
      throw new PublicError(
        "already_managed",
        "This flow is already managed by another automation.",
        409,
      );
    await env.DB.prepare(
      "UPDATE automations SET deploy_config=?,target_revision=?,resume_after_apply=?,error_code=NULL WHERE id=?",
    )
      .bind(
        a.config,
        a.revision,
        a.status === "paused"
          ? 0
          : a.status === "running"
            ? 1
            : a.resume_after_apply,
        a.id,
      )
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
      true,
    );
    await env.DB.prepare(
      "UPDATE automations SET flow_version_id=?,bootstrap=?,status=?,seed_run_id=?,scheduler_enabled=? WHERE id=?",
    )
      .bind(
        result.publishedVersionId,
        bootstrap ? 1 : 0,
        bootstrap ? "starting" : "applying",
        seed,
        env.DISPATCH_KEY ? 1 : 0,
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
async function refreshPublishedSettings(
  env: Env,
  userId: string,
  raw: DeployAutomation,
  discard = false,
) {
  const operation = await lock(env, raw);
  try {
    const a = await env.DB.prepare(
      "SELECT * FROM automations WHERE id=? AND user_id=?",
    )
      .bind(raw.id, userId)
      .first<DeployAutomation>();
    if (
      !a ||
      a.revision !== raw.revision ||
      ["starting", "applying"].includes(a.status)
    )
      throw new PublicError(
        "conflict",
        "Settings changed. Reload before refreshing Activepieces.",
        409,
      );
    if (!discard && a.revision !== a.applied_revision)
      throw new PublicError(
        "external_change",
        "Activepieces and this website both have changes. Choose which settings to keep.",
        409,
      );
    const { integration, key } = await getIntegration(env, userId, a);
    let remote = await ap(key, `/flows/${encodeURIComponent(a.flow_id!)}`);
    if (
      remote.version?.id !== remote.publishedVersionId &&
      remote.publishedVersionId
    )
      remote = await ap(
        key,
        `/flows/${encodeURIComponent(a.flow_id!)}?versionId=${encodeURIComponent(remote.publishedVersionId)}`,
      );
    await syncConnections(env, userId, integration, key);
    const rows = (
      await env.DB.prepare(
        "SELECT * FROM connections WHERE user_id=? AND integration_id=?",
      )
        .bind(userId, integration.id)
        .all<Connection>()
    ).results;
    const parsed =
      remote.projectId === integration.project_id &&
      readExistingFlow(remote, rows, JSON.parse(a.config));
    if (!parsed || parsed.workspace !== (a.workspace_id ?? a.id))
      throw new PublicError(
        "external_change",
        "The published flow changed its structure or workspace. Review it in Activepieces before updating here.",
        409,
      );
    if ((a as any).scheduler_enabled) {
      const callback = a.encrypted_callback
        ? await decrypt(env, a.encrypted_callback, userId)
        : null;
      if (
        !callback ||
        parsed.executionEndpoint !==
          callback.replace("/api/callback/", "/api/execute/")
      )
        throw new PublicError(
          "external_change",
          "This flow changed its website scheduling connection. Review it before syncing.",
          409,
        );
    }
    const reconnectCode =
      !(a as any).scheduler_enabled && parsed.executionEndpoint
        ? "schedule_reconnect"
        : null;
    const config = JSON.stringify(parsed.config);
    if (
      config === a.config &&
      a.revision === a.applied_revision &&
      parsed.name === a.name &&
      remote.publishedVersionId === a.flow_version_id
    ) {
      await env.DB.prepare(
        "UPDATE automations SET status=?,error_code=? WHERE id=? AND operation_id=?",
      )
        .bind(
          remote.status === "ENABLED" ? "running" : "paused",
          reconnectCode,
          a.id,
          operation,
        )
        .run();
      return {
        status: remote.status === "ENABLED" ? "running" : "paused",
        synced: true,
      };
    }
    const revision = a.revision + 1;
    const guard =
      "EXISTS(SELECT 1 FROM automations WHERE id=? AND operation_id=? AND revision=? AND applied_revision=? AND flow_version_id=?)";
    const args = [
      a.id,
      operation,
      revision,
      revision,
      remote.publishedVersionId,
    ];
    const statements = [
      env.DB.prepare(
        "UPDATE automations SET name=?,config=?,applied_config=?,revision=?,applied_revision=?,flow_version_id=?,status=?,error_code=?,updated_at=? WHERE id=? AND user_id=? AND revision=? AND operation_id=?",
      ).bind(
        parsed.name,
        config,
        config,
        revision,
        revision,
        remote.publishedVersionId,
        remote.status === "ENABLED" ? "running" : "paused",
        reconnectCode,
        now(),
        a.id,
        userId,
        a.revision,
        operation,
      ),
      env.DB.prepare(
        "INSERT INTO versions SELECT ?,?,?,?,?,? WHERE " + guard,
      ).bind(id(), userId, a.id, revision, config, now(), ...args),
      env.DB.prepare(
        "DELETE FROM profile_claims WHERE automation_id=? AND " + guard,
      ).bind(a.id, ...args),
      ...parsed.config.accounts
        .filter((p) => p.on)
        .map((p) =>
          env.DB.prepare(
            "INSERT INTO profile_claims SELECT ?,?,? WHERE " + guard,
          ).bind(userId, p.connection, a.id, ...args),
        ),
      ...pendingPlanChanges(env, a, config, revision, now(), operation),
    ];
    let result;
    try {
      result = await env.DB.batch(statements);
    } catch {
      throw new PublicError(
        "sync_conflict",
        "These profiles are already managed by another automation. Review the Activepieces change before syncing.",
        409,
      );
    }
    if (result[0].meta.changes !== 1)
      throw new PublicError(
        "conflict",
        "Settings changed while syncing. Reload and try again.",
        409,
      );
    return {
      status: remote.status === "ENABLED" ? "running" : "paused",
      synced: true,
    };
  } finally {
    await unlock(env, raw, operation);
  }
}
export async function reconcile(env: Env, userId: string, raw: Automation) {
  const a = raw as DeployAutomation;
  if (!a.flow_id) return { status: a.status };
  if (!["starting", "applying"].includes(a.status)) {
    const { key } = await getIntegration(env, userId, a);
    const remote = await ap(key, `/flows/${encodeURIComponent(a.flow_id)}`);
    const changed =
      a.flow_version_id && remote.publishedVersionId !== a.flow_version_id;
    if (changed && a.revision === a.applied_revision && !a.operation_id)
      return refreshPublishedSettings(env, userId, a);
    const status = changed
      ? "problem"
      : remote.status === "ENABLED"
        ? "running"
        : "paused";
    let reconnect = a.error_code === "schedule_reconnect";
    if (!(a as any).scheduler_enabled && !changed) {
      let step = remote.version?.trigger;
      for (let n = 0; step && n < 40; n++, step = step.nextAction)
        if (step.name === "step_3") {
          try {
            const config =
              typeof step.settings?.input?.config === "string"
                ? JSON.parse(step.settings.input.config)
                : step.settings?.input?.config;
            reconnect = Boolean(config?.settings?.website);
          } catch {}
        }
    }
    await env.DB.prepare(
      "UPDATE automations SET status=?,error_code=? WHERE id=?",
    )
      .bind(
        status,
        changed ? "external_change" : reconnect ? "schedule_reconnect" : null,
        a.id,
      )
      .run();
    return { status };
  }
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
    let installedVersion: string;
    {
      await ap(key, `/flows/${encodeURIComponent(a.flow_id!)}`, "POST", {
        type: "CHANGE_STATUS",
        request: { status: "DISABLED" },
      });
      const installed = await install(
        env,
        userId,
        { ...a, applied_config: a.deploy_config!, sheet_url: sheet },
        key,
        a.deploy_config!,
        a.target_revision!,
        null,
      );
      installedVersion = installed.publishedVersionId;
    }
    const flow = await ap(
      key,
      `/flows/${encodeURIComponent(a.flow_id!)}`,
      "POST",
      {
        type: "CHANGE_STATUS",
        request: { status: a.resume_after_apply ? "ENABLED" : "DISABLED" },
      },
    );
    if (flow.status !== (a.resume_after_apply ? "ENABLED" : "DISABLED"))
      throw new PublicError(
        "enable",
        "The posting schedule could not be confirmed. Refresh its status.",
        502,
      );
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE automations SET status=?,bootstrap=0,day_slots_enabled=1,applied_config=deploy_config,applied_revision=?,seed_run_id=?,last_run_id=NULL,sheet_url=?,flow_version_id=?,error_code=NULL WHERE id=?",
      ).bind(
        a.resume_after_apply ? "running" : "paused",
        a.target_revision,
        run.id,
        sheet,
        installedVersion,
        a.id,
      ),
      ...pendingPlanChanges(env, a, a.deploy_config!, a.target_revision!),
    ]);
    const selected = JSON.parse(a.deploy_config!)
      .accounts.filter((x: any) => x.on)
      .map((x: any) => x.connection);
    await env.DB.prepare(
      "DELETE FROM profile_claims WHERE automation_id=? AND connection_id NOT IN(SELECT value FROM json_each(?))",
    )
      .bind(a.id, JSON.stringify(selected))
      .run();
    return {
      status: a.resume_after_apply ? "running" : "paused",
      sheetUrl: sheet,
    };
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
deployment.post("/:id/sync", async (c) => {
  const a = (await owned(c)) as DeployAutomation;
  const body = z
    .object({ revision: z.number().int(), discard: z.boolean().default(false) })
    .parse(await c.req.json());
  if (!a.flow_id || body.revision !== a.revision)
    throw new PublicError(
      "conflict",
      "Reload this automation before syncing.",
      409,
    );
  await rateLimit(c, `sync-settings:${a.id}`, 12, 600);
  return c.json(
    await refreshPublishedSettings(c.env, c.get("user").id, a, body.discard),
  );
});
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
    if (!a.flow_id) {
      await c.env.DB.prepare(
        "UPDATE automations SET archived_at=?,updated_at=? WHERE id=? AND user_id=? AND operation_id=? AND flow_id IS NULL",
      )
        .bind(now(), now(), a.id, c.get("user").id, operation)
        .run();
      return c.json({ archived: true });
    }
    if (a.flow_id) {
      const { key } = await getIntegration(c.env, c.get("user").id, a);
      try {
        const path = `/flows/${encodeURIComponent(a.flow_id)}`;
        const remote = await ap(key, path);
        if (remote.status !== "DISABLED") {
          await ap(key, path, "POST", {
            type: "CHANGE_STATUS",
            request: { status: "DISABLED" },
          });
          const paused = await ap(key, path);
          if (paused.status !== "DISABLED")
            throw new PublicError(
              "delete_pause",
              "The flow could not be paused. Refresh before deleting it.",
              409,
            );
        }
        await ap(key, path, "DELETE");
        let exists = true;
        try {
          await ap(key, path);
        } catch (e) {
          if (e instanceof PublicError && e.code === "service_not_found")
            exists = false;
          else throw e;
        }
        if (exists)
          throw new PublicError(
            "delete_unconfirmed",
            "Activepieces has not confirmed deletion. The flow is paused; refresh and try again.",
            409,
          );
      } catch (e) {
        if (!(e instanceof PublicError && e.code === "service_not_found"))
          throw e;
      }
    }
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE automations SET archived_at=?,updated_at=?,flow_id=NULL,seed_run_id=NULL,last_run_id=NULL,flow_version_id=NULL,status='draft',applied_revision=0,bootstrap=0,resume_after_apply=0,planned_through=NULL WHERE id=? AND user_id=? AND operation_id=?",
      ).bind(now(), now(), a.id, c.get("user").id, operation),
      c.env.DB.prepare("DELETE FROM profile_claims WHERE automation_id=?").bind(
        a.id,
      ),
      c.env.DB.prepare("DELETE FROM flow_bindings WHERE automation_id=?").bind(
        a.id,
      ),
      c.env.DB.prepare(
        "UPDATE schedule_jobs SET status='cancelled',detail='Automation removed' WHERE automation_id=? AND status IN('pending','dispatched','claimed')",
      ).bind(a.id),
    ]);
    return c.json({ ok: true });
  } finally {
    await unlock(c.env, a, operation);
  }
});
callbacks.post("/:id/:token", async (c) => {
  const a = await c.env.DB.prepare(
    "SELECT * FROM automations WHERE id=? AND callback_hash=? AND archived_at IS NULL AND user_id IN(SELECT id FROM users WHERE status='active')",
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
