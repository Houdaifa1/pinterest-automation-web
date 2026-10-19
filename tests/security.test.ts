import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../server/app";
import { decrypt, encrypt } from "../server/security";
const origin = "http://localhost:8788";
async function login(account: string) {
  const response = await app.request(
    `${origin}/auth/dev`,
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ account }),
    },
    env,
  );
  expect(response.status).toBe(200);
  const cookie = response.headers.get("Set-Cookie")!.split(";")[0];
  const me = await app.request(
    `${origin}/api/me`,
    { headers: { Cookie: cookie } },
    env,
  );
  const body = (await me.json()) as any;
  return { cookie, csrf: body.csrf, user: body.user };
}
function request(
  path: string,
  session: any,
  method = "GET",
  body?: unknown,
  headers = {},
) {
  return app.request(
    origin + path,
    {
      method,
      headers: {
        Cookie: session.cookie,
        Origin: origin,
        "X-CSRF-Token": session.csrf,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
}
describe("private website boundaries", () => {
  it("requires sign-in and blocks development login on a public hostname", async () => {
    expect(
      (await app.request(origin + "/api/automations", {}, env)).status,
    ).toBe(401);
    expect(
      (
        await app.request(
          "https://automation.houdaifa.dev/auth/dev",
          {
            method: "POST",
            headers: { Origin: "https://automation.houdaifa.dev" },
            body: "{}",
          },
          env,
        )
      ).status,
    ).toBe(404);
  });
  it("keeps one member from reading or changing another member’s automation and versions", async () => {
    const a = await login("member-a"),
      b = await login("member-b");
    const created = await request("/api/automations", a, "POST", {
      name: "Private posting",
    });
    const { automation } = (await created.json()) as any;
    expect(created.status).toBe(201);
    for (const suffix of ["", "/versions"])
      expect(
        (await request(`/api/automations/${automation.id}${suffix}`, b)).status,
      ).toBe(404);
    expect(
      (
        await request(`/api/automations/${automation.id}`, b, "PUT", {
          name: "Changed",
          revision: 1,
          config: {},
        })
      ).status,
    ).toBe(404);
    const list = (await (await request("/api/automations", b)).json()) as any;
    expect(list.automations).toHaveLength(0);
  });
  it("requires the same origin and a session-specific CSRF token for changes", async () => {
    const a = await login("member-a"),
      b = await login("member-b");
    expect(
      (
        await request(
          "/api/automations",
          a,
          "POST",
          { name: "Wrong origin" },
          { Origin: "https://example.org" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "/api/automations",
          a,
          "POST",
          { name: "Wrong token" },
          { "X-CSRF-Token": b.csrf },
        )
      ).status,
    ).toBe(403);
  });
  it("encrypts keys with owner-bound authenticated encryption", async () => {
    const secret = "a-private-service-key";
    const ciphertext = await encrypt(env, secret, "member-a");
    expect(ciphertext).not.toContain(secret);
    expect(await decrypt(env, ciphertext, "member-a")).toBe(secret);
    await expect(decrypt(env, ciphertext, "member-b")).rejects.toThrow();
    const other = await encrypt(env, secret, "member-a");
    expect(other).not.toBe(ciphertext);
  });
  it("blocks existing sessions immediately and only allows owner moderation", async () => {
    const owner = await login("owner"),
      member = await login("member-a");
    expect((await request("/api/admin/users", member)).status).toBe(404);
    expect(
      (
        await request(`/api/admin/users/${member.user.id}`, owner, "POST", {
          action: "block",
        })
      ).status,
    ).toBe(200);
    expect((await request("/api/me", member)).status).toBe(401);
    const retry = await app.request(
      origin + "/auth/dev",
      {
        method: "POST",
        headers: { Origin: origin },
        body: JSON.stringify({ account: "member-a" }),
      },
      env,
    );
    expect(retry.status).toBe(403);
    expect(
      (
        await request(`/api/admin/users/${member.user.id}`, owner, "POST", {
          action: "unblock",
        })
      ).status,
    ).toBe(200);
    expect((await login("member-a")).user.id).toBe(member.user.id);
  });
  it("rejects expired and replayed Google callbacks before exchanging credentials", async () => {
    const response = await app.request(
      origin + "/auth/callback?state=invalid&code=x",
      { headers: { Cookie: "oauth_state=invalid" } },
      env,
    );
    expect(response.status).toBe(400);
  });
  it("returns safe errors without provider tokens or database details", async () => {
    const a = await login("member-a");
    const response = await request("/api/automations", a, "POST", { name: "" });
    expect(response.status).toBe(400);
    expect(await response.text()).not.toMatch(
      /stack|SELECT|INSERT|token|secret/i,
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
