const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const wailsRoot = path.join(root, "wails");
const esbuildBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");

const copies = [
  [path.join(root, "dist"), path.join(wailsRoot, "backend-dist")],
  [path.join(root, "assets"), path.join(wailsRoot, "assets")]
];

for (const [source, target] of copies) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing Wails source folder: ${source}`);
  }

  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}

if (!fs.existsSync(esbuildBin)) {
  throw new Error("Missing esbuild binary. Run npm install before preparing the Wails app.");
}

const bundleResult = spawnSync(esbuildBin, [
  path.join(root, "src", "cli.ts"),
  "--bundle",
  "--platform=node",
  "--target=node20",
  "--format=esm",
  "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  `--outfile=${path.join(wailsRoot, "backend-dist", "cli.js")}`,
  "--log-level=warning"
], {
  cwd: root,
  stdio: "inherit",
  shell: false
});

if (bundleResult.status !== 0) {
  process.exit(bundleResult.status ?? 1);
}

fs.writeFileSync(
  path.join(wailsRoot, "backend-dist", "package.json"),
  `${JSON.stringify({ type: "module" }, null, 2)}\n`
);

console.log("Prepared Wails embedded backend assets.");
