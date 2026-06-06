const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const sourceArg = process.argv[2];
const sourceSvg = path.resolve(root, sourceArg || path.join("assets", "skilloips.svg"));
const assetDir = path.join(root, "assets");
const wailsAssetDir = path.join(root, "wails", "assets");
const wailsBuildDir = path.join(root, "wails", "build");
const windowsBuildDir = path.join(wailsBuildDir, "windows");

const macIconSizes = [
  [16, "icon_16x16.png"],
  [32, "icon_16x16@2x.png"],
  [32, "icon_32x32.png"],
  [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"],
  [256, "icon_128x128@2x.png"],
  [256, "icon_256x256.png"],
  [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"],
  [1024, "icon_512x512@2x.png"]
];
const windowsIconSizes = [16, 24, 32, 48, 64, 128, 256];
const uiIconSizes = [
  [34, "skilloips-ui.png"],
  [68, "skilloips-ui@2x.png"]
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio || "pipe",
    encoding: options.encoding || "utf8",
    shell: false,
    ...options
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }

  return result;
}

function requireTool(command) {
  const result = spawnSync("which", [command], {
    stdio: "pipe",
    encoding: "utf8",
    shell: false
  });

  if (result.status !== 0) {
    throw new Error(`Missing required tool: ${command}`);
  }
}

function renderSvgToPng(svgPath, pngPath, size) {
  if (process.platform !== "darwin") {
    throw new Error("SVG icon rendering currently requires macOS Quick Look.");
  }

  requireTool("qlmanage");
  requireTool("sips");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillops-icons-"));
  try {
    run("qlmanage", ["-t", "-s", String(size), "-o", tempDir, svgPath]);
    const rendered = fs.readdirSync(tempDir)
      .filter((file) => file.toLowerCase().endsWith(".png"))
      .map((file) => path.join(tempDir, file))[0];

    if (!rendered) {
      throw new Error("Quick Look did not produce a PNG thumbnail.");
    }

    resizePng(rendered, pngPath, size);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function resizePng(inputPath, outputPath, size) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  run("sips", ["-z", String(size), String(size), inputPath, "--out", outputPath]);
}

function writeIco(outputPath, pngPaths) {
  const pngs = pngPaths.map(({ size, file }) => ({
    size,
    bytes: fs.readFileSync(file)
  }));
  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + entrySize * pngs.length;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  const entries = pngs.map(({ size, bytes }) => {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(bytes.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += bytes.length;
    return entry;
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.concat([header, ...entries, ...pngs.map((png) => png.bytes)]));
}

function copyAssetFiles() {
  fs.mkdirSync(assetDir, { recursive: true });
  fs.mkdirSync(wailsAssetDir, { recursive: true });
  const targetSvg = path.join(assetDir, "skilloips.svg");
  if (path.resolve(sourceSvg) !== path.resolve(targetSvg)) {
    fs.copyFileSync(sourceSvg, targetSvg);
  }

  for (const name of ["skilloips.svg", "skilloips-source.png", "skilloips-ui.png", "skilloips-ui@2x.png", "skilloips.icns", "skilloips.ico"]) {
    fs.copyFileSync(path.join(assetDir, name), path.join(wailsAssetDir, name));
  }
}

if (!fs.existsSync(sourceSvg)) {
  throw new Error(`Icon source not found: ${sourceSvg}`);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skillops-icon-build-"));
const sourcePng = path.join(assetDir, "skilloips-source.png");
const appIconPng = path.join(wailsBuildDir, "appicon.png");
const macIconSet = path.join(tempRoot, "skilloips.iconset");
const windowsPngDir = path.join(tempRoot, "windows");

try {
  renderSvgToPng(sourceSvg, sourcePng, 1024);
  fs.copyFileSync(sourcePng, appIconPng);

  for (const [size, name] of uiIconSizes) {
    resizePng(sourcePng, path.join(assetDir, name), size);
  }

  fs.mkdirSync(macIconSet, { recursive: true });
  for (const [size, name] of macIconSizes) {
    resizePng(sourcePng, path.join(macIconSet, name), size);
  }
  run("iconutil", ["-c", "icns", macIconSet, "-o", path.join(assetDir, "skilloips.icns")]);

  const windowsPngs = windowsIconSizes.map((size) => {
    const file = path.join(windowsPngDir, `icon-${size}.png`);
    resizePng(sourcePng, file, size);
    return { size, file };
  });
  writeIco(path.join(assetDir, "skilloips.ico"), windowsPngs);
  fs.mkdirSync(windowsBuildDir, { recursive: true });
  fs.copyFileSync(path.join(assetDir, "skilloips.ico"), path.join(windowsBuildDir, "icon.ico"));

  copyAssetFiles();

  console.log("Generated SkillOps app icons:");
  console.log(`- macOS source PNG: ${sourcePng} (1024x1024)`);
  console.log(`- Wails app icon: ${appIconPng} (1024x1024)`);
  console.log(`- Sidebar UI icons: ${uiIconSizes.map(([, name]) => path.join(assetDir, name)).join(", ")}`);
  console.log(`- macOS icns: ${path.join(assetDir, "skilloips.icns")}`);
  console.log(`- Windows ico: ${path.join(windowsBuildDir, "icon.ico")} (${windowsIconSizes.join(", ")} px)`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
