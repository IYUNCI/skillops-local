const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJsonPath = path.join(root, "package.json");
const appGoPath = path.join(root, "wails", "app.go");
const wailsJsonPath = path.join(root, "wails", "wails.json");
const SHOULD_BUMP = process.argv.includes("--bump");

const APP_AUTHOR = "yunpai";
const APP_COPYRIGHT_OWNER = "云磁数字";
const APP_COPYRIGHT = `Copyright © 2026 ${APP_COPYRIGHT_OWNER}`;

function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-[^\+]+)?(?:\+[^\s]+)?$/);
  if (!match) {
    throw new Error(`package.json version 格式不合法: ${version || "(empty)"}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpPatch(version) {
  const parsed = parseSemver(version);
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`读取 JSON 失败: ${filePath} - ${error.message}`);
  }
}

const pkg = readJSON(packageJsonPath);
let version = String(pkg.version || "").trim();
const hasAuthor = String(pkg.author || "").trim() === APP_AUTHOR;
let shouldWritePackageJson = false;

if (SHOULD_BUMP) {
  const nextVersion = bumpPatch(version);
  version = nextVersion;
  pkg.version = nextVersion;
  shouldWritePackageJson = true;
}

if (!hasAuthor) {
  pkg.author = APP_AUTHOR;
  shouldWritePackageJson = true;
}

if (shouldWritePackageJson) {
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

const wailsJson = readJSON(wailsJsonPath);
wailsJson.info = wailsJson.info || {};
wailsJson.author = wailsJson.author || {};
wailsJson.author.name = APP_AUTHOR;
wailsJson.author.email = "";
wailsJson.info.productVersion = version;
wailsJson.info.copyright = APP_COPYRIGHT;
fs.writeFileSync(wailsJsonPath, `${JSON.stringify(wailsJson, null, 2)}\n`, "utf8");

let appSource = fs.readFileSync(appGoPath, "utf8");
const oldSource = appSource;

function replaceConst(source, key, value, width) {
  const pattern = new RegExp(`${key}\\s*=\\s*\\\"[^\\\"]*\\\"`);
  if (!pattern.test(source)) {
    throw new Error(`未找到 ${key} 常量，版本同步失败。`);
  }
  return source.replace(pattern, `${key}${" ".repeat(Math.max(0, width - key.length))}= \"${value}\"`);
}

appSource = replaceConst(oldSource, "appVersion", version, "appVersion".length + 12);
appSource = replaceConst(appSource, "appAuthor", APP_AUTHOR, "appAuthor".length + 13);
appSource = replaceConst(appSource, "appCopyright", APP_COPYRIGHT, "appCopyright".length + 10);

fs.writeFileSync(appGoPath, appSource, "utf8");

if (SHOULD_BUMP) {
  console.log(`已递增并同步桌面版本：${version}`);
} else {
  console.log(`已同步桌面版本：${version}`);
}
