import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakeWorld } from "../engine/tests/fake-world.mjs";
import { defaultState, emptyAccount } from "../engine/panel/generator.js";
import { buildWebsiteFlow } from "../server/flow-builder.mjs";
const template = fs.readFileSync("engine/dist/poster.template.json", "utf8");
function state() {
  return {
    ...defaultState(),
    google: "google-connection",
    gmail: "gmail-connection",
    emailTo: "owner@example.com",
    botEmail: "bot@example.com",
    accounts: [
      {
        ...emptyAccount(),
        name: "testprofile",
        username: "testprofile",
        connection: "pinterest-connection",
        general: true,
        on: false,
      },
    ],
  };
}
function codeStep(flow, name) {
  let step = flow.trigger;
  while (step) {
    if (step.name === name) return step;
    step = step.nextAction;
  }
  throw Error("Step not found");
}
test("separate automations create isolated Sheets and preserve the existing workspace", async () => {
  const w = new FakeWorld(),
    originalFetch = globalThis.fetch;
  w.install();
  try {
    const first = buildWebsiteFlow(
      template,
      state(),
      "11111111-1111-4111-8111-111111111111",
      "First",
      "v1",
      null,
    );
    const second = buildWebsiteFlow(
      template,
      state(),
      "22222222-2222-4222-8222-222222222222",
      "Second",
      "v2",
      null,
    );
    const run = async (flow) => {
      const step = codeStep(flow, "step_3");
      const module = await import(
        "data:text/javascript;base64," +
          Buffer.from(step.settings.sourceCode.code).toString("base64")
      );
      return module.code({
        google: { access_token: w.tokens.google },
        gmail: { access_token: w.tokens.gmail },
        config: step.settings.input.config,
      });
    };
    const result1 = await run(first);
    const before = JSON.stringify([...w.books.values()][0]);
    const result2 = await run(second);
    assert.equal(w.books.size, 2);
    assert.notEqual(result1.spreadsheet, result2.spreadsheet);
    assert.equal(JSON.stringify([...w.books.values()][0]), before);
    assert.equal(w.pins.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("the first scheduled run is one-time and the normal schedule is restored by a separate build", () => {
  const at = "2026-10-19T15:23:00Z";
  const boot = buildWebsiteFlow(
    template,
    state(),
    "11111111-1111-4111-8111-111111111111",
    "Posting",
    "v1",
    "https://example.test/api/callback/safe",
    at,
  );
  assert.equal(boot.trigger.settings.input.cronExpression, "23 15 19 10 *");
  assert.equal(boot.trigger.settings.input.timezone, "UTC");
  const regular = buildWebsiteFlow(
    template,
    state(),
    "11111111-1111-4111-8111-111111111111",
    "Posting",
    "v1",
    null,
  );
  assert.equal(regular.trigger.settings.input.cronExpression, "0 6-23 * * *");
  const callback = codeStep(boot, "website_status");
  assert.equal(
    callback.settings.errorHandlingOptions.continueOnFailure.value,
    true,
  );
});
test("a flow cannot be built with missing accounts or invalid connections", () => {
  assert.throws(() =>
    buildWebsiteFlow(
      template,
      { ...state(), accounts: [] },
      "11111111-1111-4111-8111-111111111111",
      "Posting",
      "v1",
      null,
    ),
  );
  assert.throws(() =>
    buildWebsiteFlow(template, state(), "unsafe-code", "Posting", "v1", null),
  );
});
test("the website flow keeps the verified Telegram recipient even when another chat is newer", async () => {
  const w = new FakeWorld(),
    originalFetch = globalThis.fetch;
  w.install();
  try {
    const flow = buildWebsiteFlow(
      template,
      {
        ...state(),
        notifyTelegram: true,
        telegram: "telegram-connection",
        telegramChat: "123",
      },
      "33333333-3333-4333-8333-333333333333",
      "Verified bot",
      "v1",
      null,
    );
    const step = codeStep(flow, "step_3");
    const module = await import(
      "data:text/javascript;base64," +
        Buffer.from(step.settings.sourceCode.code).toString("base64")
    );
    await module.code({
      google: { access_token: w.tokens.google },
      gmail: { access_token: w.tokens.gmail },
      telegram: { secret_text: "test-bot-token" },
      config: step.settings.input.config,
    });
    assert.equal(
      w.rows("Settings").find((row) => row[0] === "Telegram chat ID")[1],
      "123",
    );
    assert.equal(w.pins.length, 0);
    assert.throws(
      () =>
        buildWebsiteFlow(
          template,
          { ...state(), notifyTelegram: true, telegram: "telegram-connection" },
          "33333333-3333-4333-8333-333333333333",
          "Missing chat",
          "v1",
          null,
        ),
      /Confirm your Telegram chat/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
async function prepare(flow, w) {
  const step = codeStep(flow, "step_3");
  const module = await import(
    "data:text/javascript;base64," +
      Buffer.from(step.settings.sourceCode.code).toString("base64")
  );
  return module.code({
    google: { access_token: w.tokens.google },
    gmail: { access_token: w.tokens.gmail },
    telegram: { secret_text: "test-bot-token" },
    config: step.settings.input.config,
  });
}
test("importing a legacy automation preserves its Sheet and Telegram recipient", async () => {
  const w = new FakeWorld(),
    originalFetch = globalThis.fetch;
  w.install();
  try {
    const config = {
      ...state(),
      notifyTelegram: true,
      telegram: "telegram-connection",
      telegramChat: "123",
    };
    const first = buildWebsiteFlow(
      template,
      config,
      "11111111-1111-4111-8111-111111111111",
      "Original",
      "old",
      null,
      null,
      "",
    );
    const previous = await prepare(first, w);
    delete config.telegramChat;
    config.reuseTelegramRecipient = true;
    const imported = buildWebsiteFlow(
      template,
      config,
      "22222222-2222-4222-8222-222222222222",
      "Original",
      "new",
      null,
      null,
      "",
      true,
    );
    const updated = await prepare(imported, w);
    assert.equal(updated.spreadsheet, previous.spreadsheet);
    assert.equal(w.books.size, 1);
    assert.equal(
      w.rows("Settings").find((r) => r[0] === "Telegram chat ID")[1],
      "123",
    );
    assert.deepEqual(updated.due, []);
    assert.equal(updated.reportDue, false);
    assert.equal(w.pins.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("a separate automation reuses the saved recipient through Google without changing its source Sheet", async () => {
  const w = new FakeWorld(),
    originalFetch = globalThis.fetch;
  w.install();
  try {
    const original = buildWebsiteFlow(
      template,
      {
        ...state(),
        notifyTelegram: true,
        telegram: "telegram-connection",
        telegramChat: "123",
      },
      "11111111-1111-4111-8111-111111111111",
      "Original",
      "old",
      null,
    );
    const first = await prepare(original, w);
    const before = JSON.stringify([...w.books.values()][0]);
    const recipientSheet = new URL(first.spreadsheet).pathname.split("/")[3];
    const second = buildWebsiteFlow(
      template,
      {
        ...state(),
        notifyTelegram: true,
        telegram: "telegram-connection",
        telegramRecipientSheet: recipientSheet,
      },
      "22222222-2222-4222-8222-222222222222",
      "Separate",
      "new",
      null,
    );
    await prepare(second, w);
    assert.equal(w.books.size, 2);
    assert.equal(JSON.stringify([...w.books.values()][0]), before);
    const book = [...w.books.values()][1];
    const settings = book.tabs.find((t) => t.title === "Settings");
    assert.equal(
      settings.grid.find((r) => r[0] === "Telegram chat ID")[1],
      "123",
    );
    assert.equal(w.pins.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("a settings-only update suppresses work even when an active account needs its daily sync", async () => {
  const w = new FakeWorld(),
    originalFetch = globalThis.fetch;
  w.install();
  try {
    const config = state();
    config.accounts[0].on = true;
    const normal = buildWebsiteFlow(
      template,
      config,
      "11111111-1111-4111-8111-111111111111",
      "Posting",
      "normal",
      null,
    );
    assert.equal((await prepare(normal, w)).due.length, 1);
    const update = buildWebsiteFlow(
      template,
      config,
      "11111111-1111-4111-8111-111111111111",
      "Posting",
      "updated",
      null,
      null,
      undefined,
      true,
    );
    const result = await prepare(update, w);
    assert.deepEqual(result.due, []);
    assert.equal(result.reportDue, false);
    assert.equal(w.pins.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("an existing bot with no saved recipient fails instead of choosing a different private chat", async () => {
  const w = new FakeWorld(),
    originalFetch = globalThis.fetch;
  w.install();
  try {
    const config = {
      ...state(),
      notifyTelegram: true,
      telegram: "telegram-connection",
      reuseTelegramRecipient: true,
    };
    const flow = buildWebsiteFlow(
      template,
      config,
      "11111111-1111-4111-8111-111111111111",
      "Missing recipient",
      "new",
      null,
    );
    await assert.rejects(
      prepare(flow, w),
      /saved Telegram recipient is missing/,
    );
    assert.equal(
      w.requests.some((r) => r.url.includes("getUpdates")),
      false,
    );
    assert.equal(w.sent.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("website scheduling denies publication without a one-use website authorization", async () => {
  const w = new FakeWorld(),
    originalFetch = globalThis.fetch;
  w.install();
  try {
    const s = state();
    s.websiteSchedule = true;
    s.accounts[0].on = true;
    s.accounts[0].username = "testprofile";
    s.accounts[0].id = "profile";
    const flow = buildWebsiteFlow(
      template,
      s,
      "11111111-1111-4111-8111-111111111111",
      "Scheduled",
      "v-schedule",
      "https://example.test/api/callback/11111111-1111-4111-8111-111111111111/secret",
    );
    assert.equal(flow.trigger.settings.input.cronExpression, "7 0 * * *");
    const prep = codeStep(flow, "step_3");
    const config = JSON.parse(prep.settings.input.config);
    assert.equal(
      config.settings.website,
      "https://example.test/api/execute/11111111-1111-4111-8111-111111111111/secret",
    );
    let claims = 0;
    const providerFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      if (String(url).endsWith("/claim")) {
        claims++;
        return Response.json({ jobs: [], commands: [] });
      }
      return providerFetch(url, opts);
    };
    const module = await import(
      "data:text/javascript;base64," +
        Buffer.from(prep.settings.sourceCode.code).toString("base64")
    );
    const result = await module.code({
      google: { access_token: w.tokens.google },
      gmail: { access_token: w.tokens.gmail },
      config: prep.settings.input.config,
    });
    assert.equal(claims, 1);
    assert.ok(result.due.every((d) => d.publish === false));
    assert.equal(w.pins.length, 0);
    const rows = w.rows("Accounts");
    const userCol = rows[0].indexOf("Pinterest username");
    assert.equal(rows[1][userCol], "@testprofile");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the website contract publishes once and confirms the actual queue receipt", async () => {
  const w = new FakeWorld(),
    originalFetch = globalThis.fetch;
  w.install();
  try {
    w.pinterestUsers["p-token-1"] = "testprofile";
    w.boards.push({
      id: "b-main",
      name: "Main board",
      privacy: "PUBLIC",
      owner: "p-token-1",
    });
    const s = state();
    s.websiteSchedule = true;
    s.accounts[0] = { ...s.accounts[0], id: "profile", on: true };
    const flow = buildWebsiteFlow(
      template,
      s,
      "11111111-1111-4111-8111-111111111111",
      "Scheduled",
      "v-contract",
      "https://example.test/api/callback/11111111-1111-4111-8111-111111111111/secret",
    );
    const prep = codeStep(flow, "step_3"),
      job = {
        id: "33333333-3333-4333-8333-333333333333",
        name: "testprofile",
        accountId: "profile",
        token: "lease",
      };
    const providerFetch = globalThis.fetch;
    let allowed = false,
      commands = [],
      snapshot,
      finished = [];
    globalThis.fetch = async (url, opts) => {
      const path = String(url),
        body = opts?.body ? JSON.parse(opts.body) : {};
      if (path.endsWith("/claim"))
        return Response.json({ jobs: [job], commands });
      if (path.endsWith("/authorize")) {
        const answer = allowed;
        allowed = false;
        return Response.json({ allowed: answer });
      }
      if (path.endsWith("/finish")) {
        finished.push(body);
        return Response.json({ ok: true });
      }
      if (path.endsWith("/snapshot")) {
        snapshot = body;
        return Response.json({ ok: true });
      }
      return providerFetch(url, opts);
    };
    const load = (step) =>
      import(
        "data:text/javascript;base64," +
          Buffer.from(step.settings.sourceCode.code).toString("base64")
      );
    const prepared = await (
      await load(prep)
    ).code({
      google: { access_token: w.tokens.google },
      gmail: { access_token: w.tokens.gmail },
      config: prep.settings.input.config,
    });
    const accountRows = w.rows("Accounts"),
      a = accountRows[1],
      folder =
        a[accountRows[0].indexOf("Media folder")].match(/folders\/([^/?]+)/)[1];
    w.addImage(folder, "test.jpg");
    const pin = {
      "Pin ID": "proof-pin",
      Status: "Ready",
      Account: "testprofile",
      "Media type": "Image",
      Media: "test.jpg",
      Title: "Summer crochet bag",
      Description: "A handmade bag idea.",
      Link: "https://example.com/bag",
      Board: "Main board",
      Batch: "contract",
    };
    const rows = w.rows("Pins – testprofile");
    rows.push(rows[0].map((h) => pin[h] || ""));
    const engineStep = codeStep(flow, "step_4").firstLoopAction.nextAction;
    const engine = await load(engineStep),
      input = {
        google: { access_token: w.tokens.google },
        gmail: { access_token: w.tokens.gmail },
        pinterest: { access_token: "p-token-1" },
        accountName: "testprofile",
        publish: true,
        quietQueue: true,
        websiteJob: prepared.due.find((d) => d.publish).websiteJob,
      };
    assert.equal((await engine.code(input)).outcome, "cancelled by website");
    assert.equal(w.pins.length, 0);
    allowed = true;
    assert.equal((await engine.code(input)).outcome, "published");
    assert.equal(w.pins.length, 1);
    assert.equal((await engine.code(input)).outcome, "cancelled by website");
    assert.equal(w.pins.length, 1);
    const status = codeStep(flow, "website_status");
    // The final status callback is independent of the queue-sync callback.
    globalThis.fetch = async (url, opts) =>
      String(url).includes("/api/callback/")
        ? Response.json({ accepted: true })
        : await (async () => {
            const path = String(url),
              body = opts?.body ? JSON.parse(opts.body) : {};
            if (path.endsWith("/snapshot")) {
              snapshot = body;
              return Response.json({ ok: true });
            }
            if (path.endsWith("/finish")) return Response.json({ ok: true });
            return providerFetch(url, opts);
          })();
    await (
      await load(status)
    ).code({
      google: { access_token: w.tokens.google },
      config: prep.settings.input.config,
      spreadsheet: prepared.spreadsheet,
      jobs: [],
      commands: [],
    });
    assert.equal(snapshot.accounts[0].counts.Done, 1);
    assert.ok(snapshot.accounts[0].pins[0].pinUrl.includes("/pin/"));
    assert.equal(snapshot.accounts[0].pins[0].rowNumber, 2);
    assert.equal(snapshot.accounts[0].pins[0].publishAfter, "");
    assert.equal(typeof snapshot.accounts[0].health, "string");
    // A long published history must not hide the next ready rows from the preview.
    for (let i = 0; i < 510; i++)
      rows.push(
        rows[0].map((h) =>
          h === "Pin ID"
            ? `done-${i}`
            : h === "Status"
              ? "Done"
              : h === "Title"
                ? "Older pin"
                : "",
        ),
      );
    const next = {
      ...pin,
      "Pin ID": "future-ready",
      Status: "Ready",
      "Publish after": "2099-01-01 10:00",
    };
    rows.push(rows[0].map((h) => next[h] || ""));
    await (
      await load(status)
    ).code({
      google: { access_token: w.tokens.google },
      config: prep.settings.input.config,
      spreadsheet: prepared.spreadsheet,
      jobs: [],
      commands: [],
    });
    assert.equal(snapshot.accounts[0].counts.Done, 511);
    assert.equal(snapshot.accounts[0].counts.Ready, 1);
    assert.equal(snapshot.accounts[0].pins.length, 500);
    assert.equal(snapshot.accounts[0].pins[0].id, "future-ready");
    assert.equal(snapshot.accounts[0].pins[0].publishAfter, "2099-01-01 10:00");
    assert.ok(finished.some((x) => x.outcome === "published"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
