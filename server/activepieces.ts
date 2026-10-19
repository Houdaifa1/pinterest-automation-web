import type { Env, Automation } from "./types";
import { decrypt, encrypt, id, now, PublicError } from "./security";
const API = "https://cloud.activepieces.com/api/v1";
export interface Integration {
  id: string;
  user_id: string;
  encrypted_key: string;
  project_id: string;
  platform_name: string;
}
export interface Connection {
  id: string;
  user_id: string;
  integration_id: string;
  remote_id: string;
  external_id: string;
  service: string;
  label: string;
  identity: string;
  status: string;
}
export interface RemoteConnection {
  id: string;
  externalId: string;
  pieceName: string;
  displayName: string;
  status: string;
  metadata?: { accountIdentifier?: string };
}
export async function ap(
  key: string,
  path: string,
  method = "GET",
  body?: unknown,
) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://"))
    throw new Error("invalid_provider_path");
  let response: Response;
  try {
    response = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
      redirect: "manual",
    });
  } catch {
    throw new PublicError(
      "service_unavailable",
      "Activepieces could not be reached. Try again in a moment.",
      502,
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    if ([401, 403].includes(response.status))
      throw new PublicError(
        "reconnect",
        "Your Activepieces key needs reconnecting. Open Settings to replace it.",
        401,
      );
    if (response.status === 429)
      throw new PublicError(
        "service_busy",
        "Activepieces is busy. Please try again in a minute.",
        429,
      );
    if (response.status === 404)
      throw new PublicError(
        "service_not_found",
        "This flow or connection is no longer available. Refresh connections.",
        409,
      );
    throw new PublicError(
      "service_error",
      "Activepieces could not finish this action. Refresh its status before trying again.",
      502,
    );
  }
  if (response.status === 204) return null;
  try {
    return (await response.json()) as any;
  } catch {
    throw new PublicError(
      "service_response",
      "Activepieces returned an incomplete response. Please refresh.",
      502,
    );
  }
}
export async function getIntegration(
  env: Env,
  userId: string,
  automation: Automation,
) {
  const integration = await env.DB.prepare(
    "SELECT * FROM integrations WHERE id=? AND user_id=?",
  )
    .bind(automation.integration_id, userId)
    .first<Integration>();
  if (!integration)
    throw new PublicError("connect", "Connect Activepieces first.", 409);
  return {
    integration,
    key: await decrypt(env, integration.encrypted_key, userId),
  };
}
export async function connect(
  env: Env,
  userId: string,
  automation: Automation,
  key: string,
  projectId?: string,
) {
  const projects = await ap(key, "/projects?limit=100");
  const list = (projects?.data || []).filter(
    (p: any) => typeof p.id === "string" && typeof p.displayName === "string",
  );
  if (!list.length)
    throw new PublicError(
      "project",
      "This key has no available project. Create a project in Activepieces.",
    );
  if (list.length > 1 && !projectId)
    return {
      projects: list.map((p: any) => ({ choice: p.id, name: p.displayName })),
    };
  const project =
    list.find((p: any) => p.id === projectId) || (!projectId && list[0]);
  if (!project)
    throw new PublicError("project", "Choose one of the available projects.");
  if (automation.flow_id && automation.integration_id) {
    const current = await env.DB.prepare(
      "SELECT project_id FROM integrations WHERE id=? AND user_id=?",
    )
      .bind(automation.integration_id, userId)
      .first<{ project_id: string }>();
    if (current?.project_id !== project.id)
      throw new PublicError(
        "project_locked",
        "This automation already belongs to another project. Create a new automation for this project.",
        409,
      );
  }
  const existing = await env.DB.prepare(
    "SELECT id FROM integrations WHERE user_id=? AND project_id=?",
  )
    .bind(userId, project.id)
    .first<{ id: string }>();
  const integrationId = existing?.id || id();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO integrations(id,user_id,encrypted_key,project_id,platform_name,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,project_id) DO UPDATE SET encrypted_key=excluded.encrypted_key,platform_name=excluded.platform_name`,
    ).bind(
      integrationId,
      userId,
      await encrypt(env, key, userId),
      project.id,
      project.displayName,
      now(),
    ),
    env.DB.prepare(
      "UPDATE automations SET integration_id=?,updated_at=? WHERE id=? AND user_id=?",
    ).bind(integrationId, now(), automation.id, userId),
  ]);
  return { connected: true, name: project.displayName };
}
const services: Record<string, string> = {
  "@activepieces/piece-google-sheets": "google",
  "@activepieces/piece-gmail": "gmail",
  "@activepieces/piece-pinterest": "pinterest",
  "@activepieces/piece-telegram-bot": "telegram",
};
export async function syncConnections(
  env: Env,
  userId: string,
  integration: Integration,
  key: string,
) {
  let cursor = "",
    page = 0;
  const all: RemoteConnection[] = [];
  do {
    const result = await ap(
      key,
      `/app-connections?projectId=${encodeURIComponent(integration.project_id)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (!Array.isArray(result?.data))
      throw new PublicError(
        "connections",
        "Connections could not be read. Try refreshing.",
        502,
      );
    all.push(...result.data);
    cursor = typeof result.next === "string" ? result.next : "";
  } while (cursor && ++page < 5);
  if (cursor)
    throw new PublicError(
      "connections_limit",
      "This project has too many connections to show safely. Use a smaller project.",
      409,
    );
  const statements = [
    env.DB.prepare(
      "UPDATE connections SET status='MISSING' WHERE integration_id=? AND user_id=?",
    ).bind(integration.id, userId),
  ];
  for (const remote of all) {
    const service = services[remote.pieceName];
    if (
      !service ||
      typeof remote.id !== "string" ||
      typeof remote.externalId !== "string"
    )
      continue;
    const identity =
      typeof remote.metadata?.accountIdentifier === "string"
        ? remote.metadata.accountIdentifier.slice(0, 120)
        : "";
    statements.push(
      env.DB.prepare(
        `INSERT INTO connections VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(integration_id,remote_id) DO UPDATE SET external_id=excluded.external_id,label=excluded.label,identity=excluded.identity,status=excluded.status`,
      ).bind(
        id(),
        userId,
        integration.id,
        remote.id,
        remote.externalId,
        service,
        String(remote.displayName || service).slice(0, 120),
        identity,
        remote.status === "ACTIVE" ? "ACTIVE" : "EXPIRED",
      ),
    );
  }
  await env.DB.batch(statements);
  return publicConnections(env, userId, integration.id);
}
export async function publicConnections(
  env: Env,
  userId: string,
  integrationId: string,
) {
  return (
    await env.DB.prepare(
      "SELECT id,service,label,identity,status FROM connections WHERE user_id=? AND integration_id=? ORDER BY service,label",
    )
      .bind(userId, integrationId)
      .all()
  ).results;
}
export function safeRun(run: any) {
  const statuses = [
    "SUCCEEDED",
    "FAILED",
    "RUNNING",
    "QUEUED",
    "TIMEOUT",
    "INTERNAL_ERROR",
    "CANCELED",
    "PAUSED",
    "STOPPED",
  ];
  return {
    id: String(run.id || "").slice(0, 80),
    status: statuses.includes(run.status) ? run.status : "UNKNOWN",
    startedAt: typeof run.startTime === "string" ? run.startTime : null,
    finishedAt: typeof run.finishTime === "string" ? run.finishTime : null,
  };
}
export function safeSheet(run: any) {
  const link =
    run?.steps?.step_3?.output?.spreadsheet ||
    run?.steps?.step_3?.output?.result?.spreadsheet;
  return typeof link === "string" &&
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+\/edit$/.test(link)
    ? link
    : null;
}
