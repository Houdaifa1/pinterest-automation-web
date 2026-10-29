import { env } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { defaultState, emptyAccount } from "../engine/panel/generator.js";
import { deploy, reconcile } from "../server/deployment";
import { encrypt } from "../server/security";
afterEach(() => vi.restoreAllMocks());
const firstId = "11111111-1111-4111-8111-111111111111";
async function setup(id = firstId) {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users VALUES('member','google-sub','member@example.test','Member','active',1,1)",
  ).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO integrations VALUES('integration','member',?,'project','Project',1)",
  )
    .bind(await encrypt(env, "test-key", "member"))
    .run();
  for (const service of ["google", "gmail", "pinterest"])
    await env.DB.prepare(
      "INSERT OR IGNORE INTO connections VALUES(?,'member','integration',?,?,?,?,?,'ACTIVE')",
    )
      .bind(
        service,
        "remote-" + service,
        "external-" + service,
        service,
        service,
        service === "pinterest" ? "testprofile" : "bot@example.test",
      )
      .run();
  const config = {
    ...defaultState(),
    google: "google",
    gmail: "gmail",
    emailTo: "member@example.test",
    botEmail: "bot@example.test",
    accounts: [
      {
        ...emptyAccount(),
        id: "profile",
        name: "testprofile",
        username: "testprofile",
        connection: "pinterest",
        general: true,
        on: true,
      },
    ],
  };
  await env.DB.prepare(
    "INSERT OR IGNORE INTO automations(id,user_id,integration_id,name,config,revision,created_at,updated_at) VALUES(?,'member','integration','Posting',?,1,1,1)",
  )
    .bind(id, JSON.stringify(config))
    .run();
  return fresh(id);
}
async function fresh(id = firstId) {
  return (await env.DB.prepare("SELECT * FROM automations WHERE id=?")
    .bind(id)
    .first()) as any;
}
function provider() {
  let created = 0,
    version = 0,
    status = "DISABLED",
    published = "",
    failImport = false,
    runStatus = "SUCCEEDED",
    environment = "PRODUCTION",
    hasRun = true,
    retryCount = 0,
    latestRunId = "seed-run",
    latestRunVersion = "version-1";
  const calls: any[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
    const url = new URL(String(input)),
      method = options?.method || "GET",
      body = options?.body ? JSON.parse(String(options.body)) : null;
    calls.push({ path: url.pathname, method, body });
    const respond = (value: any, code = 200) =>
      new Response(JSON.stringify(value), { status: code });
    const flow = () => ({
      id: "new-flow",
      status,
      publishedVersionId: published,
      version: { id: "version-" + version },
    });
    if (url.pathname.endsWith("/flows") && method === "GET")
      return respond({ data: [] });
    if (url.pathname.endsWith("/flows") && method === "POST") {
      created++;
      return respond({ id: "new-flow" });
    }
    if (url.pathname.endsWith("/flows/new-flow")) {
      if (method === "GET") return respond(flow());
      if (body.type === "IMPORT_FLOW") {
        if (failImport) {
          failImport = false;
          return respond({}, 500);
        }
        version++;
      }
      if (body.type === "LOCK_AND_PUBLISH") published = "version-" + version;
      if (body.type === "CHANGE_STATUS") status = body.request.status;
      return respond(flow());
    }
    if (
      url.pathname.endsWith("/flow-runs/seed-run/retry") &&
      method === "POST"
    ) {
      latestRunId = `retry-${++retryCount}`;
      latestRunVersion = `version-${version}`;
      return respond({ id: latestRunId });
    }
    const run = {
      id: latestRunId,
      flowId: "new-flow",
      flowVersionId: latestRunVersion,
      status: runStatus,
      environment,
    };
    if (url.pathname.endsWith("/flow-runs"))
      return respond({ data: hasRun ? [run] : [] });
    if (
      url.pathname.endsWith("/flow-runs/seed-run") ||
      url.pathname.endsWith(`/flow-runs/${latestRunId}`)
    )
      return respond({
        ...run,
        steps: {
          step_3: {
            output: {
              spreadsheet:
                "https://docs.google.com/spreadsheets/d/isolated-sheet/edit",
            },
          },
          login: { output: { access_token: "must-stay-private" } },
        },
      });
    throw Error("Unexpected provider request " + method + " " + url.pathname);
  });
  return {
    calls,
    get created() {
      return created;
    },
    failNextImport() {
      failImport = true;
    },
    pause() {
      status = "DISABLED";
    },
    failRun() {
      runStatus = "FAILED";
    },
    noRuns() {
      hasRun = false;
    },
    testRun() {
      environment = "TESTING";
    },
    running() {
      runStatus = "RUNNING";
    },
    republish() {
      version++;
      published = "version-" + version;
    },
  };
}
it("repeated deployment requests create one flow and only confirm application after a successful matching run", async () => {
  const a = await setup(),
    remote = provider();
  await deploy(env, "member", a);
  await deploy(env, "member", a);
  expect(remote.created).toBe(1);
  const pending = await fresh();
  expect(pending.status).toBe("starting");
  expect(pending.applied_revision).toBe(0);
  expect(pending.sheet_url).toBeNull();
  const done = await reconcile(env, "member", pending);
  expect(done.status).toBe("running");
  const saved = await fresh();
  expect(saved.applied_revision).toBe(1);
  expect(saved.applied_config).toBe(saved.config);
  expect(saved.seed_run_id).toBe("seed-run");
  const imports = remote.calls.filter((x) => x.body?.type === "IMPORT_FLOW");
  expect(imports).toHaveLength(2);
  expect(imports[1].body.request.trigger.settings.input.cronExpression).toBe(
    "0 6-23 * * *",
  );
  expect(JSON.stringify(done)).not.toContain("must-stay-private");
});
it("a failed import retains the created flow so a retry does not create a duplicate", async () => {
  const a = await setup(),
    remote = provider();
  remote.failNextImport();
  await expect(deploy(env, "member", a)).rejects.toMatchObject({
    code: "service_error",
  });
  const failed = await fresh();
  expect(failed.status).toBe("problem");
  expect(failed.flow_id).toBe("new-flow");
  await deploy(env, "member", failed);
  expect(remote.created).toBe(1);
});
it("a failed run never marks a deployment as applied", async () => {
  const a = await setup(),
    remote = provider();
  await deploy(env, "member", a);
  remote.failRun();
  expect(await reconcile(env, "member", await fresh())).toEqual({
    status: "problem",
  });
  expect((await fresh()).applied_revision).toBe(0);
  expect((await fresh()).sheet_url).toBeNull();
  expect(await reconcile(env, "member", await fresh())).toEqual({
    status: "problem",
  });
});

it("a republished setup stops waiting and retries the same flow with a new setup time", async () => {
  const a = await setup(),
    remote = provider();
  await deploy(env, "member", a);
  remote.noRuns();
  remote.republish();
  expect(await reconcile(env, "member", await fresh())).toEqual({
    status: "problem",
  });
  const failed = await fresh();
  expect(failed.error_code).toBe("setup_changed");
  expect(failed.applied_revision).toBe(0);
  expect(await reconcile(env, "member", failed)).toEqual({ status: "problem" });
  await deploy(env, "member", await fresh());
  const retry = await fresh();
  expect(remote.created).toBe(1);
  expect(retry.flow_id).toBe(failed.flow_id);
  expect(retry.status).toBe("starting");
  expect(retry.error_code).toBeNull();
  expect(retry.flow_version_id).not.toBe(failed.flow_version_id);
  const imported = remote.calls
    .filter((x) => x.body?.type === "IMPORT_FLOW")
    .at(-1).body.request;
  expect(
    imported.trigger.settings.input.cronExpression.split(" "),
  ).toHaveLength(5);
  expect(imported.trigger.settings.input.cronExpression).not.toContain("6-23");
});

it("editor tests cannot confirm setup and a missing first run exposes recovery after 15 minutes", async () => {
  const a = await setup(),
    remote = provider();
  await deploy(env, "member", a);
  remote.testRun();
  expect(await reconcile(env, "member", await fresh())).toEqual({
    status: "starting",
  });
  expect((await fresh()).seed_run_id).toBeNull();
  expect((await fresh()).sheet_url).toBeNull();
  await env.DB.prepare(
    "UPDATE automations SET operation_started_at=? WHERE id=?",
  )
    .bind(Math.floor(Date.now() / 1000) - 901, a.id)
    .run();
  expect(await reconcile(env, "member", await fresh())).toEqual({
    status: "problem",
  });
  expect((await fresh()).error_code).toBe("first_run_missing");
  expect((await fresh()).applied_revision).toBe(0);
});

it("a real first run still in progress is not treated as a missing run", async () => {
  const a = await setup(),
    remote = provider();
  await deploy(env, "member", a);
  remote.running();
  await env.DB.prepare(
    "UPDATE automations SET operation_started_at=? WHERE id=?",
  )
    .bind(Math.floor(Date.now() / 1000) - 901, a.id)
    .run();
  expect(await reconcile(env, "member", await fresh())).toEqual({
    status: "starting",
  });
  expect((await fresh()).error_code).toBeNull();
});
it("one Pinterest login cannot be activated in two website automations", async () => {
  const a = await setup(),
    b = await setup("22222222-2222-4222-8222-222222222222"),
    remote = provider();
  await deploy(env, "member", a);
  await expect(deploy(env, "member", b)).rejects.toMatchObject({
    code: "duplicate_profile",
  });
  expect(remote.created).toBe(1);
});

it("an existing-only setup cannot create any new provider flow even when discovery failed", async () => {
  const a = await setup();
  await env.DB.prepare(
    "UPDATE automations SET setup_intent='existing' WHERE id=?",
  )
    .bind(a.id)
    .run();
  const p = provider();
  await expect(deploy(env, "member", await fresh())).rejects.toMatchObject({
    code: "existing_required",
  });
  expect(p.calls).toHaveLength(0);
  expect((await fresh()).flow_id).toBeNull();
});

it.each(["running", "paused"])(
  "updates the same flow with minute schedules and preserves %s state",
  async (desired) => {
    const scheduledEnv = { ...env, DISPATCH_KEY: "test-dispatch-key" };
    const first = await setup(),
      remote = provider();
    const config = JSON.parse(first.config);
    config.accounts[0].schedule = {
      mode: "varied",
      start: "09:00",
      end: "21:00",
      spacingMode: "auto",
      minSpacing: 120,
      times: [],
    };
    config.accounts[0].pinsPerDay = 5;
    await env.DB.prepare("UPDATE automations SET config=? WHERE id=?")
      .bind(JSON.stringify(config), first.id)
      .run();
    await deploy(scheduledEnv, "member", await fresh());
    await reconcile(scheduledEnv, "member", await fresh());
    const previous = await fresh();
    if (desired === "paused") remote.pause();
    config.accounts[0].pinsPerDay = 10;
    config.accounts[0].schedule.minSpacing = 65;
    await env.DB.prepare(
      "UPDATE automations SET status=?,config=?,revision=2 WHERE id=?",
    )
      .bind(desired, JSON.stringify(config), first.id)
      .run();
    await deploy(scheduledEnv, "member", await fresh());
    expect((await fresh()).status).toBe("applying");
    expect((await fresh()).applied_revision).toBe(1);
    await reconcile(scheduledEnv, "member", await fresh());
    const done = await fresh();
    expect(remote.created).toBe(1);
    expect(done.flow_id).toBe(previous.flow_id);
    expect(done.sheet_url).toBe(previous.sheet_url);
    expect(done.status).toBe(desired);
    expect(done.applied_revision).toBe(2);
    expect(done.scheduler_enabled).toBe(1);
    const imported = remote.calls
      .filter((c) => c.body?.type === "IMPORT_FLOW")
      .at(-1).body.request;
    expect(imported.trigger.settings.input.cronExpression).toBe("7 0 * * *");
    let prepare = imported.trigger;
    while (prepare.name !== "step_3") prepare = prepare.nextAction;
    const installed = JSON.parse(prepare.settings.input.config);
    expect(installed.accounts[0].websiteSchedule).toMatchObject({
      mode: "varied",
      minSpacing: 65,
      spacingMode: "auto",
    });
    expect(
      remote.calls.some(
        (c) =>
          c.path.endsWith("/retry") && c.body.strategy === "ON_LATEST_VERSION",
      ),
    ).toBe(true);
  },
);

it("status checks wait for active updates and overlapping reconciliation does not become a page error", async () => {
  const a = await setup(),
    remote = provider();
  await deploy(env, "member", a);
  await env.DB.prepare(
    "UPDATE automations SET operation_id='active-update',operation_started_at=? WHERE id=?",
  )
    .bind(Math.floor(Date.now() / 1000), a.id)
    .run();
  const locked = await fresh(),
    before = remote.calls.length;
  expect(await reconcile(env, "member", locked)).toEqual({
    status: "starting",
    pending: true,
  });
  expect(remote.calls.length).toBe(before);
  await env.DB.prepare("UPDATE automations SET operation_id=NULL WHERE id=?")
    .bind(a.id)
    .run();
  const pending = await fresh();
  const outcomes = await Promise.all([
    reconcile(env, "member", pending),
    reconcile(env, "member", pending),
  ]);
  expect(outcomes.some((x) => x.status === "running")).toBe(true);
  expect((await fresh()).status).toBe("running");
});
