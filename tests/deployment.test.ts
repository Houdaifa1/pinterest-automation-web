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
    runStatus = "SUCCEEDED";
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
    const run = {
      id: "seed-run",
      flowId: "new-flow",
      flowVersionId: "version-1",
      status: runStatus,
    };
    if (url.pathname.endsWith("/flow-runs")) return respond({ data: [run] });
    if (url.pathname.endsWith("/flow-runs/seed-run"))
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
    failRun() {
      runStatus = "FAILED";
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
