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
