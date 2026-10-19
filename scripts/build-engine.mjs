import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
execFileSync("python3", ["tools/build.py"], { cwd: "engine", stdio: "pipe" });
mkdirSync(".build", { recursive: true });
writeFileSync(
  ".build/engine.ts",
  `export const template = ${JSON.stringify(readFileSync("engine/dist/poster.template.json", "utf8"))};\nexport const promptTemplate = ${JSON.stringify(readFileSync("engine/panel/codex-prompt.md", "utf8"))};\n`,
);
