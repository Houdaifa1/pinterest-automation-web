import { env } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import app from "../server/app";
import { rememberBot, verifiedBotChat } from "../server/telegram";
const origin = "http://localhost:8788";
afterEach(() => vi.restoreAllMocks());
async function session(account: string) {
  const login = await app.request(
    origin + "/auth/dev",
    {
      method: "POST",
      headers: { Origin: origin },
      body: JSON.stringify({ account }),
    },
    env,
  );
  const cookie = login.headers.get("Set-Cookie")!.split(";")[0];
  const me = (await (
    await app.request(origin + "/api/me", { headers: { Cookie: cookie } }, env)
  ).json()) as any;
  const headers = {
    Cookie: cookie,
    Origin: origin,
    "X-CSRF-Token": me.csrf,
    "Content-Type": "application/json",
  };
  return { headers, ...me };
}
it("binds bot Start to an unguessable link and sends one test only to the confirmed private chat", async () => {
  const user = await session("member-a"),
    other = await session("member-b");
  const create = await app.request(
    origin + "/api/automations",
    {
      method: "POST",
      headers: user.headers,
      body: JSON.stringify({ name: "Bot test" }),
    },
    env,
  );
  const { automation } = (await create.json()) as any;
  const token = "123456:private-bot-token-not-returned";
  const { botUrl } = await rememberBot(
    env,
    user.user.id,
    automation.id,
    token,
    "example_bot",
    "verified-bot-connection",
  );
  const nonce = new URL(botUrl).searchParams.get("start");
  let started = false,
    sends = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/getUpdates"))
      return new Response(
        JSON.stringify({
          ok: true,
          result: [
            {
              message: {
                chat: { id: 999, type: "private" },
                text: "/start wrong",
                date: Math.floor(Date.now() / 1000),
              },
            },
            ...(started
              ? [
                  {
                    message: {
                      chat: { id: 123, type: "private" },
                      text: "/start " + nonce,
                      date: Math.floor(Date.now() / 1000),
                    },
                  },
                ]
              : []),
          ],
        }),
      );
    if (path.endsWith("/sendMessage")) {
      sends++;
      expect(JSON.parse(String(options?.body)).chat_id).toBe("123");
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: 1 } }),
      );
    }
    throw Error("Unexpected request");
  });
  const base = origin + "/api/automations/" + automation.id;
  const wrong = await app.request(
    base + "/telegram-status",
    { headers: other.headers },
    env,
  );
  expect(wrong.status).toBe(404);
  const before = await app.request(
    base + "/telegram-status",
    { headers: user.headers },
    env,
  );
  expect(((await before.json()) as any).started).toBe(false);
  expect(
    (
      await app.request(
        base + "/telegram-test",
        { method: "POST", headers: user.headers },
        env,
      )
    ).status,
  ).toBe(409);
  expect(sends).toBe(0);
  started = true;
  const verified = await app.request(
    base + "/telegram-status",
    { headers: user.headers },
    env,
  );
  const safe = await verified.text();
  expect(safe).not.toContain(token);
  expect(safe).not.toContain("chatId");
  expect(JSON.parse(safe).started).toBe(true);
  expect(
    (
      await app.request(
        base + "/telegram-test",
        { method: "POST", headers: user.headers },
        env,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request(
        base + "/telegram-test",
        { method: "POST", headers: user.headers },
        env,
      )
    ).status,
  ).toBe(200);
  expect(sends).toBe(1);
  expect(
    await verifiedBotChat(
      env,
      user.user.id,
      automation.id,
      "verified-bot-connection",
    ),
  ).toBe("123");
  await expect(
    verifiedBotChat(env, user.user.id, automation.id, "different-bot"),
  ).rejects.toThrow("test your selected Telegram bot");
  const stored = await env.DB.prepare(
    "SELECT encrypted_value FROM bot_setups WHERE automation_id=?",
  )
    .bind(automation.id)
    .first<{ encrypted_value: string }>();
  expect(stored!.encrypted_value).not.toContain(token);
});
