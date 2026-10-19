import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types";
import { owned } from "./access";
import {
  ap,
  connect,
  getIntegration,
  publicConnections,
  safeRun,
  syncConnections,
} from "./activepieces";
import { PublicError, rateLimit } from "./security";
import { rememberBot } from "./telegram";
export const integrations = new Hono<AppEnv>();
integrations.post("/:id/connect", async (c) => {
  const automation = await owned(c);
  await rateLimit(c, `key:${c.get("user").id}`, 10, 600);
  const body = z
    .object({
      key: z.string().trim().min(16).max(2048),
      project: z.string().max(100).optional(),
    })
    .parse(await c.req.json());
  const result = await connect(
    c.env,
    c.get("user").id,
    automation,
    body.key,
    body.project,
  );
  return c.json(result);
});
integrations.get("/:id/connections", async (c) => {
  const automation = await owned(c);
  const { integration, key } = await getIntegration(
    c.env,
    c.get("user").id,
    automation,
  );
  await rateLimit(c, `poll:${c.get("user").id}`, 40, 60);
  const connections =
    c.req.query("refresh") === "1"
      ? await syncConnections(c.env, c.get("user").id, integration, key)
      : await publicConnections(c.env, c.get("user").id, integration.id);
  return c.json({
    name: integration.platform_name,
    connections,
    connectionsUrl: `https://cloud.activepieces.com/projects/${encodeURIComponent(integration.project_id)}/connections`,
  });
});
integrations.get("/:id/runs", async (c) => {
  const automation = await owned(c);
  if (!automation.flow_id) return c.json({ runs: [] });
  const { integration, key } = await getIntegration(
    c.env,
    c.get("user").id,
    automation,
  );
  const results = await ap(
    key,
    `/flow-runs?projectId=${encodeURIComponent(integration.project_id)}&flowId=${encodeURIComponent(automation.flow_id)}&limit=25`,
  );
  return c.json({
    runs: (results?.data || [])
      .filter((r: any) => r.flowId === automation.flow_id)
      .map(safeRun),
  });
});
integrations.post("/:id/telegram", async (c) => {
  const automation = await owned(c);
  const { integration, key } = await getIntegration(
    c.env,
    c.get("user").id,
    automation,
  );
  await rateLimit(c, `telegram:${c.get("user").id}`, 5, 600);
  const { token } = z
    .object({
      token: z
        .string()
        .trim()
        .regex(/^\d{5,20}:[\w-]{25,100}$/),
    })
    .parse(await c.req.json());
  let bot: { ok?: boolean; result?: { username?: string } };
  try {
    bot = await (
      await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        signal: AbortSignal.timeout(10000),
      })
    ).json();
  } catch {
    throw new PublicError(
      "telegram",
      "Telegram could not be reached. Please try again.",
      502,
    );
  }
  if (!bot.ok || !bot.result?.username)
    throw new PublicError(
      "telegram_token",
      "This bot token was not accepted. Copy a fresh token from BotFather.",
    );
  const externalId = `website_bot_${automation.id.replaceAll("-", "")}`;
  await ap(key, "/app-connections", "POST", {
    externalId,
    displayName: `Notifications · ${bot.result.username}`,
    pieceName: "@activepieces/piece-telegram-bot",
    projectId: integration.project_id,
    type: "SECRET_TEXT",
    value: { type: "SECRET_TEXT", secret_text: token },
  });
  const connections = await syncConnections(
    c.env,
    c.get("user").id,
    integration,
    key,
  );
  const saved = await c.env.DB.prepare(
    "SELECT id FROM connections WHERE integration_id=? AND external_id=? AND user_id=?",
  )
    .bind(integration.id, externalId, c.get("user").id)
    .first<{ id: string }>();
  const start = await rememberBot(
    c.env,
    c.get("user").id,
    automation.id,
    token,
    bot.result.username,
    saved!.id,
  );
  return c.json({ connection: saved?.id, ...start, connections });
});
