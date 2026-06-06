const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const identity = process.env.MACOS_SIGNING_IDENTITY?.trim();
const buildRoot = path.join(process.env.HOME || "", ".skillops", "builds", "wails", "mac-arm64");
const entitlementsPath = path.join(root, "wails", "build", "darwin", "entitlements.mas.plist");

if (!identity) {
  console.error("Please set MACOS_SIGNING_IDENTITY to the exact name from `security find-identity -v -p codesigning`.");
  process.exit(1);
}

if (!fs.existsSync(buildRoot)) {
  console.error(`Build root not found: ${buildRoot}`);
  process.exit(1);
}

const candidateAppNames = [
  ...(process.env.MACOS_APP_NAME ? [process.env.MACOS_APP_NAME] : []),
  "SkillOps Local.app",
  "SkillOpsLocal.app",
];

let appPath = process.env.MACOS_APP_PATH?.trim();
if (!appPath) {
  for (const name of candidateAppNames) {
    const absolutePath = path.join(buildRoot, name);
    if (fs.existsSync(absolutePath)) {
      appPath = absolutePath;
      break;
    }
  }
}

if (appPath) {
  appPath = path.isAbsolute(appPath) ? appPath : path.resolve(process.cwd(), appPath);
}

if (!appPath) {
  const candidates = fs
    .readdirSync(buildRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"))
    .map((entry) => path.join(buildRoot, entry.name));

  if (candidates.length > 0) {
    appPath = candidates[0];
  }
}

if (!appPath) {
  console.error(`Could not resolve app path in ${buildRoot}. Set MACOS_APP_PATH explicitly.`);
  process.exit(1);
}

if (!fs.existsSync(appPath)) {
  console.error(`App path not found: ${appPath}`);
  process.exit(1);
}

if (!fs.existsSync(entitlementsPath)) {
  console.error(`Entitlements file not found: ${entitlementsPath}`);
  process.exit(1);
}

const args = [
  "--deep",
  "--force",
  "--entitlements",
  entitlementsPath,
  "--sign",
  identity,
  appPath
];

if (process.env.MACOS_SIGN_NO_RUNTIME !== "true") {
  args.splice(2, 0, "--options", "runtime");
}

if (process.env.MACOS_SIGN_NO_TIMESTAMP !== "true") {
  args.push("--timestamp");
}

console.log(`Signing app with identity: ${identity}`);
const signResult = spawnSync("/usr/bin/codesign", args, { stdio: "inherit", shell: false });
if (signResult.status !== 0) {
  process.exit(signResult.status ?? 1);
}

console.log(`Verifying signature: ${appPath}`);
const verifyResult = spawnSync("/usr/bin/codesign", ["--verify", "--verbose=4", "--deep", appPath], { stdio: "inherit", shell: false });
if (verifyResult.status !== 0) {
  process.exit(verifyResult.status ?? 1);
}

console.log("App Store signing complete.");
