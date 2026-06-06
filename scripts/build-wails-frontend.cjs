const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const node20Npm = "/opt/homebrew/opt/node@20/bin/npm";
const npmCommand = process.platform === "darwin" && fs.existsSync(node20Npm)
  ? node20Npm
  : process.platform === "win32"
    ? "npm.cmd"
    : "npm";
const env = { ...process.env };

if (npmCommand === node20Npm) {
  env.PATH = `${path.dirname(node20Npm)}${path.delimiter}${env.PATH || ""}`;
}

const result = spawnSync(npmCommand, ["--prefix", "wails/frontend", "run", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
  env
});

process.exit(result.status ?? 1);
