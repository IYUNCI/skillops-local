const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const home = process.env.HOME || process.cwd();
const arch = process.env.SAILS_ARCH || process.arch;

const buildRoot = path.join(home, '.skillops', 'builds', 'wails', `mac-${arch}`);
const outputDir = path.join(home, '.skillops', 'builds', 'installer', 'darwin', `mac-${arch}`);
const appName = process.env.MACOS_APP_NAME || process.env.SKILLOPS_APP_NAME || 'SkillOps Local';

function resolveAppPath() {
  const candidates = [
    appName.endsWith('.app') ? appName : `${appName}.app`,
    'SkillOpsLocal.app',
    'SkillOps Local.app',
  ];

  for (const name of candidates) {
    const candidate = path.join(buildRoot, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const entries = fs.existsSync(buildRoot) ? fs.readdirSync(buildRoot, { withFileTypes: true }) : [];
  const appEntry = entries.find((entry) => entry.isDirectory() && entry.name.endsWith('.app'));
  if (appEntry) {
    return path.join(buildRoot, appEntry.name);
  }

  return '';
}

function run(label, cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...options });
  if (result.status !== 0) {
    throw new Error(`${label} 失败 (${result.status})`);
  }
}

function readVersion() {
  try {
    const content = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (typeof content.version === 'string') {
      return content.version;
    }
  } catch {
    // Keep fallback
  }
  return '0.1.1';
}

function sanitizeFileName(name) {
  return String(name || 'SkillOpsLocal').replace(/[^a-zA-Z0-9_.-]+/g, '-');
}

function buildDmg(appPath, output) {
  run(
    '制作 dmg',
    '/usr/bin/hdiutil',
    ['create', '-volname', appName, '-srcfolder', appPath, '-ov', '-format', 'UDZO', output]
  );
}

function buildPkg(appPath, output, version) {
  const pkgId = process.env.PKG_IDENTIFIER || `cn.iyunci.skillops`;
  const args = [
    '--component',
    appPath,
    '--install-location',
    '/Applications',
    '--identifier',
    pkgId,
    '--version',
    version,
    output,
  ];

  if (process.env.PACKAGE_SIGNING_IDENTITY) {
    args.push('--sign', process.env.PACKAGE_SIGNING_IDENTITY);
  }

  run('制作 pkg', '/usr/bin/pkgbuild', args);
}

(function main() {
  if (process.platform !== 'darwin') {
    console.error('此脚本仅支持 macOS。');
    process.exit(1);
  }

  const appPath = resolveAppPath();
  if (!appPath) {
    console.error(`未找到应用包：${buildRoot}`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const version = readVersion();
  const safeName = sanitizeFileName(path.parse(appName).name || 'SkillOpsLocal');
  const dmgPath = path.join(outputDir, `${safeName}-${version}-darwin-${arch}.dmg`);
  const pkgPath = path.join(outputDir, `${safeName}-${version}-darwin-${arch}.pkg`);

  console.log(`应用路径: ${appPath}`);
  console.log(`输出目录: ${outputDir}`);
  buildDmg(appPath, dmgPath);
  console.log(`DMG 已生成: ${dmgPath}`);

  try {
    buildPkg(appPath, pkgPath, version);
    console.log(`PKG 已生成: ${pkgPath}`);
  } catch (err) {
    console.warn('pkgbuild 未执行，请先检查 xcode command line tools 或签名配置。');
    console.warn(`原因: ${err.message}`);
  }

  console.log('安装器打包完成。');
})();
