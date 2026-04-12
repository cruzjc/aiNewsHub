import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

const pnpmCheck = spawnSync("pnpm", ["--version"], {
  stdio: "ignore",
  shell: process.platform === "win32",
});

const command = pnpmCheck.status === 0 ? "pnpm" : "corepack";
const commandArgs = pnpmCheck.status === 0 ? args : ["pnpm", ...args];

const result = spawnSync(command, commandArgs, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
