import { expect, it } from "vitest";
import { defaultState } from "../engine/panel/generator.js";
import { connectionsReady, detectedConfig } from "../src/setup";
const connections = [
  { id: "sheets", service: "google", identity: "bot@example.test" },
  { id: "mail", service: "gmail", identity: "bot@example.test" },
  { id: "pinterest", service: "pinterest", identity: "crochettest" },
  { id: "bot", service: "telegram", identity: "savedbot" },
].map((c) => ({ ...c, status: "ACTIVE", label: c.service }));
it("fills verified connections once and can go straight to review", () => {
  const config = detectedConfig(
    { ...defaultState(), emailTo: "member@example.test" },
    connections,
  );
  expect(config.google).toBe("sheets");
  expect(config.gmail).toBe("mail");
  expect(config.telegram).toBe("bot");
  expect(config.accounts[0].username).toBe("crochettest");
  expect(config.accounts[0].hours).toEqual([9, 12, 15, 18, 21]);
  expect(detectedConfig(config, connections)).toEqual(config);
  expect(connectionsReady(config, connections, false)).toBe(true);
  expect(
    connectionsReady({ ...config, notifyTelegram: true }, connections, false),
  ).toBe(false);
  expect(
    connectionsReady({ ...config, notifyTelegram: true }, connections, true),
  ).toBe(true);
});
it("does not choose a mismatched Gmail identity or silently choose between two Google logins", () => {
  const mismatched = connections.map((c) =>
    c.service === "gmail" ? { ...c, identity: "other@example.test" } : c,
  );
  const config = detectedConfig(
    { ...defaultState(), emailTo: "member@example.test" },
    mismatched,
  );
  expect(config.gmail).toBe("");
  expect(connectionsReady(config, mismatched, false)).toBe(false);
  const multiple = detectedConfig(defaultState(), [
    ...connections,
    { ...connections[0], id: "another-google" },
  ]);
  expect(multiple.google).toBe("");
});
