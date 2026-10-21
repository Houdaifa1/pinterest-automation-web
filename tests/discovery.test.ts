import { env } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import app from "../server/app";
import { template } from "../.build/engine";
import { defaultState, emptyAccount } from "../engine/panel/generator.js";
import { buildWebsiteFlow } from "../server/flow-builder.mjs";
import { connect } from "../server/activepieces";
import { readExistingFlow } from "../server/discovery";
import { deploy, reconcile } from "../server/deployment";
const origin = "http://localhost:8788";
afterEach(() => vi.restoreAllMocks());
async function session(account = "member-a") {
  const res = await app.request(
    origin + "/auth/dev",
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ account }),
    },
    env,
  );
  const cookie = res.headers.get("Set-Cookie")!.split(";")[0];
  const me: any = await (
    await app.request(origin + "/api/me", { headers: { Cookie: cookie } }, env)
  ).json();
  return { cookie, ...me };
}
function request(path: string, s: any, method = "GET", body?: any) {
  return app.request(
    origin + path,
    {
      method,
      headers: {
        Cookie: s.cookie,
        Origin: origin,
        "X-CSRF-Token": s.csrf,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
}
async function draft(s: any) {
  const body: any = await (
    await request("/api/automations", s, "POST", { name: "New automation" })
  ).json();
  const a: any = await fresh(body.automation.id);
  await connect(env, s.user.id, a, "private-api-key");
  return fresh(a.id);
}
async function fresh(id: string) {
  return env.DB.prepare("SELECT * FROM automations WHERE id=?")
    .bind(id)
    .first<any>();
}
function remote() {
  const raw = buildWebsiteFlow(
    template,
    {
      ...defaultState(),
      google: "external-google",
      gmail: "external-gmail",
      telegram: "external-telegram",
      notifyTelegram: true,
      emailTo: "member@example.test",
      botEmail: "bot@example.test",
      reuseTelegramRecipient: true,
      accounts: [
        {
          ...emptyAccount(),
          name: "crochettest",
          username: "crochettest",
          connection: "external-pinterest",
          general: true,
          on: true,
        },
      ],
    },
    "11111111-1111-4111-8111-111111111111",
    "Saved crochet",
    "old-version",
    null,
    null,
    "",
  );
  let status = "DISABLED",
    version = 1,
    trigger = raw.trigger;
  const calls: any[] = [];
  const connections = [
    "google",
    "gmail",
    "pinterest",
    "telegram",
    "pinterest2",
  ].map((service) => ({
    id: "remote-" + service,
    externalId: "external-" + service,
    pieceName:
      "@activepieces/piece-" +
      ({
        google: "google-sheets",
        telegram: "telegram-bot",
        pinterest2: "pinterest",
      }[service] || service),
    displayName: service,
    status: "ACTIVE",
    metadata: {
      accountIdentifier: service.startsWith("pinterest")
        ? service === "pinterest"
          ? "crochettest"
          : "secondprofile"
        : "bot@example.test",
      access_token: "never-return-token",
    },
  }));
  const flow = () => ({
    id: "original-flow",
    projectId: "project",
    status,
    publishedVersionId: "version-" + version,
    version: {
      id: "version-" + version,
      displayName: "Saved crochet",
      trigger,
    },
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
    const url = new URL(String(input)),
      method = options?.method || "GET",
      body = options?.body ? JSON.parse(String(options.body)) : null;
    calls.push({ path: url.pathname, search: url.search, method, body });
    const reply = (v: any) => new Response(JSON.stringify(v));
    if (url.pathname.endsWith("/projects"))
      return reply({ data: [{ id: "project", displayName: "Project" }] });
    if (url.pathname.endsWith("/app-connections")) {
      expect(method).toBe("GET");
      return reply({ data: connections, next: null });
    }
    if (url.pathname.endsWith("/flows")) {
      expect(method).toBe("GET");
      return reply({ data: [flow()], next: null });
    }
    if (url.pathname.endsWith("/flows/original-flow")) {
      if (body?.type === "IMPORT_FLOW") {
        trigger = body.request.trigger;
        version++;
      }
      if (body?.type === "CHANGE_STATUS") status = body.request.status;
      return reply(flow());
    }
    const run = {
      id: "seed-run",
      projectId: "project",
      flowId: "original-flow",
      flowVersionId: "version-" + version,
      status: "SUCCEEDED",
    };
    if (url.pathname.endsWith("/flow-runs")) return reply({ data: [run] });
    if (url.pathname.endsWith("/flow-runs/seed-run/retry"))
      return reply({ id: "seed-run" });
    if (url.pathname.endsWith("/flow-runs/seed-run"))
      return reply({
        ...run,
        steps: {
          step_3: {
            output: {
              spreadsheet:
                "https://docs.google.com/spreadsheets/d/original-sheet/edit",
            },
          },
          login: { output: { access_token: "never-return-token" } },
        },
      });
    throw Error("Unexpected provider path " + url.pathname);
  });
  return {
    calls,
    flow,
    start() {
      status = "ENABLED";
    },
    publishSettings(settings: any, hours?: number[]) {
      let step = trigger;
      while (step && step.name !== "step_3") step = step.nextAction;
      const config = JSON.parse(step.settings.input.config);
      Object.assign(config.settings, settings);
      if (hours) {
        config.accounts[0].hours = hours;
        config.accounts[0].dailyCap = hours.length;
      }
      step.settings.input.config = JSON.stringify(config);
      version++;
    },
  };
}
it("discovers and adopts a saved setup using read-only calls, keeping Telegram, the Sheet and pause state", async () => {
  const provider = remote(),
    s = await session(),
    a = await draft(s);
  const discoveryResponse = await request(
    `/api/automations/${a.id}/discovery`,
    s,
  );
  expect(discoveryResponse.status).toBe(200);
  const result: any = await discoveryResponse.json();
  expect(result.flows).toHaveLength(1);
  expect(result.flows[0].config.notifyTelegram).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(
    /external-|never-return|sourceCode|original-flow/,
  );
  const adopted = await request(`/api/automations/${a.id}/adopt`, s, "POST", {
    choice: result.flows[0].choice,
  });
  expect(adopted.status).toBe(200);
  const saved = await fresh(a.id);
  expect(saved.flow_id).toBe("original-flow");
  expect(saved.workspace_id).toBe("");
  expect(saved.sheet_url).toContain("/original-sheet/");
  expect(saved.status).toBe("paused");
  expect(saved.applied_revision).toBe(saved.revision);
  expect(JSON.parse(saved.config)).toMatchObject({
    emailTo: "member@example.test",
    notifyEmail: true,
    notifyTelegram: true,
    telegram: expect.any(String),
  });
  const reopened: any = await (
    await request(`/api/automations/${a.id}`, s)
  ).json();
  expect(reopened.automation.config.notifyTelegram).toBe(true);
  expect(reopened.automation.config.notifyEmail).toBe(true);
  expect(reopened.automation.config.emailTo).toBe("member@example.test");
  expect(provider.calls.every((c) => c.method === "GET")).toBe(true);
  const bot: any = await (
    await request(`/api/automations/${a.id}/telegram-status`, s)
  ).json();
  expect(bot).toMatchObject({
    configured: true,
    existing: true,
    started: true,
  });
  expect(bot.botUrl).toBeUndefined();
});
it("adding a Pinterest profile updates the same imported flow, preserves its workspace and keeps a paused schedule paused", async () => {
  const provider = remote(),
    s = await session(),
    a = await draft(s);
  const discovery: any = await (
    await request(`/api/automations/${a.id}/discovery`, s)
  ).json();
  await request(`/api/automations/${a.id}/adopt`, s, "POST", {
    choice: discovery.flows[0].choice,
  });
  const saved = await fresh(a.id),
    config = JSON.parse(saved.config);
  const second = discovery.connections.find(
    (c: any) => c.identity === "secondprofile",
  );
  config.accounts.push({
    ...config.accounts[0],
    id: "second",
    name: "secondprofile",
    username: "secondprofile",
    connection: second.id,
  });
  await env.DB.prepare(
    "UPDATE automations SET config=?,revision=revision+1 WHERE id=?",
  )
    .bind(JSON.stringify(config), a.id)
    .run();
  await deploy(env, s.user.id, await fresh(a.id));
  expect(await reconcile(env, s.user.id, await fresh(a.id))).toMatchObject({
    status: "paused",
  });
  const done = await fresh(a.id);
  expect(done.flow_id).toBe("original-flow");
  expect(done.sheet_url).toBe(saved.sheet_url);
  expect(done.applied_revision).toBe(done.revision);
  expect(
    provider.calls
      .filter((c) => c.method !== "GET")
      .every(
        (c) =>
          c.path.includes("/original-flow") ||
          c.path.endsWith("/seed-run/retry"),
      ),
  ).toBe(true);
  const imports = provider.calls.filter((c) => c.body?.type === "IMPORT_FLOW");
  expect(imports).toHaveLength(2);
  const parsed = readExistingFlow(
    provider.flow(),
    (
      await env.DB.prepare("SELECT * FROM connections WHERE user_id=?")
        .bind(s.user.id)
        .all<any>()
    ).results,
  );
  expect(parsed?.config.accounts).toHaveLength(2);
  expect(parsed?.workspace).toBe("");
  let first = imports[0].body.request.trigger;
  while (first.name !== "step_3") first = first.nextAction;
  expect(JSON.parse(first.settings.input.config).settings.maintenance).toBe(
    true,
  );
  let last = imports[1].body.request.trigger;
  while (last.name !== "step_3") last = last.nextAction;
  expect(
    JSON.parse(last.settings.input.config).settings.maintenance,
  ).toBeUndefined();
  expect(
    JSON.parse(last.settings.input.config).settings.telegramChat,
  ).toBeUndefined();
});
it("blocks cross-member access and repeat adoption without creating a second managed flow", async () => {
  remote();
  const s = await session(),
    other = await session("member-b"),
    a = await draft(s);
  expect(
    (await request(`/api/automations/${a.id}/discovery`, other)).status,
  ).toBe(404);
  const d: any = await (
    await request(`/api/automations/${a.id}/discovery`, s)
  ).json();
  expect(
    (
      await request(`/api/automations/${a.id}/adopt`, s, "POST", {
        choice: d.flows[0].choice,
      })
    ).status,
  ).toBe(200);
  const b = await draft(s),
    e: any = await (
      await request(`/api/automations/${b.id}/discovery`, s)
    ).json();
  expect(e.flows[0].websiteAutomationId).toBe(a.id);
  expect(
    (
      await request(`/api/automations/${b.id}/adopt`, s, "POST", {
        choice: e.flows[0].choice,
      })
    ).status,
  ).toBe(409);
  expect((await fresh(b.id)).flow_id).toBeNull();
});
it("refuses a second posting flow when the same profile is already running outside the website", async () => {
  const provider = remote();
  provider.start();
  const s = await session(),
    a = await draft(s);
  const d: any = await (
    await request(`/api/automations/${a.id}/discovery`, s)
  ).json();
  await env.DB.prepare("UPDATE automations SET config=? WHERE id=?")
    .bind(JSON.stringify(d.flows[0].config), a.id)
    .run();
  await expect(deploy(env, s.user.id, await fresh(a.id))).rejects.toMatchObject(
    { code: "duplicate_profile" },
  );
  expect(provider.calls.every((c) => c.method === "GET")).toBe(true);
});
it("ignores unsupported or damaged flow configurations", () => {
  const provider = remote();
  const damaged = structuredClone(provider.flow());
  let prepare = damaged.version.trigger;
  while (prepare.name !== "step_3") prepare = prepare.nextAction;
  prepare.settings.input.config = JSON.stringify({
    settings: {},
    accounts: [null],
  });
  expect(readExistingFlow(damaged, [])).toBeNull();
  damaged.publishedVersionId = "another-version";
  expect(readExistingFlow(damaged, [])).toBeNull();
});

it("imports spaced legacy account names and a daily cap different from posting hours", async () => {
  const provider = remote(),
    s = await session(),
    a = await draft(s);
  const flow = provider.flow();
  let prepare = flow.version.trigger;
  while (prepare.name !== "step_3") prepare = prepare.nextAction;
  const raw = JSON.parse(prepare.settings.input.config);
  raw.accounts[0].name = "Stunning Crochet";
  raw.accounts[0].dailyCap = 2;
  raw.accounts[0].hours = [9, 12, 15, 18];
  prepare.settings.input.config = JSON.stringify(raw);
  const response = await request(`/api/automations/${a.id}/discovery`, s);
  expect(response.status).toBe(200);
  const result = (await response.json()) as any;
  expect(result.flows).toHaveLength(1);
  expect(result.flows[0].config.accounts[0]).toMatchObject({
    name: "Stunning Crochet",
    username: "crochettest",
    pinsPerDay: 4,
    legacyDailyCap: 2,
  });
  expect(
    (
      await request(`/api/automations/${a.id}/adopt`, s, "POST", {
        choice: result.flows[0].choice,
      })
    ).status,
  ).toBe(200);
  const saved = await fresh(a.id);
  expect(JSON.parse(saved.config).accounts[0].name).toBe("Stunning Crochet");
  expect(provider.calls.every((c) => c.method === "GET")).toBe(true);
});

it("refreshes changed published settings from the provider without writing its flow or replacing website-only account metadata", async () => {
  const provider = remote(),
    s = await session(),
    a = await draft(s);
  const discovery: any = await (
    await request(`/api/automations/${a.id}/discovery`, s)
  ).json();
  await request(`/api/automations/${a.id}/adopt`, s, "POST", {
    choice: discovery.flows[0].choice,
  });
  const before = await fresh(a.id),
    config = JSON.parse(before.config);
  config.accounts[0].category = "crochet";
  config.accounts[0].website = "https://example.test/catalog";
  await env.DB.prepare(
    "UPDATE automations SET config=?,applied_config=? WHERE id=?",
  )
    .bind(JSON.stringify(config), JSON.stringify(config), a.id)
    .run();
  await env.DB.prepare(
    "INSERT INTO schedule_jobs(id,automation_id,account_id,account_name,schedule_revision,planned_at,local_day,status) VALUES('old-provider-slot',?,?,?, ?,?,'2026-10-21','pending')",
  )
    .bind(
      a.id,
      config.accounts[0].id,
      config.accounts[0].name,
      before.applied_revision,
      Math.floor(Date.now() / 1000) + 3600,
    )
    .run();
  provider.publishSettings(
    { emailTo: "reports@example.test", notifyTelegram: false, reportHour: 20 },
    [8, 12, 17],
  );
  expect(await reconcile(env, s.user.id, await fresh(a.id))).toMatchObject({
    status: "paused",
    synced: true,
  });
  const saved = await fresh(a.id),
    current = JSON.parse(saved.config);
  expect(current).toMatchObject({
    emailTo: "reports@example.test",
    notifyTelegram: false,
    reportHour: 20,
  });
  expect(current.accounts[0]).toMatchObject({
    id: config.accounts[0].id,
    category: "crochet",
    website: "https://example.test/catalog",
    hours: [8, 12, 17],
  });
  expect(saved.revision).toBe(before.revision + 1);
  expect(saved.applied_revision).toBe(saved.revision);
  expect(saved.sheet_url).toBe(before.sheet_url);
  expect(saved.flow_id).toBe(before.flow_id);
  expect(
    (
      await env.DB.prepare(
        "SELECT status FROM schedule_jobs WHERE id='old-provider-slot'",
      ).first<any>()
    ).status,
  ).toBe("cancelled");
  expect(provider.calls.every((c) => c.method === "GET")).toBe(true);
});
it("refreshing identical provider settings does not create revisions or shuffle pending jobs", async () => {
  const provider = remote(),
    s = await session(),
    a = await draft(s);
  const discovery: any = await (
    await request(`/api/automations/${a.id}/discovery`, s)
  ).json();
  await request(`/api/automations/${a.id}/adopt`, s, "POST", {
    choice: discovery.flows[0].choice,
  });
  const before = await fresh(a.id);
  const response = await request(`/api/automations/${a.id}/sync`, s, "POST", {
    revision: before.revision,
  });
  expect(response.status).toBe(200);
  expect((await fresh(a.id)).revision).toBe(before.revision);
  expect(provider.calls.every((c) => c.method === "GET")).toBe(true);
});
it("protects pending website edits and requires an explicit revision-checked choice to reload provider settings", async () => {
  const provider = remote(),
    s = await session(),
    a = await draft(s);
  const discovery: any = await (
    await request(`/api/automations/${a.id}/discovery`, s)
  ).json();
  await request(`/api/automations/${a.id}/adopt`, s, "POST", {
    choice: discovery.flows[0].choice,
  });
  await env.DB.prepare("UPDATE automations SET revision=revision+1 WHERE id=?")
    .bind(a.id)
    .run();
  provider.publishSettings({ emailTo: "fresh@example.test" });
  const before = await fresh(a.id);
  expect(await reconcile(env, s.user.id, before)).toMatchObject({
    status: "problem",
  });
  expect((await fresh(a.id)).config).toBe(before.config);
  expect(
    (
      await request(`/api/automations/${a.id}/sync`, s, "POST", {
        revision: before.revision,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request(`/api/automations/${a.id}/sync`, s, "POST", {
        revision: before.revision - 1,
        discard: true,
      })
    ).status,
  ).toBe(409);
  const other = await session("member-b");
  expect(
    (
      await request(`/api/automations/${a.id}/sync`, other, "POST", {
        revision: before.revision,
        discard: true,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await request(`/api/automations/${a.id}/sync`, s, "POST", {
        revision: before.revision,
        discard: true,
      })
    ).status,
  ).toBe(200);
  expect(JSON.parse((await fresh(a.id)).config).emailTo).toBe(
    "fresh@example.test",
  );
  expect(provider.calls.every((c) => c.method === "GET")).toBe(true);
});

it("marks an imported website-managed flow for reconnection instead of treating a deleted website callback as healthy", async () => {
  const provider = remote(),
    s = await session(),
    a = await draft(s);
  provider.publishSettings({
    website: "https://example.test/api/execute/deleted-record/old-token",
  });
  const discovery: any = await (
    await request(`/api/automations/${a.id}/discovery`, s)
  ).json();
  expect(
    (
      await request(`/api/automations/${a.id}/adopt`, s, "POST", {
        choice: discovery.flows[0].choice,
      })
    ).status,
  ).toBe(200);
  await reconcile(env, s.user.id, await fresh(a.id));
  expect((await fresh(a.id)).error_code).toBe("schedule_reconnect");
  expect((await fresh(a.id)).scheduler_enabled).toBe(0);
  expect(provider.calls.every((c) => c.method === "GET")).toBe(true);
});
