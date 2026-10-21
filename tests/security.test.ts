import { env } from "cloudflare:test";
import { describe, it, expect, vi } from "vitest";
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
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/?signin=sign_in_expired");
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

it("reuses a creation request instead of making duplicate automations", async () => {
  const user = await login("member-a"),
    requestId = crypto.randomUUID();
  const first = await request("/api/automations", user, "POST", {
    name: "Repeat-safe posting",
    requestId,
  });
  const second = await request("/api/automations", user, "POST", {
    name: "Repeat-safe posting",
    requestId,
  });
  expect(first.status).toBe(201);
  expect(second.status).toBe(200);
  const a = (await first.json()) as any,
    b = (await second.json()) as any;
  expect(a.automation.id).toBe(b.automation.id);
  const list = (await (await request("/api/automations", user)).json()) as any;
  expect(list.automations).toHaveLength(1);
});
it("commits settings and their restore snapshot together and rejects stale edits", async () => {
  const user = await login("member-a");
  const { automation } = (await (
    await request("/api/automations", user, "POST", { name: "Versioned" })
  ).json()) as any;
  const saved = await request(
    `/api/automations/${automation.id}`,
    user,
    "PUT",
    { name: "Versioned", revision: 1, config: {} },
  );
  expect(saved.status).toBe(200);
  const stale = await request(
    `/api/automations/${automation.id}`,
    user,
    "PUT",
    { name: "Outdated", revision: 1, config: {} },
  );
  expect(stale.status).toBe(409);
  const versions = (await (
    await request(`/api/automations/${automation.id}/versions`, user)
  ).json()) as any;
  expect(versions.versions).toHaveLength(1);
  expect(versions.versions[0].revision).toBe(2);
  const restore = await request(
    `/api/automations/${automation.id}/restore`,
    user,
    "POST",
    { version: versions.versions[0].id },
  );
  expect(restore.status).toBe(200);
  const current = (await (
    await request(`/api/automations/${automation.id}`, user)
  ).json()) as any;
  expect(current.automation.revision).toBe(3);
});
it("deleting website data revokes sessions and removes saved automations without calling external services", async () => {
  const user = await login("member-a");
  await request("/api/automations", user, "POST", { name: "Private data" });
  const deleted = await request("/api/me", user, "DELETE", { confirm: true });
  expect(deleted.status).toBe(200);
  expect((await request("/api/me", user)).status).toBe(401);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM automations WHERE user_id=?",
    )
      .bind(user.user.id)
      .first("n"),
  ).toBe(0);
});

it("uses host-only secure Google state cookies and requests identity scopes only", async () => {
  const production = {
    ...env,
    DEV_LOGIN: undefined,
    APP_ORIGIN: "https://automation.houdaifa.dev",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
  };
  const response = await app.request(
    "https://automation.houdaifa.dev/auth/start",
    {},
    production,
  );
  expect(response.status).toBe(302);
  const target = new URL(response.headers.get("Location")!);
  expect(target.origin).toBe("https://accounts.google.com");
  expect(target.searchParams.get("scope")).toBe("openid email profile");
  expect(target.searchParams.get("code_challenge_method")).toBe("S256");
  expect(target.searchParams.get("redirect_uri")).toBe(
    "https://automation.houdaifa.dev/auth/callback",
  );
  const cookie = response.headers.get("Set-Cookie")!;
  expect(cookie).toContain("__Host-oauth_state=");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).not.toContain("Domain=");
  const preview = await app.request(
    "https://pinterest-automations.pages.dev/auth/start",
    {},
    production,
  );
  expect(preview.headers.get("Location")).toBe(
    "https://automation.houdaifa.dev/auth/start",
  );
});

it("removes only the owned draft, hides all its routes and restores the same draft", async () => {
  const a = await login("member-a"),
    b = await login("member-b");
  const { automation } = (await (
    await request("/api/automations", a, "POST", { name: "Disposable draft" })
  ).json()) as any;
  const base = `/api/automations/${automation.id}`;
  expect((await request(base, b, "DELETE", { confirm: true })).status).toBe(
    404,
  );
  expect((await request(base, a, "DELETE", { confirm: true })).status).toBe(
    200,
  );
  for (const suffix of ["", "/versions", "/batches", "/connections"])
    expect((await request(base + suffix, a)).status).toBe(404);
  const removed = (await (await request("/api/automations", a)).json()) as any;
  expect(removed.automations).toHaveLength(0);
  expect(removed.removedDrafts[0].id).toBe(automation.id);
  expect((await request(base + "/restore-draft", b, "POST", {})).status).toBe(
    404,
  );
  expect((await request(base + "/restore-draft", a, "POST", {})).status).toBe(
    200,
  );
  expect((await request(base, a)).status).toBe(200);
  expect((await request(base + "/restore-draft", a, "POST", {})).status).toBe(
    409,
  );
});

it("starts new setups empty while retaining the member's sole encrypted integration", async () => {
  const a = await login("member-a");
  const integrationId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO integrations VALUES(?,?,?,?,?,?)")
    .bind(
      integrationId,
      a.user.id,
      await encrypt(env, "private-key", a.user.id),
      "project",
      "Saved workspace",
      1,
    )
    .run();
  const { automation } = (await (
    await request("/api/automations", a, "POST", {
      name: "Fresh",
      intent: "new",
    })
  ).json()) as any;
  expect(automation.connected).toBe(true);
  expect(automation.config.accounts ?? []).toEqual([]);
  expect(automation.intent).toBe("new");
  expect(JSON.stringify(automation)).not.toContain("private-key");
  const saved = await env.DB.prepare(
    "SELECT integration_id FROM automations WHERE id=?",
  )
    .bind(automation.id)
    .first();
  expect(saved?.integration_id).toBe(integrationId);
});


it("pauses and confirms remote deletion while preserving recoverable website settings",async()=>{
 const user=await login("member-a");const {automation}=await(await request("/api/automations",user,"POST",{name:"Recoverable"})).json() as any;
 const integration=crypto.randomUUID();await env.DB.prepare("INSERT INTO integrations VALUES(?,?,?,?,?,?)").bind(integration,user.user.id,await encrypt(env,"private-test-key",user.user.id),"project","Workspace",1).run();
 await env.DB.prepare("UPDATE automations SET integration_id=?,flow_id='test-flow',status='running',applied_revision=1 WHERE id=?").bind(integration,automation.id).run();
 let status="ENABLED",deleted=false;const calls:string[]=[];
 const fetch=vi.spyOn(globalThis,"fetch").mockImplementation(async(_input,init)=>{
  const method=init?.method||"GET";calls.push(method);
  if(method==="DELETE"){expect(status).toBe("DISABLED");deleted=true;return new Response(null,{status:200});}
  if(method==="POST"){status="DISABLED";return Response.json({status});}
  return deleted?new Response(null,{status:404}):Response.json({status});
 });
 try{
  expect((await request(`/api/automations/${automation.id}`,user,"DELETE",{confirm:true})).status).toBe(200);
  expect(calls).toEqual(["GET","POST","GET","DELETE","GET"]);
  expect((await request(`/api/automations/${automation.id}`,user)).status).toBe(404);
  expect((await request(`/api/automations/${automation.id}/restore-draft`,user,"POST",{})).status).toBe(200);
  const saved=await env.DB.prepare("SELECT flow_id,status,resume_after_apply FROM automations WHERE id=?").bind(automation.id).first();
  expect(saved).toEqual({flow_id:null,status:"draft",resume_after_apply:0});
 }finally{fetch.mockRestore();}
});
