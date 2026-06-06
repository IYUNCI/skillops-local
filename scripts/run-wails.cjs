const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const wailsRoot = path.join(root, "wails");
const args = process.argv.slice(2);

function scrubMacExtendedAttributes(targetPath) {
  if (process.platform !== "darwin") {
    return;
  }

  const result = spawnSync("xattr", ["-cr", targetPath], {
    stdio: "inherit",
    shell: false
  });

  if (result.status !== 0) {
    console.error("Failed to clean macOS extended attributes before Wails build.");
    process.exit(result.status ?? 1);
  }
}

function isDarwinBuild() {
  if (process.platform !== "darwin" || args[0] !== "build" || args.includes("-nopackage")) {
    return false;
  }

  const platformIndex = args.indexOf("-platform");
  if (platformIndex === -1) {
    return true;
  }

  return String(args[platformIndex + 1] || "").split(",").some((platform) => platform.startsWith("darwin"));
}

function copyWailsProjectToStage(stageRoot) {
  fs.cpSync(wailsRoot, stageRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(wailsRoot, source);
      return relative !== "build/bin" && !relative.startsWith(`build${path.sep}bin${path.sep}`);
    }
  });
}

function getWailsAppName() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(wailsRoot, "wails.json"), "utf8"));
    if (typeof config.name === "string" && config.name.trim()) {
      return config.name.trim();
    }
  } catch {
    // Fall back to the current product name if config parsing fails.
  }
  return "SkillOps Local";
}

function getDarwinOutputDir() {
  const platformIndex = args.indexOf("-platform");
  const platform = platformIndex === -1 ? `darwin/${process.arch}` : String(args[platformIndex + 1] || `darwin/${process.arch}`);
  const arch = platform.split(",").find((item) => item.startsWith("darwin/"))?.split("/")[1] || process.arch;
  return path.join(os.homedir(), ".skillops", "builds", "wails", `mac-${arch}`);
}

function installStagedDarwinApp(stageRoot) {
  const appName = getWailsAppName();
  const sourceApp = path.join(stageRoot, "build", "bin", `${appName}.app`);
  const outputDir = getDarwinOutputDir();
  const installedApp = path.join(outputDir, `${appName}.app`);
  const linkBin = path.join(wailsRoot, "build", "bin");
  const projectLink = path.join(linkBin, `${appName}.app`);

  fs.rmSync(installedApp, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.cpSync(sourceApp, installedApp, { recursive: true });

  fs.rmSync(projectLink, { recursive: true, force: true });
  fs.mkdirSync(linkBin, { recursive: true });
  fs.symlinkSync(installedApp, projectLink, "dir");

  console.log(`Wails app installed at ${installedApp}`);
  console.log(`Project link created at ${projectLink}`);
}

function removeProjectAppSymlink() {
  const appName = getWailsAppName();
  const projectApp = path.join(wailsRoot, "build", "bin", `${appName}.app`);

  try {
    if (fs.lstatSync(projectApp).isSymbolicLink()) {
      fs.rmSync(projectApp, { recursive: true, force: true });
    }
  } catch {
    // The direct Wails command will recreate build/bin when needed.
  }
}

function runWailsBuildInStage(wailsBin) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skillops-wails-build-"));
  const stagedWailsRoot = path.join(tempRoot, "wails");
  let keepStage = false;

  try {
    copyWailsProjectToStage(stagedWailsRoot);
    scrubMacExtendedAttributes(stagedWailsRoot);

    const result = spawnSync(wailsBin, args, {
      cwd: stagedWailsRoot,
      stdio: "inherit",
      shell: false
    });

    if (result.status === 0) {
      installStagedDarwinApp(stagedWailsRoot);
      return 0;
    }

    keepStage = true;
    console.error(`Wails staging build failed. Staging directory kept at ${tempRoot}`);
    return result.status ?? 1;
  } finally {
    if (!keepStage && !process.env.SKILLOPS_KEEP_WAILS_STAGE) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

function candidatePaths() {
  const names = process.platform === "win32" ? ["wails.exe", "wails.cmd", "wails.bat"] : ["wails"];
  const paths = [];

  if (process.env.WAILS_BIN) {
    paths.push(process.env.WAILS_BIN);
  }

  const pathDirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    for (const name of names) {
      paths.push(path.join(dir, name));
    }
  }

  const home = os.homedir();
  if (home) {
    for (const name of names) {
      paths.push(path.join(home, "go", "bin", name));
    }
  }

  return [...new Set(paths)];
}

const wailsBin = candidatePaths().find((candidate) => {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

if (!wailsBin) {
  console.error("Wails CLI not found. Install with: go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0");
  process.exit(1);
}

if (isDarwinBuild()) {
  process.exit(runWailsBuildInStage(wailsBin));
}

removeProjectAppSymlink();
const result = spawnSync(wailsBin, args, {
  cwd: wailsRoot,
  stdio: "inherit",
  shell: false
});

process.exit(result.status ?? 1);
