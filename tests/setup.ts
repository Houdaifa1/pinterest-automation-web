import { env, applyD1Migrations } from "cloudflare:test";
import { beforeEach } from "vitest";
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM audit"),
    env.DB.prepare("DELETE FROM users"),
    env.DB.prepare("DELETE FROM oauth_states"),
    env.DB.prepare("DELETE FROM rate_limits"),
  ]);
});
