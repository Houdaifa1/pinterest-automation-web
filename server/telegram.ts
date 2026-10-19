import { Hono } from "hono";
import { owned } from "./access";
import {
  decrypt,
  encrypt,
  now,
  PublicError,
  randomToken,
  rateLimit,
} from "./security";
import type { AppEnv, Env } from "./types";
interface BotSetup {
  automation_id: string;
  user_id: string;
  encrypted_value: string;
  username: string;
  expires_at: number;
  tested_at: number | null;
}
interface BotValue {
  token: string;
  challenge: string;
  connectionId: string;
  chatId?: string;
}
export async function telegramApi(
  token: string,
  method: string,
  body: unknown = {},
) {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new PublicError(
      "telegram",
      "Telegram could not be reached. Try again.",
      502,
    );
  }
  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new PublicError(
      "telegram",
      "Telegram returned an incomplete reply. Try again.",
      502,
    );
  }
  if (!response.ok || !result.ok)
    throw new PublicError(
      "telegram",
      "Telegram could not confirm this action. Check your bot and try again.",
      409,
    );
  return result.result;
}
export async function rememberBot(
  env: Env,
  userId: string,
  automationId: string,
  token: string,
  username: string,
  connectionId: string,
) {
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(username))
    throw new PublicError("telegram", "This bot name could not be verified.");
  const challenge = randomToken();
  await env.DB.prepare(
    "INSERT INTO bot_setups VALUES(?,?,?,?,?,NULL) ON CONFLICT(automation_id) DO UPDATE SET encrypted_value=excluded.encrypted_value,username=excluded.username,expires_at=excluded.expires_at,tested_at=NULL",
  )
    .bind(
      automationId,
      userId,
      await encrypt(
        env,
        JSON.stringify({ token, challenge, connectionId }),
        userId,
      ),
      username,
      now() + 3600,
    )
    .run();
  return { botUrl: `https://t.me/${username}?start=${challenge}` };
}
async function readSetup(env: Env, userId: string, automationId: string) {
  const setup = await env.DB.prepare(
    "SELECT * FROM bot_setups WHERE user_id=? AND automation_id=?",
  )
    .bind(userId, automationId)
    .first<BotSetup>();
  if (!setup) return null;
  return {
    setup,
    value: JSON.parse(
      await decrypt(env, setup.encrypted_value, userId),
    ) as BotValue,
  };
}
async function findStart(env: Env, setup: BotSetup, value: BotValue) {
  if (value.chatId) return value;
  if (setup.expires_at < now())
    throw new PublicError(
      "telegram_expired",
      "The bot link expired. Connect the bot again to get a fresh link.",
      409,
    );
  const updates = await telegramApi(value.token, "getUpdates", {
    timeout: 0,
    limit: 100,
    allowed_updates: ["message"],
  });
  const match =
    Array.isArray(updates) &&
    updates.find(
      (u: any) =>
        u.message?.chat?.type === "private" &&
        u.message.text === `/start ${value.challenge}` &&
        Number.isSafeInteger(u.message.chat.id) &&
        u.message.date >= setup.expires_at - 3600 &&
        u.message.date <= now() + 60,
    );
  if (match) {
    value.chatId = String(match.message.chat.id);
    await env.DB.prepare(
      "UPDATE bot_setups SET encrypted_value=? WHERE automation_id=? AND user_id=?",
    )
      .bind(
        await encrypt(env, JSON.stringify(value), setup.user_id),
        setup.automation_id,
        setup.user_id,
      )
      .run();
  }
  return value;
}
export async function verifiedBotChat(
  env: Env,
  userId: string,
  automationId: string,
  connectionId: string,
) {
  const result = await readSetup(env, userId, automationId);
  if (
    !result ||
    !result.setup.tested_at ||
    result.setup.tested_at < 0 ||
    result.value.connectionId !== connectionId ||
    !/^\d+$/.test(result.value.chatId || "")
  )
    throw new PublicError(
      "telegram_unverified",
      "Open setup and test your selected Telegram bot before applying.",
      409,
    );
  return result.value.chatId!;
}
export const telegramChecks = new Hono<AppEnv>();
telegramChecks.get("/:id/telegram-status", async (c) => {
  const a = await owned(c),
    userId = c.get("user").id;
  await rateLimit(c, `bot-check:${userId}`, 20, 60);
  const result = await readSetup(c.env, userId, a.id);
  if (!result) return c.json({ configured: false });
  const { setup } = result;
  let value = result.value;
  if (!setup.tested_at) value = await findStart(c.env, setup, value);
  return c.json({
    configured: true,
    started: Boolean(value.chatId),
    tested: Boolean(setup.tested_at && setup.tested_at > 0),
    botUrl: `https://t.me/${setup.username}?start=${value.challenge}`,
  });
});
telegramChecks.post("/:id/telegram-test", async (c) => {
  const a = await owned(c),
    userId = c.get("user").id;
  await rateLimit(c, `bot-test:${userId}`, 5, 600);
  const result = await readSetup(c.env, userId, a.id);
  if (!result)
    throw new PublicError("telegram", "Connect your Telegram bot first.", 409);
  const { setup } = result;
  if (setup.tested_at && setup.tested_at > 0) return c.json({ tested: true });
  const value = await findStart(c.env, setup, result.value);
  if (!value.chatId)
    throw new PublicError(
      "telegram_start",
      "Open your bot using the link, press Start, then check again.",
      409,
    );
  const lease = -now();
  const claimed = await c.env.DB.prepare(
    "UPDATE bot_setups SET tested_at=? WHERE automation_id=? AND user_id=? AND (tested_at IS NULL OR (tested_at<0 AND tested_at>?)) RETURNING automation_id",
  )
    .bind(lease, a.id, userId, -now() + 120)
    .first();
  if (!claimed)
    throw new PublicError(
      "busy",
      "Your test message is being checked. Wait a moment.",
      409,
    );
  try {
    await telegramApi(value.token, "sendMessage", {
      chat_id: value.chatId,
      text: "Automation is connected. Your posting alerts will arrive here.",
    });
    await c.env.DB.prepare(
      "UPDATE bot_setups SET tested_at=? WHERE automation_id=? AND tested_at=?",
    )
      .bind(now(), a.id, lease)
      .run();
    return c.json({ tested: true });
  } catch (e) {
    await c.env.DB.prepare(
      "UPDATE bot_setups SET tested_at=NULL WHERE automation_id=? AND tested_at=?",
    )
      .bind(a.id, lease)
      .run();
    throw e;
  }
});
