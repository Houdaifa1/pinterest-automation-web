import { env } from "cloudflare:test";
import { it, expect } from "vitest";
import app from "../server/app";
import { cleanJpeg } from "../server/images.mjs";
const origin = "http://localhost:8788";
async function login(account: string) {
  const r = await app.request(
    origin + "/auth/dev",
    {
      method: "POST",
      headers: { Origin: origin },
      body: JSON.stringify({ account }),
    },
    env,
  );
  const cookie = r.headers.get("Set-Cookie")!.split(";")[0];
  const me = (await (
    await app.request(origin + "/api/me", { headers: { Cookie: cookie } }, env)
  ).json()) as any;
  return { cookie, ...me };
}
async function request(
  path: string,
  session: any,
  method = "GET",
  body?: unknown,
  raw = false,
) {
  return app.request(
    origin + path,
    {
      method,
      headers: {
        Cookie: session.cookie,
        Origin: origin,
        "X-CSRF-Token": session.csrf,
        "Content-Type": raw ? "image/jpeg" : "application/json",
      },
      body:
        body === undefined
          ? undefined
          : raw
            ? (body as Uint8Array)
            : JSON.stringify(body),
    },
    env,
  );
}
async function setup() {
  const user = await login("member-a"),
    other = await login("member-b");
  const response = await request("/api/automations", user, "POST", {
    name: "Saved style",
  });
  const { automation } = (await response.json()) as any;
  const config = {
    emailTo: "member-a@example.test",
    botEmail: "bot@example.test",
    timeZone: "UTC",
    accounts: [
      {
        id: "profile",
        name: "testprofile",
        username: "testprofile",
        niche: "crochet",
        general: false,
        category: "crochet",
        source: "niche",
        pinsPerProduct: 6,
        pinsPerDay: 5,
        hours: [9, 12, 15, 18, 21],
        on: true,
      },
    ],
  };
  await env.DB.prepare("UPDATE automations SET config=?,sheet_url=? WHERE id=?")
    .bind(
      JSON.stringify(config),
      "https://docs.google.com/spreadsheets/d/testsheet/edit",
      automation.id,
    )
    .run();
  return { user, other, automation, base: `/api/automations/${automation.id}` };
}
const fixture = () =>
  Uint8Array.from(atob(env.TEST_JPEG as string), (c) => c.charCodeAt(0));
it("accepts bounded image content and strips metadata before storing it", () => {
  const image = fixture(),
    app1 = Uint8Array.from([255, 225, 0, 10, 69, 120, 105, 102, 0, 0, 0, 0]);
  const withMetadata = new Uint8Array(image.length + app1.length);
  withMetadata.set(image.slice(0, 2));
  withMetadata.set(app1, 2);
  withMetadata.set(image.slice(2), 2 + app1.length);
  expect(cleanJpeg(withMetadata).bytes).toEqual(cleanJpeg(image).bytes);
  expect(() =>
    cleanJpeg(new TextEncoder().encode('<svg onload="alert(1)"></svg>')),
  ).toThrow();
  expect(() => cleanJpeg(image.slice(0, -2))).toThrow();
});
it("keeps uploaded references private to their owner", async () => {
  const { user, other, base } = await setup();
  const upload = await request(
    base + "/accounts/profile/media",
    user,
    "POST",
    fixture(),
    true,
  );
  expect(upload.status).toBe(201);
  const { id } = (await upload.json()) as any;
  const own = await request(base + "/media/" + id, user);
  expect(own.status).toBe(200);
  expect(own.headers.get("Content-Type")).toBe("image/jpeg");
  expect((await own.arrayBuffer()).byteLength).toBeGreaterThan(0);
  expect((await request(base + "/media/" + id, other)).status).toBe(404);
  expect((await request(base + "/media/" + id, other, "DELETE")).status).toBe(
    404,
  );
  expect(
    (
      await request(
        base + "/accounts/profile/media",
        other,
        "POST",
        fixture(),
        true,
      )
    ).status,
  ).toBe(404);
});
it("recopying a batch keeps one history entry, with immutable reference snapshots and expiring scoped links", async () => {
  const { user, other, base } = await setup();
  const upload = await request(
    base + "/accounts/profile/media",
    user,
    "POST",
    fixture(),
    true,
  );
  const media = (await upload.json()) as any;
  const input = {
    accountId: "profile",
    lines: [{ kind: "free", count: 5, url: "" }],
  };
  const first = await request(base + "/batches", user, "POST", input);
  expect(first.status).toBe(200);
  const { batch } = (await first.json()) as any;
  const second = (await (
    await request(base + "/batches", user, "POST", input)
  ).json()) as any;
  expect(second.batch.id).toBe(batch.id);
  await request(base + `/batches/${batch.id}/copy`, user, "POST", {});
  await request(base + `/batches/${batch.id}/copy`, user, "POST", {});
  const list = (await (await request(base + "/batches", user)).json()) as any;
  expect(list.batches).toHaveLength(1);
  expect(list.batches[0].copies).toBe(2);
  expect((await request(base + `/batches/${batch.id}`, other)).status).toBe(
    404,
  );
  const link = batch.prompt.match(
    /http:\/\/localhost:8788\/api\/reference\/[^\s]+/,
  )?.[0];
  expect(link).toBeTruthy();
  expect((await app.request(link, {}, env)).status).toBe(200);
  await request(base + "/media/" + media.id, user, "DELETE");
  expect((await app.request(link, {}, env)).status).toBe(200);
  const changed = (await (
    await request(base + "/batches", user, "POST", input)
  ).json()) as any;
  expect(changed.batch.id).not.toBe(batch.id);
  const wrong = link.slice(0, link.lastIndexOf("/") + 1) + "wrong-reference";
  expect((await app.request(wrong, {}, env)).status).toBe(404);
  await env.DB.prepare("UPDATE batches SET capability_expires=1 WHERE id=?")
    .bind(batch.id)
    .run();
  expect((await app.request(link, {}, env)).status).toBe(404);
});
it("rejects bad image content and batches before a Sheet exists", async () => {
  const { user, base, automation } = await setup();
  expect(
    (
      await request(
        base + "/accounts/profile/media",
        user,
        "POST",
        new Uint8Array([1, 2, 3]),
        true,
      )
    ).status,
  ).toBe(400);
  await env.DB.prepare("UPDATE automations SET sheet_url=NULL WHERE id=?")
    .bind(automation.id)
    .run();
  expect(
    (
      await request(base + "/batches", user, "POST", {
        accountId: "profile",
        lines: [{ kind: "free", count: 5 }],
      })
    ).status,
  ).toBe(409);
});
it("revokes reference links immediately when the owner is blocked", async () => {
  const { user, base } = await setup();
  await request(
    base + "/accounts/profile/media",
    user,
    "POST",
    fixture(),
    true,
  );
  const { batch } = (await (
    await request(base + "/batches", user, "POST", {
      accountId: "profile",
      lines: [{ kind: "free", count: 5 }],
    })
  ).json()) as any;
  const link = batch.prompt.match(
    /http:\/\/localhost:8788\/api\/reference\/[^\s]+/,
  )[0];
  await env.DB.prepare("UPDATE users SET status='blocked' WHERE id=?")
    .bind(user.user.id)
    .run();
  expect((await app.request(link, {}, env)).status).toBe(404);
});
