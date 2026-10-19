import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./tests/wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          TEST_JPEG: readFileSync(
            "docs/proof/screenshots/real-connections.jpg",
          ).toString("base64"),
          DEV_LOGIN: "true",
          APP_ORIGIN: "http://localhost:8788",
          OWNER_EMAIL: "owner@example.test",
          ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        },
      },
    }),
  ],
  test: { include: ["tests/**/*.test.ts"], setupFiles: ["./tests/setup.ts"] },
}));
