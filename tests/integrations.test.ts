import { env } from "cloudflare:test";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ap,
  connect,
  safeRun,
  safeSheet,
  syncConnections,
} from "../server/activepieces";
import { decrypt } from "../server/security";
afterEach(() => vi.restoreAllMocks());
async function member() {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users VALUES('integration-user','sub-integration','integration@example.test','Member','active',1,1)",
  ).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO automations(id,user_id,name,created_at,updated_at) VALUES('test-automation','integration-user','Posting',1,1)",
  ).run();
  return (await env.DB.prepare(
    "SELECT * FROM automations WHERE id='test-automation'",
  ).first()) as any;
}
describe("service boundaries", () => {
  it("stores a verified key encrypted and returns only the project name", async () => {
    const automation = await member(),
      key = "private-test-key-not-for-browser";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "remote-project",
              displayName: "My project",
              privateToken: "never-return",
            },
          ],
        }),
      ),
    );
    const result = await connect(env, "integration-user", automation, key);
    expect(result).toEqual({ connected: true, name: "My project" });
    const stored = (await env.DB.prepare(
      "SELECT * FROM integrations WHERE user_id='integration-user'",
    ).first()) as any;
    expect(stored.encrypted_key).not.toContain(key);
    expect(await decrypt(env, stored.encrypted_key, "integration-user")).toBe(
      key,
    );
  });
  it("detects connections without returning remote identifiers, tokens or unsafe metadata", async () => {
    const automation = await member();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ id: "project", displayName: "Project" }] }),
      ),
    );
    await connect(env, "integration-user", automation, "test-key");
    const integration = (await env.DB.prepare(
      "SELECT * FROM integrations WHERE user_id='integration-user'",
    ).first()) as any;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "remote-secret-id",
                externalId: "remote-external-secret",
                pieceName: "@activepieces/piece-pinterest",
                displayName: "My Pinterest",
                status: "ACTIVE",
                metadata: {
                  accountIdentifier: "testprofile",
                  access_token: "credential",
                },
                value: { secret: "credential" },
              },
            ],
            next: null,
          }),
        ),
    );
    const first = await syncConnections(
      env,
      "integration-user",
      integration,
      "test-key",
    );
    const second = await syncConnections(
      env,
      "integration-user",
      integration,
      "test-key",
    );
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    const json = JSON.stringify(first);
    expect(json).toContain("testprofile");
    expect(json).not.toMatch(
      /remote-secret|remote-external|credential|access_token/,
    );
  });
  it("keeps credential-bearing run outputs out of summaries", () => {
    const raw = {
      id: "run",
      status: "SUCCEEDED",
      startTime: "2026-10-19T12:00:00Z",
      steps: {
        login: { output: { access_token: "private-oauth-value" } },
        step_3: {
          output: {
            spreadsheet:
              "https://docs.google.com/spreadsheets/d/safe-sheet/edit",
          },
        },
      },
      logs: "private-oauth-value",
    };
    expect(JSON.stringify(safeRun(raw))).not.toContain("private-oauth-value");
    expect(safeSheet(raw)).toBe(
      "https://docs.google.com/spreadsheets/d/safe-sheet/edit",
    );
    expect(
      safeSheet({
        steps: {
          step_3: { output: { spreadsheet: "https://evil.example/steal" } },
        },
      }),
    ).toBeNull();
  });
  it("rejects redirects and unsafe provider paths without leaking a key", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("", {
          status: 302,
          headers: { Location: "https://elsewhere.example" },
        }),
      );
    await expect(ap("private-key", "/projects")).rejects.toMatchObject({
      code: "service_error",
    });
    expect(fetch.mock.calls[0][1]?.redirect).toBe("manual");
    fetch.mockClear();
    await expect(ap("private-key", "//elsewhere.example")).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
