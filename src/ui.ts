import http from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import type { Capability } from "./types.js";
import { scanCapabilities } from "./scan.js";
import { installGitHubSkill, installMarketSkill, searchMarketSkills } from "./market.js";
import type { SkillInstallTarget } from "./market.js";
import { deleteTrashItem, listTrashItems, removeCapability as removeLocalCapability, restoreTrashItem } from "./manage.js";
import { runCliToolAction, searchCliTools } from "./cli-market.js";
import { getInstalledInventory } from "./installed.js";
import { listHistory } from "./history.js";
import {
  addFeedback,
  auditSkillRisk,
  browseMcpTools,
  buildCompatibilityMatrix,
  buildDependencyGraph,
  checkInstalledSkillUpdates,
  createSkillTemplate,
  exportProfile,
  getEnhancementOverview,
  importProfile,
  installMcpServer,
  previewSkillSource,
  reviewSkillOffline,
  runSkillEval,
  snapshotLocalLibrary,
  upgradeInstalledSkill
} from "./enhancements.js";

export type UiOptions = {
  port: number;
  host: string;
  root: string;
  includeHome: boolean;
  openBrowser: boolean;
};

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const LOGO_SVG_ASSET_CANDIDATES = [
  path.resolve(MODULE_DIR, "..", "assets", "skilloips.svg"),
  path.resolve(MODULE_DIR, "assets", "skilloips.svg")
];
const LOGO_PNG_ASSET_CANDIDATES = [
  path.resolve(MODULE_DIR, "..", "assets", "skilloips-source.png"),
  path.resolve(MODULE_DIR, "assets", "skilloips-source.png")
];
const LOGO_UI_ASSET_CANDIDATES = [
  path.resolve(MODULE_DIR, "..", "assets", "skilloips-ui.png"),
  path.resolve(MODULE_DIR, "assets", "skilloips-ui.png")
];
const LOGO_UI_2X_ASSET_CANDIDATES = [
  path.resolve(MODULE_DIR, "..", "assets", "skilloips-ui@2x.png"),
  path.resolve(MODULE_DIR, "assets", "skilloips-ui@2x.png")
];

export async function startUiServer(options: UiOptions): Promise<void> {
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", `http://${options.host}:${options.port}`);

      if (requestUrl.pathname === "/") {
        sendHtml(response, renderHtml(options));
        return;
      }

      if (requestUrl.pathname === "/assets/logo.svg") {
        await sendLogoSvg(response);
        return;
      }

      if (requestUrl.pathname === "/assets/logo.png") {
        await sendLogoPng(response);
        return;
      }

      if (requestUrl.pathname === "/assets/logo-ui.png") {
        await sendLogoRaster(response, LOGO_UI_ASSET_CANDIDATES);
        return;
      }

      if (requestUrl.pathname === "/assets/logo-ui@2x.png") {
        await sendLogoRaster(response, LOGO_UI_2X_ASSET_CANDIDATES);
        return;
      }

      if (requestUrl.pathname === "/api/scan") {
        const includeHome = requestUrl.searchParams.get("home") !== "false" && options.includeHome;
        const probeMcp = requestUrl.searchParams.get("probeMcp") === "true";
        const capabilities = await scanCapabilities({
          root: options.root,
          includeHome,
          probeMcp
        });
        sendJson(response, { capabilities, summary: summarize(capabilities) });
        return;
      }

      if (requestUrl.pathname === "/api/market") {
        const query = requestUrl.searchParams.get("q") ?? "";
        const capabilities = await scanCapabilities({
          root: options.root,
          includeHome: true,
          probeMcp: false
        });
        sendJson(response, { skills: await searchMarketSkills(query, capabilities) });
        return;
      }

      if (requestUrl.pathname === "/api/cli-tools") {
        const query = requestUrl.searchParams.get("q") ?? "";
        sendJson(response, { tools: await searchCliTools(query) });
        return;
      }

      if (requestUrl.pathname === "/api/installed") {
        const query = requestUrl.searchParams.get("q") ?? "";
        const includeHome = requestUrl.searchParams.get("home") !== "false" && options.includeHome;
        const probeMcp = requestUrl.searchParams.get("probeMcp") === "true";
        sendJson(response, await getInstalledInventory({
          root: options.root,
          includeHome,
          probeMcp,
          query
        }));
        return;
      }

      if (requestUrl.pathname === "/api/features") {
        sendJson(response, { features: getEnhancementOverview() });
        return;
      }

      if (requestUrl.pathname === "/api/updates") {
        sendJson(response, { updates: await checkInstalledSkillUpdates(options.root) });
        return;
      }

      if (requestUrl.pathname === "/api/updates/upgrade" && request.method === "POST") {
        const body = await readJsonBody<{ skillPath?: string; confirm?: boolean }>(request);
        if (body.confirm !== true) {
          sendJson(response, { error: "Upgrade requires explicit confirmation." }, 403);
          return;
        }
        sendJson(response, { result: await upgradeInstalledSkill(String(body.skillPath ?? "")) });
        return;
      }

      if (requestUrl.pathname === "/api/skill/preview") {
        const source = requestUrl.searchParams.get("source") ?? "";
        sendJson(response, { preview: await previewSkillSource(source) });
        return;
      }

      if (requestUrl.pathname === "/api/mcp/tools") {
        const name = requestUrl.searchParams.get("name") || undefined;
        sendJson(response, { servers: await browseMcpTools(options.root, name) });
        return;
      }

      if (requestUrl.pathname === "/api/mcp/install" && request.method === "POST") {
        const body = await readJsonBody<{
          name?: string;
          target?: "project" | "cursor" | "claude";
          command?: string;
          args?: string[];
          url?: string;
          confirm?: boolean;
        }>(request);
        if (body.confirm !== true) {
          sendJson(response, { error: "MCP install requires explicit confirmation." }, 403);
          return;
        }
        sendJson(response, {
          result: await installMcpServer({
            root: options.root,
            target: body.target ?? "project",
            name: String(body.name ?? ""),
            command: body.command,
            args: body.args,
            url: body.url
          })
        });
        return;
      }

      if (requestUrl.pathname === "/api/risk/audit") {
        const skillPath = requestUrl.searchParams.get("path") ?? "";
        sendJson(response, { result: await auditSkillRisk(skillPath) });
        return;
      }

      if (requestUrl.pathname === "/api/profile/export" && request.method === "POST") {
        const body = await readJsonBody<{ out?: string }>(request);
        sendJson(response, { result: await exportProfile(options.root, body.out) });
        return;
      }

      if (requestUrl.pathname === "/api/profile/import" && request.method === "POST") {
        const body = await readJsonBody<{ path?: string }>(request);
        sendJson(response, { result: await importProfile(String(body.path ?? "")) });
        return;
      }

      if (requestUrl.pathname === "/api/history") {
        const limit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "100", 10);
        sendJson(response, { entries: await listHistory(limit) });
        return;
      }

      if (requestUrl.pathname === "/api/db/snapshot" && request.method === "POST") {
        sendJson(response, { result: await snapshotLocalLibrary(options.root) });
        return;
      }

      if (requestUrl.pathname === "/api/feedback" && request.method === "POST") {
        const body = await readJsonBody<{ targetId?: string; rating?: number; comment?: string }>(request);
        sendJson(response, { result: await addFeedback(String(body.targetId ?? ""), Number(body.rating ?? 0), String(body.comment ?? "")) });
        return;
      }

      if (requestUrl.pathname === "/api/compatibility") {
        sendJson(response, { matrix: await buildCompatibilityMatrix(options.root) });
        return;
      }

      if (requestUrl.pathname === "/api/create/skill" && request.method === "POST") {
        const body = await readJsonBody<{ name?: string; root?: string }>(request);
        sendJson(response, { result: await createSkillTemplate(String(body.name ?? ""), body.root ?? path.join(options.root, "skills")) });
        return;
      }

      if (requestUrl.pathname === "/api/eval/skill") {
        const skillPath = requestUrl.searchParams.get("path") ?? "";
        sendJson(response, { result: await runSkillEval(skillPath) });
        return;
      }

      if (requestUrl.pathname === "/api/review/skill") {
        const skillPath = requestUrl.searchParams.get("path") ?? "";
        sendJson(response, { result: await reviewSkillOffline(skillPath) });
        return;
      }

      if (requestUrl.pathname === "/api/graph/dependencies") {
        sendJson(response, await buildDependencyGraph(options.root));
        return;
      }

      if (requestUrl.pathname === "/api/trash") {
        sendJson(response, { items: await listTrashItems() });
        return;
      }

      if (requestUrl.pathname === "/api/market/install" && request.method === "POST") {
        const body = await readJsonBody<{
          skillId?: string;
          source?: string;
          target?: SkillInstallTarget;
          confirm?: boolean;
        }>(request);
        if (body.confirm !== true) {
          sendJson(response, { error: "Install requires explicit confirmation." }, 403);
          return;
        }
        const target = body.target ?? "codex";
        const capabilities = await scanCapabilities({
          root: options.root,
          includeHome: true,
          probeMcp: false
        });
        const result = body.source
          ? await installGitHubSkill(body.source, target, options.root, capabilities)
          : await installMarketSkill(String(body.skillId ?? ""), target, options.root, capabilities);
        sendJson(response, { result });
        return;
      }

      if (requestUrl.pathname === "/api/cli/action" && request.method === "POST") {
        const body = await readJsonBody<{
          toolId?: string;
          action?: "install" | "uninstall";
          confirm?: boolean;
        }>(request);
        if (body.confirm !== true) {
          sendJson(response, { error: "CLI action requires explicit confirmation." }, 403);
          return;
        }
        const action = body.action === "uninstall" ? "uninstall" : "install";
        const result = await runCliToolAction(String(body.toolId ?? ""), action);
        sendJson(response, { result });
        return;
      }

      if (requestUrl.pathname === "/api/capability/remove" && request.method === "POST") {
        const body = await readJsonBody<{ capabilityId?: string; confirm?: boolean; mode?: string }>(request);
        if (body.confirm !== true) {
          sendJson(response, { error: "Remove requires explicit confirmation." }, 403);
          return;
        }
        const mode = body.mode === "delete" ? "delete" : "trash";
        const capabilities = await scanCapabilities({
          root: options.root,
          includeHome: true,
          probeMcp: false
        });
        const result = await removeLocalCapability(String(body.capabilityId ?? ""), capabilities, mode);
        sendJson(response, { result });
        return;
      }

      if (requestUrl.pathname === "/api/mcp/remove" && request.method === "POST") {
        const body = await readJsonBody<{ capabilityId?: string; confirm?: boolean }>(request);
        if (body.confirm !== true) {
          sendJson(response, { error: "MCP remove requires explicit confirmation." }, 403);
          return;
        }
        const capabilities = await scanCapabilities({
          root: options.root,
          includeHome: true,
          probeMcp: false
        });
        const result = await removeLocalCapability(String(body.capabilityId ?? ""), capabilities, "delete");
        sendJson(response, { result });
        return;
      }

      if (requestUrl.pathname === "/api/trash/restore" && request.method === "POST") {
        const body = await readJsonBody<{ trashId?: string; confirm?: boolean }>(request);
        if (body.confirm !== true) {
          sendJson(response, { error: "Restore requires explicit confirmation." }, 403);
          return;
        }
        const result = await restoreTrashItem(String(body.trashId ?? ""));
        sendJson(response, { result });
        return;
      }

      if (requestUrl.pathname === "/api/trash/delete" && request.method === "POST") {
        const body = await readJsonBody<{ trashId?: string; confirm?: boolean }>(request);
        if (body.confirm !== true) {
          sendJson(response, { error: "Permanent delete requires explicit confirmation." }, 403);
          return;
        }
        const result = await deleteTrashItem(String(body.trashId ?? ""));
        sendJson(response, { result });
        return;
      }

      sendJson(response, { error: "Not found" }, 404);
    } catch (error) {
      sendJson(
        response,
        { error: error instanceof Error ? error.message : String(error) },
        500
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => resolve());
  });

  const url = `http://${options.host}:${options.port}`;
  console.log(`SkillOps UI running at ${url}`);
  console.log(`Root: ${options.root}`);
  console.log("Press Ctrl+C to stop.");

  if (options.openBrowser) {
    const openCmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const openArgs = process.platform === "win32" ? ["/c", "start", url] : [url];
    spawn(openCmd, openArgs, { detached: true, stdio: "ignore" }).unref();
  }
}

function summarize(capabilities: Capability[]) {
  return {
    total: capabilities.length,
    byType: countBy(capabilities, (item) => item.type),
    byHealth: countBy(capabilities, (item) => item.health),
    byRisk: countBy(capabilities, (item) => item.risk),
    issueCount: capabilities.reduce((sum, item) => sum + item.issues.length, 0)
  };
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function sendHtml(response: http.ServerResponse, body: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(body);
}

function sendJson(response: http.ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

async function sendLogoSvg(response: http.ServerResponse): Promise<void> {
  const logoPath = await resolveLogoAssetPath(LOGO_SVG_ASSET_CANDIDATES);
  if (!logoPath) {
    sendJson(response, { error: "Logo asset not found" }, 404);
    return;
  }

  const body = await readFile(logoPath);
  response.writeHead(200, {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=300"
  });
  response.end(body);
}

async function sendLogoPng(response: http.ServerResponse): Promise<void> {
  await sendLogoRaster(response, LOGO_PNG_ASSET_CANDIDATES);
}

async function sendLogoRaster(response: http.ServerResponse, candidates: string[]): Promise<void> {
  const logoPath = await resolveLogoAssetPath(candidates);
  if (!logoPath) {
    sendJson(response, { error: "Logo asset not found" }, 404);
    return;
  }

  const body = await readFile(logoPath);
  response.writeHead(200, {
    "content-type": "image/png",
    "cache-control": "public, max-age=300"
  });
  response.end(body);
}

async function resolveLogoAssetPath(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) {
        return candidate;
      }
    } catch {
      // Continue to the next candidate; dev and packaged layouts differ.
    }
  }
  return undefined;
}

async function readJsonBody<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

function renderHtml(options: UiOptions): string {
  const escapedRoot = escapeHtml(options.root);
  const defaultHome = options.includeHome ? "true" : "false";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SkillOps Local</title>
  <link rel="icon" type="image/svg+xml" href="/assets/logo.svg">
  <script>
    (function() {
      const stored = localStorage.getItem("theme");
      const theme = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      document.documentElement.setAttribute("data-theme", theme);
    })();
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f5f7;
      --bg-gradient: linear-gradient(180deg, #f5f5f7 0%, #ffffff 100%);
      --sidebar-bg: rgba(245, 245, 247, 0.75);
      --panel: #ffffff;
      --panel-hover: #fafafa;
      --panel-active: #f0f7ff;
      --panel-border: rgba(0, 0, 0, 0.08);
      --panel-border-active: #0071e3;
      --ink: #1d1d1f;
      --muted: #6e6e73;
      --muted-dark: #86868b;
      --line: rgba(0, 0, 0, 0.08);
      
      --accent: #0071e3;
      --accent-glow: rgba(0, 113, 227, 0.15);
      --accent-cyan: #0088cc;
      --accent-cyan-glow: rgba(0, 136, 204, 0.15);
      
      --ok: #24b249;
      --ok-bg: rgba(36, 178, 73, 0.08);
      --ok-border: rgba(36, 178, 73, 0.18);
      
      --warn: #ff9500;
      --warn-bg: rgba(255, 149, 0, 0.08);
      --warn-border: rgba(255, 149, 0, 0.18);
      
      --bad: #ff3b30;
      --bad-bg: rgba(255, 59, 48, 0.08);
      --bad-border: rgba(255, 59, 48, 0.18);
      
      --unknown: #8e8e93;
      --unknown-bg: rgba(142, 142, 147, 0.08);
      --unknown-border: rgba(142, 142, 147, 0.18);

      /* Additional UI elements variables */
      --text-badge: #6e6e73;
      --bg-badge: rgba(0, 0, 0, 0.06);
      --bg-sidebar-status: rgba(0, 0, 0, 0.02);
      --bg-sidebar-root: rgba(0, 0, 0, 0.03);
      --bg-search-input: #f5f5f7;
      --bg-list-scroll: #fafafa;
      --bg-nav-hover: rgba(0, 0, 0, 0.04);
      --bg-nav-active: rgba(0, 0, 0, 0.06);
      --color-nav-active: #000000;
      --bg-inspector-value: #f5f5f7;
      --bg-perm-tag: rgba(0, 0, 0, 0.03);
      --border-perm-tag: rgba(0, 0, 0, 0.06);
      --scrollbar-thumb: rgba(0, 0, 0, 0.12);
      --scrollbar-thumb-hover: rgba(0, 0, 0, 0.24);
      --glow-strength: 0 4px 12px rgba(0, 0, 0, 0.02);
      --glow-hover: 0 6px 18px rgba(0, 0, 0, 0.06);
    }

    :root[data-theme="dark"] {
      color-scheme: dark;
      --bg: #0d0e12;
      --bg-gradient: linear-gradient(180deg, #0d0e12 0%, #15161c 100%);
      --sidebar-bg: rgba(21, 22, 28, 0.75);
      --panel: #1e1f26;
      --panel-hover: #262831;
      --panel-active: #1c2a3e;
      --panel-border: rgba(255, 255, 255, 0.08);
      --panel-border-active: #3899ec;
      --ink: #f5f5f7;
      --muted: #9898a0;
      --muted-dark: #b0b0b8;
      --line: rgba(255, 255, 255, 0.08);
      
      --accent: #3899ec;
      --accent-glow: rgba(56, 153, 236, 0.25);
      --accent-cyan: #00bcd4;
      --accent-cyan-glow: rgba(0, 188, 212, 0.2);
      
      --ok: #30d158;
      --ok-bg: rgba(48, 209, 88, 0.1);
      --ok-border: rgba(48, 209, 88, 0.25);
      
      --warn: #ff9f0a;
      --warn-bg: rgba(255, 159, 10, 0.1);
      --warn-border: rgba(255, 159, 10, 0.25);
      
      --bad: #ff453a;
      --bad-bg: rgba(255, 69, 58, 0.1);
      --bad-border: rgba(255, 69, 58, 0.25);
      
      --unknown: #a2a2a7;
      --unknown-bg: rgba(162, 162, 167, 0.1);
      --unknown-border: rgba(162, 162, 167, 0.25);

      /* Additional UI elements variables */
      --text-badge: #9898a0;
      --bg-badge: rgba(255, 255, 255, 0.08);
      --bg-sidebar-status: rgba(255, 255, 255, 0.03);
      --bg-sidebar-root: rgba(255, 255, 255, 0.04);
      --bg-search-input: #15161c;
      --bg-list-scroll: #111216;
      --bg-nav-hover: rgba(255, 255, 255, 0.05);
      --bg-nav-active: rgba(255, 255, 255, 0.08);
      --color-nav-active: #ffffff;
      --bg-inspector-value: #15161c;
      --bg-perm-tag: rgba(255, 255, 255, 0.04);
      --border-perm-tag: rgba(255, 255, 255, 0.08);
      --scrollbar-thumb: rgba(255, 255, 255, 0.15);
      --scrollbar-thumb-hover: rgba(255, 255, 255, 0.3);
      --glow-strength: 0 4px 12px rgba(0, 0, 0, 0.25);
      --glow-hover: 0 6px 18px rgba(0, 0, 0, 0.4);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      background-image: var(--bg-gradient);
      height: 100vh;
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "SF Pro Icons", "Inter", "Helvetica Neue", sans-serif;
      letter-spacing: -0.015em;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }

    #app-container {
      display: flex;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
    }

    /* Sidebar Styling */
    #sidebar {
      width: 290px;
      background: var(--sidebar-bg);
      backdrop-filter: blur(25px) saturate(190%);
      -webkit-backdrop-filter: blur(25px) saturate(190%);
      border-right: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      padding: 32px 20px 24px 20px;
      gap: 20px;
    }

    .brand-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .brand-logo-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-logo-frame {
      width: 42px;
      height: 42px;
      border-radius: 11px;
      display: grid;
      place-items: center;
      flex-shrink: 0;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid rgba(0, 0, 0, 0.08);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
    }

    :root[data-theme="dark"] .brand-logo-frame {
      background: rgba(255, 255, 255, 0.96);
      border-color: rgba(255, 255, 255, 0.18);
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.06),
        0 8px 24px rgba(0, 0, 0, 0.38);
    }

    .brand-logo {
      width: 34px;
      height: 34px;
      object-fit: contain;
      display: block;
    }

    .brand-logo-wrap h1 {
      margin: 0;
      font-size: 21px;
      font-weight: 700;
      color: var(--ink);
      letter-spacing: 0;
    }

    .brand-header .root {
      color: var(--muted);
      font-family: 'JetBrains Mono', monospace;
      font-size: 10.5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: var(--bg-sidebar-root);
      padding: 5px 8px;
      border-radius: 6px;
      border: 1px solid var(--line);
    }

    .sidebar-status {
      display: flex;
      align-items: center;
      font-size: 13px;
      color: var(--muted);
      background: var(--bg-sidebar-status);
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid var(--line);
    }

    /* Navigation Items */
    .sidebar-nav {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
    }

    .nav-item {
      display: flex;
      align-items: center;
      padding: 10px 14px;
      border-radius: 8px;
      cursor: pointer;
      color: var(--muted);
      transition: all 0.15s ease;
      gap: 12px;
      font-weight: 500;
      font-size: 14px;
    }

    .nav-item:hover {
      color: var(--ink);
      background: var(--bg-nav-hover);
    }

    .nav-item.active {
      color: var(--color-nav-active);
      background: var(--bg-nav-active);
      font-weight: 600;
    }

    .nav-icon {
      width: 18px;
      height: 18px;
      stroke: var(--muted);
      transition: stroke 0.15s ease;
    }

    .nav-item.active .nav-icon {
      stroke: var(--accent);
    }

    .nav-badge {
      margin-left: auto;
      background: var(--bg-badge);
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 999px;
      color: var(--muted);
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
    }

    .nav-badge.alert {
      background: var(--bad-bg);
      border: 1px solid var(--bad-border);
      color: var(--bad);
    }

    .nav-item.active .nav-badge:not(.alert) {
      background: var(--accent);
      color: #ffffff;
    }

    /* Scan Controls */
    .sidebar-scan-controls {
      display: flex;
      flex-direction: column;
      gap: 14px;
      border-top: 1px solid var(--line);
      padding-top: 18px;
    }

    .sidebar-open-source {
      border: 1px solid var(--line);
      background: var(--bg-sidebar-status);
      border-radius: 8px;
      padding: 10px 12px;
    }

    .sidebar-open-source strong {
      display: block;
      color: var(--ink);
      font-size: 12.5px;
      line-height: 1.25;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .sidebar-open-source span {
      display: block;
      color: var(--muted);
      font-size: 11.5px;
      line-height: 1.45;
    }

    .scan-options {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .checkbox-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 13.5px;
      cursor: pointer;
      user-select: none;
      transition: color 0.15s;
    }

    .checkbox-label:hover {
      color: var(--ink);
    }

    .checkbox-label input[type="checkbox"] {
      accent-color: var(--accent);
      width: 15px;
      height: 15px;
      cursor: pointer;
    }

    /* Sidebar Footer */
    .sidebar-footer {
      display: flex;
      gap: 8px;
      border-top: 1px solid var(--line);
      padding-top: 18px;
    }

    .btn-lang {
      appearance: none;
      border: 1px solid var(--panel-border);
      background: var(--bg-sidebar-status);
      color: var(--ink);
      font-family: inherit;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12.5px;
      transition: all 0.15s ease;
      flex: 1;
      text-align: center;
    }

    .btn-lang:hover {
      background: var(--bg-nav-hover);
      border-color: var(--muted-dark);
    }

    /* Workspace Panel */
    #workspace {
      flex: 1;
      height: 100vh;
      overflow: hidden;
      display: flex;
      position: relative;
    }

    .view-panel {
      display: none;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .view-panel.active {
      display: flex;
      animation: fadeIn 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
    }

    @keyframes fadeIn {
      from { 
        opacity: 0; 
        transform: translateY(8px) scale(0.995);
      }
      to { 
        opacity: 1; 
        transform: translateY(0) scale(1);
      }
    }

    /* View Header styling */
    .view-header {
      padding: 16px 24px;
      border-bottom: 1px solid var(--line);
      background: var(--sidebar-bg);
      backdrop-filter: blur(12px);
      z-index: 10;
    }

    .view-header.flex-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .view-title {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: var(--ink);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* Filters Row in Header */
    .filters-row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
    }

    .search-box {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-icon {
      position: absolute;
      left: 12px;
      width: 16px;
      height: 16px;
      color: var(--muted-dark);
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      height: 38px;
      background: var(--bg-search-input);
      border: 1px solid var(--panel-border);
      border-radius: 8px;
      padding: 0 14px 0 36px;
      color: var(--ink);
      font-family: inherit;
      font-size: 13.5px;
      outline: none;
      transition: all 0.2s;
    }

    .search-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent-glow);
    }

    .filter-select {
      height: 38px;
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 8px;
      padding: 0 12px;
      color: var(--ink);
      font-family: inherit;
      font-size: 13.5px;
      outline: none;
      cursor: pointer;
      transition: all 0.2s;
    }

    .filter-select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent-glow);
    }

    /* Metrics Bar styling */
    .summary-metrics {
      display: flex;
      gap: 12px;
      padding: 12px 24px;
      background: transparent;
      border-bottom: 1px solid var(--line);
      overflow-x: auto;
      flex-shrink: 0;
    }

    .summary-metrics .metric {
      padding: 10px 16px;
      border: 1px solid var(--panel-border);
      border-radius: 10px;
      background: var(--panel);
      box-shadow: var(--glow-strength);
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      white-space: nowrap;
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease;
      cursor: pointer;
      user-select: none;
    }

    .summary-metrics .metric:hover {
      transform: translateY(-1px);
      box-shadow: var(--glow-hover);
      border-color: var(--muted-dark);
    }

    .summary-metrics .metric span {
      color: var(--muted);
      font-weight: 500;
      transition: color 0.15s ease;
    }

    .summary-metrics .metric strong {
      color: var(--ink);
      font-family: inherit;
      font-weight: 600;
      transition: color 0.15s ease;
    }

    .summary-metrics .metric[role="button"]:focus {
      outline: none;
      box-shadow: 0 0 0 2px var(--accent-glow), 0 4px 12px rgba(0, 0, 0, 0.04);
      border-color: var(--accent);
    }

    .summary-metrics .metric.total.active {
      border-color: var(--accent);
      background: rgba(0, 113, 227, 0.05);
    }
    .summary-metrics .metric.total.active span,
    .summary-metrics .metric.total.active strong {
      color: var(--accent);
    }

    .summary-metrics .metric.skills.active {
      border-color: var(--accent-cyan);
      background: rgba(0, 136, 204, 0.05);
    }
    .summary-metrics .metric.skills.active span,
    .summary-metrics .metric.skills.active strong {
      color: var(--accent-cyan);
    }

    .summary-metrics .metric.mcps.active {
      border-color: #8a2be2;
      background: rgba(138, 43, 226, 0.05);
    }
    .summary-metrics .metric.mcps.active span,
    .summary-metrics .metric.mcps.active strong {
      color: #8a2be2;
    }

    .summary-metrics .metric.warnings.active {
      border-color: var(--warn);
      background: var(--warn-bg);
    }
    .summary-metrics .metric.warnings.active span,
    .summary-metrics .metric.warnings.active strong {
      color: var(--warn);
    }

    .summary-metrics .metric.issues.active {
      border-color: var(--bad);
      background: var(--bad-bg);
    }
    .summary-metrics .metric.issues.active span,
    .summary-metrics .metric.issues.active strong {
      color: var(--bad);
    }

    /* Split Pane Layout */
    .split-pane {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* List Pane */
    .list-pane {
      width: 360px;
      border-right: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      background: var(--panel);
      flex-shrink: 0;
    }

    .list-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: var(--bg-list-scroll);
    }

    /* Redesigned Cards */
    .cap-card {
      background: transparent;
      border: 1px solid transparent;
      border-bottom: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px 14px;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      box-shadow: none;
    }

    .cap-card:hover {
      background: var(--panel-hover);
      border-color: transparent;
      border-bottom: 1px solid var(--line);
      transform: none;
      box-shadow: none;
    }

    .cap-card.active {
      background: rgba(139, 92, 246, 0.08);
      border-color: transparent;
      border-bottom: 1px solid var(--line);
      border-left: 3px solid var(--accent);
      box-shadow: none;
    }

    .cap-card-header {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: 10px;
      width: 100%;
      overflow: hidden;
    }

    .cap-card-title {
      font-weight: 600;
      color: var(--ink);
      font-size: 14.5px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
      flex-shrink: 1;
    }

    .cap-card-source {
      font-size: 10px;
      color: var(--muted-dark);
      font-family: 'JetBrains Mono', monospace;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .cap-card-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .cap-card-desc {
      display: none;
    }

    /* Inspector Details Pane */
    .details-pane {
      flex: 1;
      overflow-y: auto;
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      background: var(--bg);
    }

    .inspector-welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--muted);
      gap: 16px;
      text-align: center;
      padding: 40px;
    }

    .inspector-welcome svg {
      width: 56px;
      height: 56px;
      stroke: var(--muted-dark);
      margin-bottom: 8px;
    }

    .inspector-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 24px;
      margin-bottom: 12px;
      border-bottom: 1px solid rgba(139, 92, 246, 0.15);
      gap: 16px;
      position: relative;
    }

    .inspector-header::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      width: 80px;
      height: 2px;
      background: linear-gradient(90deg, var(--accent), transparent);
    }

    .inspector-title-block {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .inspector-title-block h2 {
      margin: 0;
      font-size: 26px;
      font-weight: 800;
      background: linear-gradient(135deg, var(--ink) 0%, var(--muted) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.02em;
    }

    .inspector-source {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--accent);
      background: rgba(139, 92, 246, 0.08);
      padding: 4px 10px;
      border-radius: 6px;
      display: inline-block;
      width: fit-content;
      border: 1px solid rgba(139, 92, 246, 0.12);
    }

    .inspector-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }

    .inspector-card {
      background: linear-gradient(145deg, var(--panel) 0%, rgba(20, 20, 25, 0.3) 100%);
      border: 1px solid var(--panel-border);
      border-radius: 14px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease, border-color 0.2s ease;
      position: relative;
      overflow: hidden;
    }

    html[data-theme="light"] .inspector-card {
      background: linear-gradient(145deg, var(--panel) 0%, rgba(240, 240, 245, 0.6) 100%);
    }

    .inspector-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 2px;
      background: linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.4), transparent);
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .inspector-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.08);
      border-color: rgba(139, 92, 246, 0.3);
    }

    .inspector-card:hover::before {
      opacity: 1;
    }

    .inspector-label {
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .inspector-value {
      font-size: 13px;
      font-family: 'JetBrains Mono', monospace;
      color: var(--ink);
      overflow-wrap: anywhere;
      background: rgba(0,0,0,0.2);
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.05);
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
      line-height: 1.5;
    }
    
    html[data-theme="light"] .inspector-value {
      background: rgba(240,240,245,0.6);
      border: 1px solid rgba(0,0,0,0.05);
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.02);
    }

    .inspector-section-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--ink);
      margin-top: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(139, 92, 246, 0.15);
      letter-spacing: -0.01em;
      position: relative;
    }

    .inspector-section-title::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      width: 40px;
      height: 2px;
      background: var(--accent);
    }

    /* Pills styling */
    .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 22px;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      text-transform: capitalize;
    }

    .pill.mcp_server {
      background: rgba(0, 113, 227, 0.08);
      border: 1px solid rgba(0, 113, 227, 0.18);
      color: var(--accent);
    }

    .pill.skill {
      background: rgba(139, 92, 246, 0.08);
      border: 1px solid rgba(139, 92, 246, 0.18);
      color: #8b5cf6;
    }

    .pill.ok { background: var(--ok-bg); border: 1px solid var(--ok-border); color: var(--ok); }
    .pill.warning { background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn); }
    .pill.broken { background: var(--bad-bg); border: 1px solid var(--bad-border); color: var(--bad); }
    .pill.unknown { background: var(--unknown-bg); border: 1px solid var(--unknown-border); color: var(--unknown); }

    .pill.low { background: rgba(0, 113, 227, 0.08); border: 1px solid rgba(0, 113, 227, 0.18); color: #0071e3; }
    .pill.medium { background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn); }
    .pill.high { background: var(--bad-bg); border: 1px solid var(--bad-border); color: var(--bad); }
    .pill.critical { background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.2); color: #8b5cf6; }

    .tag-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }

    .perm-tag {
      background: var(--bg-perm-tag);
      border: 1px solid var(--border-perm-tag);
      color: var(--muted);
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
    }

    .perm-tag.dangerous {
      background: rgba(255, 59, 48, 0.08);
      border-color: rgba(255, 59, 48, 0.18);
      color: var(--bad);
    }

    /* Issues list */
    .issues {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .issue {
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      padding: 18px;
      box-shadow: var(--glow-strength);
      transition: all 0.15s ease;
    }

    .issue:hover {
      background: var(--panel-hover);
      transform: translateY(-1px);
      box-shadow: var(--glow-hover);
    }

    .issue-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .issue-title-block {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .issue-title {
      font-weight: 600;
      font-size: 14.5px;
      color: var(--ink);
    }

    .issue-sev {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 10px;
      padding: 3px 8px;
      border-radius: 6px;
      letter-spacing: 0.05em;
    }

    .issue-sev.P0 { background: rgba(255, 59, 48, 0.08); border: 1px solid rgba(255, 59, 48, 0.18); color: var(--bad); }
    .issue-sev.P1 { background: rgba(255, 149, 0, 0.08); border: 1px solid rgba(255, 149, 0, 0.18); color: var(--warn); }
    .issue-sev.P2 { background: rgba(0, 113, 227, 0.08); border: 1px solid rgba(0, 113, 227, 0.18); color: var(--accent); }
    .issue-sev.P3 { background: rgba(0, 0, 0, 0.04); border: 1px solid rgba(0, 0, 0, 0.1); color: var(--muted); }

    .issue-content {
      margin-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .issue p {
      margin: 0;
      color: var(--muted);
      font-size: 13.5px;
      line-height: 1.5;
    }

    .issue-meta-title {
      font-size: 11px;
      color: var(--muted-dark);
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
    }

    .issue-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12.5px;
      background: var(--bg-inspector-value);
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid var(--line);
      overflow-wrap: anywhere;
      color: var(--ink);
    }

    .no-issue-state {
      padding: 40px 20px;
      text-align: center;
      color: var(--muted);
      font-size: 14px;
    }

    .methodology-card {
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 14px;
      padding: 20px;
      box-shadow: var(--glow-strength);
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-bottom: 18px;
    }

    .methodology-card h3 {
      margin: 0;
      font-size: 16px;
      color: var(--ink);
    }

    .methodology-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }

    .methodology-item {
      background: var(--bg-inspector-value);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .methodology-item strong {
      display: block;
      color: var(--ink);
      margin-bottom: 4px;
    }

    /* Market / Installed / CLI / Issues Views */
    .issues-scroll-area {
      flex: 1;
      overflow-y: auto;
      padding: 28px;
      background: var(--bg);
    }

    .inspector-actions-row {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    /* Generic List Cards for browsing */
    .list-card {
      background: transparent;
      border: 1px solid transparent;
      border-bottom: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px 14px;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      box-shadow: none;
    }

    .list-card:hover {
      background: var(--panel-hover);
      border-color: transparent;
      border-bottom: 1px solid var(--line);
      transform: none;
      box-shadow: none;
    }

    .list-card.active {
      background: rgba(139, 92, 246, 0.08);
      border-color: transparent;
      border-bottom: 1px solid var(--line);
      border-left: 3px solid var(--accent);
      box-shadow: none;
    }

    .list-card.installed {
      border-left: 3px solid var(--ok);
    }

    .list-card.new {
      border-left: 3px solid var(--warn);
    }

    .list-card-header {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: flex-start;
      gap: 4px;
      width: 100%;
      overflow: hidden;
    }

    .list-card-title {
      font-weight: 600;
      color: var(--ink);
      font-size: 14.5px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
      flex-shrink: 1;
    }

    .list-card-subtitle {
      font-size: 10px;
      color: var(--muted-dark);
      font-family: 'JetBrains Mono', monospace;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      white-space: normal;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
      flex-shrink: 0;
    }

    .list-card-desc {
      display: none;
    }

    .market-discovery {
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 18px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      box-shadow: var(--glow-strength);
    }

    .market-head {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 10px;
    }

    .market-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--ink);
      overflow-wrap: anywhere;
      letter-spacing: -0.01em;
    }

    .market-source {
      color: var(--muted-dark);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      overflow-wrap: anywhere;
      margin-top: 2px;
    }

    .market-desc {
      color: var(--muted);
      font-size: 13.5px;
      line-height: 1.5;
      flex: 1;
    }

    .market-usage {
      color: var(--ink);
      font-size: 12.5px;
      line-height: 1.5;
      background: var(--bg-inspector-value);
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid var(--line);
    }

    .market-meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
    }

    .installed-target {
      border: 1px solid var(--ok-border);
      background: var(--ok-bg);
      color: var(--ok);
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 600;
    }

    .quick-command-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .quick-command-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      align-items: stretch;
    }

    .quick-command {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      line-height: 1.45;
      color: var(--ink);
      background: var(--bg-inspector-value);
      border: 1px solid var(--panel-border);
      border-radius: 8px;
      padding: 8px;
      overflow-wrap: anywhere;
      user-select: text;
    }

    .quick-command-label {
      color: var(--muted-dark);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.02em;
      margin-bottom: 3px;
      text-transform: uppercase;
    }

    .quick-command-copy {
      padding: 6px 10px;
      min-width: 54px;
      align-self: stretch;
    }

    .market-actions {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      margin-top: 4px;
    }

    /* Standard Button Styles */
    button, .btn-primary, .btn-secondary, .btn-danger {
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      outline: none;
    }

    .btn-primary {
      background: var(--accent);
      color: #ffffff;
    }

    .btn-primary:hover {
      background: #0077ed;
      transform: translateY(-0.5px);
    }

    .btn-primary:active {
      transform: translateY(0);
    }

    .btn-primary:disabled {
      background: #e5e5ea;
      color: #aeaeb2;
      cursor: not-allowed;
      transform: none;
    }

    .btn-secondary {
      background: var(--bg-badge);
      border-color: var(--panel-border);
      color: var(--ink);
    }

    .btn-secondary:hover {
      background: var(--bg-nav-active);
      border-color: var(--panel-border-active);
    }

    .btn-secondary:disabled {
      background: rgba(0, 0, 0, 0.02);
      color: #aeaeb2;
      cursor: not-allowed;
    }

    .btn-danger {
      background: rgba(255, 59, 48, 0.1);
      border-color: rgba(255, 59, 48, 0.1);
      color: var(--bad);
    }

    .btn-danger:hover {
      background: rgba(255, 59, 48, 0.2);
      border-color: rgba(255, 59, 48, 0.2);
    }

    .btn-danger:disabled {
      background: rgba(0, 0, 0, 0.02);
      color: #aeaeb2;
      cursor: not-allowed;
    }

    /* Onboarding / Permissions Backdrop */
    .onboarding-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .onboarding-backdrop.visible {
      display: flex;
    }

    .onboarding-card {
      width: min(600px, 100%);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.2);
      padding: 36px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .onboarding-card h2 {
      margin: 0;
      font-size: 26px;
      font-weight: 700;
      color: var(--ink);
      letter-spacing: -0.03em;
    }

    .onboarding-card p {
      color: var(--muted);
      line-height: 1.6;
      margin: 0;
      font-size: 14.5px;
    }

    .permission-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
    }

    .permission-item {
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      padding: 16px;
      background: var(--bg-list-scroll);
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: all 0.2s;
    }

    .permission-item:hover {
      background: var(--bg-inspector-value);
      border-color: var(--panel-border-active);
    }

    .permission-item strong {
      display: block;
      color: var(--ink);
      font-size: 14.5px;
    }

    .permission-item span {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .onboarding-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 8px;
    }

    /* Custom Scrollbar styling */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb);
      border-radius: 99px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--scrollbar-thumb-hover);
    }

    .pulse-dot.scanning {
      background: var(--warn);
      box-shadow: 0 0 10px var(--warn);
    }

    .pulse-dot.failed {
      background: var(--bad);
      box-shadow: 0 0 10px var(--bad);
    }

    @keyframes pulse {
      0% { opacity: 0.4; transform: scale(0.85); }
      100% { opacity: 1; transform: scale(1.15); }
    }

    /* Theme Toggle Switch styles */
    .theme-icon-sun { display: none; }
    .theme-icon-moon { display: none; }
    :root[data-theme="dark"] .theme-icon-sun { display: inline-block !important; }
    :root:not([data-theme="dark"]) .theme-icon-moon { display: inline-block !important; }
    /* Premium UI Upgrades: Timeline & MCP Grid */
    
    @keyframes pulse-neon-ok {
      0% { box-shadow: 0 0 0 0 rgba(36, 178, 73, 0.4); }
      70% { box-shadow: 0 0 0 8px rgba(36, 178, 73, 0); }
      100% { box-shadow: 0 0 0 0 rgba(36, 178, 73, 0); }
    }
    @keyframes pulse-neon-error {
      0% { box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.4); }
      70% { box-shadow: 0 0 0 8px rgba(255, 59, 48, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 59, 48, 0); }
    }
    
    .neon-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 8px;
    }
    .neon-dot.ok { background-color: var(--ok); animation: pulse-neon-ok 2s infinite; }
    .neon-dot.error { background-color: var(--bad); animation: pulse-neon-error 2s infinite; }

    .timeline-container { position: relative; padding: 20px 0 20px 30px; }
    .timeline-container::before {
      content: ''; position: absolute; top: 0; bottom: 0; left: 10px; width: 2px;
      background: linear-gradient(to bottom, var(--accent), rgba(0, 113, 227, 0.1) 90%, transparent);
      border-radius: 2px;
    }
    .timeline-node { position: relative; margin-bottom: 24px; transition: transform 0.2s ease, box-shadow 0.2s ease; }
    .timeline-node:hover { transform: translateY(-2px); }
    .timeline-node::before {
      content: ''; position: absolute; left: -25px; top: 14px; width: 12px; height: 12px;
      border-radius: 50%; background: var(--panel); border: 2px solid var(--accent); z-index: 2;
    }
    .timeline-node.install::before { border-color: var(--ok); background: var(--ok-bg); }
    .timeline-node.remove::before { border-color: var(--bad); background: var(--bad-bg); }
    .timeline-node.snapshot::before { border-color: var(--warn); background: var(--warn-bg); }

    .glass-card {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--panel-border);
      border-radius: 12px; padding: 16px;
      box-shadow: var(--glow-strength);
    }
    :root[data-theme="light"] .glass-card {
      background: rgba(255, 255, 255, 0.6);
    }
    .timeline-node:hover .glass-card { box-shadow: var(--glow-hover); border-color: var(--accent-glow); }

    .mcp-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; padding: 16px 0;
    }
    .mcp-tool-card {
      background: var(--panel); border: 1px solid var(--panel-border); border-radius: 12px;
      padding: 16px; display: flex; flex-direction: column; transition: all 0.2s ease;
      cursor: pointer; position: relative; overflow: hidden;
    }
    .mcp-tool-card:hover { transform: translateY(-2px); box-shadow: var(--glow-hover); border-color: var(--accent); }
    .mcp-tool-name { font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 14px; color: var(--accent); margin-bottom: 8px; }
    .mcp-tool-desc { font-size: 13px; color: var(--muted); line-height: 1.5; flex-grow: 1; }
  </style>
</head>
<body>
  <div id="app-container">
    <!-- Left Sidebar -->
    <aside id="sidebar">
      <div class="brand-header">
        <div class="brand-logo-wrap">
          <span class="brand-logo-frame" aria-hidden="true">
            <img class="brand-logo" src="/assets/logo-ui.png" srcset="/assets/logo-ui.png 1x, /assets/logo-ui@2x.png 2x" alt="" width="34" height="34">
          </span>
          <h1>SkillOps Local</h1>
        </div>
        <div class="root" title="${escapedRoot}">${escapedRoot}</div>
      </div>
      
      <div class="sidebar-status">
        <span class="pulse-dot" id="status-dot"></span>
        <span id="status-text">Ready</span>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-item active" id="nav-capabilities" onclick="switchTab('capabilities')">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <span id="txt-nav-capabilities">Capabilities</span>
          <span class="nav-badge" id="badge-cap-count">0</span>
        </div>
        <div class="nav-item" id="nav-installed" onclick="switchTab('installed')">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7L9 18l-5-5"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <span id="txt-nav-installed">Installed</span>
          <span class="nav-badge" id="badge-installed-count">0</span>
        </div>
        <div class="nav-item" id="nav-market" onclick="switchTab('market')">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 20H2v-5M7 7h.01"/></svg>
          <span id="txt-nav-market">Skill Market</span>
          <span class="nav-badge" id="badge-market-count">0</span>
        </div>
        <div class="nav-item" id="nav-cli" onclick="switchTab('cli')">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          <span id="txt-nav-cli">CLI Tools</span>
          <span class="nav-badge" id="badge-cli-count">0</span>
        </div>
        <div class="nav-item" id="nav-issues" onclick="switchTab('issues')">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
          <span id="txt-nav-issues">Issues</span>
          <span class="nav-badge alert" id="badge-issue-count">0</span>
        </div>
        <div class="nav-item" id="nav-history" onclick="switchTab('history')">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span id="txt-nav-history">History</span>
          <span class="nav-badge" id="badge-history-count">0</span>
        </div>
        <div class="nav-item" id="nav-mcp-tools" onclick="switchTab('mcp-tools')">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          <span id="txt-nav-mcp-tools">MCP Tools</span>
          <span class="nav-badge" id="badge-mcp-tools-count">0</span>
        </div>
        <div class="nav-item" id="nav-trash" onclick="switchTab('trash')">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          <span id="txt-nav-trash">Trash</span>
          <span class="nav-badge" id="badge-trash-count">0</span>
        </div>
      </nav>

      <div class="sidebar-scan-controls">
        <button id="refresh" class="btn-primary">Refresh Scan</button>
        <div class="scan-options">
          <label class="checkbox-label">
            <input id="home" type="checkbox" ${defaultHome === "true" ? "checked" : ""}>
            <span id="txt-home">include home capabilities</span>
          </label>
          <label class="checkbox-label">
            <input id="probe" type="checkbox">
            <span id="txt-probe">probe MCP servers</span>
          </label>
        </div>
      </div>

      <div class="sidebar-open-source">
        <strong id="open-source-title">Open source ready</strong>
        <span id="open-source-copy">MIT project, GitHub releases, npm CLI and desktop builds for Mac M-series and Windows.</span>
      </div>

      <div class="sidebar-footer">
        <button id="btn-permissions" class="btn-lang">Permissions</button>
        <button id="btn-theme" class="btn-lang" aria-label="Toggle theme" style="display: inline-flex; align-items: center; justify-content: center; width: 34px; flex: none; padding: 6px 0;">
          <svg class="theme-icon-sun" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          <svg class="theme-icon-moon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
        <button id="btn-lang" class="btn-lang">中文</button>
      </div>
    </aside>

    <!-- Main Workspace -->
    <main id="workspace">
      <!-- Capabilities View -->
      <section id="view-capabilities" class="view-panel active">
        <!-- Top Filters bar -->
        <div class="view-header">
          <div class="filters-row">
            <div class="search-box">
              <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input id="search" type="text" class="search-input" placeholder="Search by name, description, path...">
            </div>
            <select id="filter-type" class="filter-select">
              <option value="all">All Types</option>
              <option value="skill">Skill</option>
              <option value="mcp_server">MCP Server</option>
              <option value="plugin">Plugin</option>
              <option value="command">Command</option>
              <option value="hook">Hook</option>
              <option value="agent">Agent</option>
            </select>
            <select id="filter-health" class="filter-select">
              <option value="all">All Health</option>
              <option value="ok">OK</option>
              <option value="warning">Warning</option>
              <option value="broken">Broken</option>
              <option value="unknown">Unknown</option>
            </select>
            <select id="filter-risk" class="filter-select">
              <option value="all">All Risks</option>
              <option value="low">Low Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="high">High Risk</option>
              <option value="critical">Critical Risk</option>
            </select>
          </div>
        </div>

        <!-- Metrics summary bar -->
        <div class="summary-metrics" id="summary"></div>

        <!-- Split Pane -->
        <div class="split-pane">
          <!-- Left list pane -->
          <div class="list-pane">
            <div class="list-pane-header" style="padding: 12px 16px; border-bottom: 1px solid var(--line); font-weight:600; font-size:13px; color:var(--muted); text-transform:uppercase; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
              <span id="txt-sec-cap">Capabilities</span>
              <span class="sec-badge" id="badge-cap-count-sec">0</span>
            </div>
            <div class="list-scroll" id="capabilities-list"></div>
          </div>
          <!-- Right details pane -->
          <div class="details-pane" id="capability-inspector"></div>
        </div>
      </section>

      <!-- Installed Inventory View -->
      <section id="view-installed" class="view-panel">
        <div class="view-header flex-header">
          <h2 class="view-title">
            <span id="txt-sec-installed">Installed</span>
            <span class="sec-badge" id="badge-installed-count-sec">0</span>
          </h2>
          <div class="market-controls">
            <div class="search-box">
              <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input id="installed-search" type="text" class="search-input" placeholder="Search installed skills, MCP, CLI...">
            </div>
            <select id="installed-view" class="filter-select">
              <option value="all">All installed</option>
              <option value="skill">Skills</option>
              <option value="mcp_server">MCP servers</option>
              <option value="cli">CLI tools</option>
            </select>
            <button id="installed-refresh" class="btn-primary">Query Installed</button>
          </div>
        </div>
        
        <!-- Split Pane -->
        <div class="split-pane">
          <!-- Left list pane -->
          <div class="list-pane">
            <div id="installed-batch-bar" style="display:none; justify-content:space-between; align-items:center; padding: 8px 12px; background:var(--bg-dark); border-bottom:1px solid var(--border); font-size:13px;">
              <span id="installed-batch-count" style="font-weight:600; color:var(--text);">0 selected</span>
              <button class="btn-danger" style="padding:4px 8px; font-size:12px;" onclick="batchRemoveInstalled()">Remove Selected</button>
            </div>
            <div class="list-scroll" id="installed-list"></div>
          </div>
          <!-- Right details pane -->
          <div class="details-pane" id="installed-inspector"></div>
        </div>
      </section>

      <!-- Trash View -->
      <section id="view-trash" class="view-panel">
        <div class="view-header flex-header">
          <h2 class="view-title">
            <span id="txt-sec-trash">Trash</span>
            <span class="sec-badge" id="badge-trash-count-sec">0</span>
          </h2>
          <div class="market-controls">
            <button id="trash-refresh" class="btn-secondary" style="height: 32px; padding: 0 12px; font-size: 12px;">Refresh Trash</button>
          </div>
        </div>
        <div class="split-pane">
          <div class="list-pane">
            <div class="discovery-note">
              <strong id="trash-discovery-title">Skill Trash</strong>
              <span id="trash-discovery-copy">Removed skills appear here when they are moved to ~/.skillops/trash.</span>
            </div>
            <div class="list-scroll" id="trash-list"></div>
          </div>
          <div class="details-pane" id="trash-inspector"></div>
        </div>
      </section>

      <!-- Skill Market View -->
      <section id="view-market" class="view-panel">
        <div class="view-header flex-header">
          <h2 class="view-title">
            <span id="txt-sec-market">Skill Market</span>
            <span class="sec-badge" id="badge-market-count-sec">0</span>
          </h2>
          <div class="market-controls">
            <div class="search-box">
              <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input id="market-search" type="text" class="search-input" placeholder="Search uninstalled skills...">
            </div>
            <select id="market-view" class="filter-select">
              <option value="all">All market entries</option>
              <option value="new">New to you</option>
              <option value="uninstalled">Uninstalled</option>
              <option value="installable">Direct install</option>
              <option value="directories">Discovery directories</option>
              <option value="installed">Installed</option>
            </select>
            <select id="market-target" class="filter-select">
              <option value="codex">Install to Codex</option>
              <option value="claude">Install to Claude</option>
              <option value="project">Install to Project</option>
            </select>
            <button id="market-refresh" class="btn-primary">Search Market</button>
          </div>
        </div>
        
        <!-- Split Pane -->
        <div class="split-pane">
          <!-- Left list pane -->
          <div class="list-pane">
            <!-- Market controls / GitHub controls -->
            <div style="padding: 12px 16px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; background: var(--panel);">
              <div class="github-controls" style="display: flex; gap: 8px; width: 100%;">
                <input id="github-source" type="text" class="search-input" style="flex: 1; height: 32px; font-size: 12px;" placeholder="GitHub URL e.g. https://github.com/owner/repo/tree/main/skills/foo">
                <button id="github-install" class="btn-secondary" style="height: 32px; padding: 0 10px; font-size: 12px;" data-skillops-action="install-github">Install</button>
              </div>
              <div style="display: flex; gap: 8px; justify-content: space-between;">
                <button id="market-show-new" class="btn-secondary" style="flex: 1; height: 28px; padding: 0; font-size: 11px;">Show New</button>
                <button id="market-mark-seen" class="btn-secondary" style="flex: 1; height: 28px; padding: 0; font-size: 11px;">Mark Seen</button>
              </div>
            </div>
            <div class="list-scroll" id="market-list"></div>
          </div>
          <!-- Right details pane -->
          <div class="details-pane" id="market-inspector"></div>
        </div>
      </section>

      <!-- CLI Tools View -->
      <section id="view-cli" class="view-panel">
        <div class="view-header flex-header">
          <h2 class="view-title">
            <span id="txt-sec-cli">CLI Tools</span>
            <span class="sec-badge" id="badge-cli-count-sec">0</span>
          </h2>
          <div class="market-controls">
            <div class="search-box">
              <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input id="cli-search" type="text" class="search-input" placeholder="Search CLI tools...">
            </div>
            <select id="cli-view" class="filter-select">
              <option value="all">All CLI tools</option>
              <option value="installed">Installed</option>
              <option value="uninstalled">Uninstalled</option>
              <option value="agent">AI agent CLIs</option>
              <option value="toolchain">Toolchain</option>
            </select>
            <button id="cli-refresh" class="btn-primary">Refresh CLI</button>
          </div>
        </div>
        
        <!-- Split Pane -->
        <div class="split-pane">
          <!-- Left list pane -->
          <div class="list-pane">
            <div class="list-scroll" id="cli-list"></div>
          </div>
          <!-- Right details pane -->
          <div class="details-pane" id="cli-inspector"></div>
        </div>
      </section>

      <!-- Issues View -->
      <section id="view-issues" class="view-panel">
        <div class="view-header">
          <h2 class="view-title">
            <span id="txt-sec-issue">Issues</span>
            <span class="sec-badge alert" id="badge-issue-count-nav">0</span>
          </h2>
        </div>
        <div class="issues-scroll-area">
          <div id="risk-methodology" class="methodology-card"></div>
          <div class="issues" id="issues"></div>
        </div>
      </section>

      <!-- History View -->
      <section id="view-history" class="view-panel">
        <div class="view-header">
          <h2 class="view-title">
            <span id="txt-sec-history">Operation History</span>
            <span class="sec-badge" id="badge-history-count-header">0</span>
          </h2>
        </div>
        <div class="issues-scroll-area">
          <div class="issues" id="history-list"></div>
        </div>
      </section>

      <!-- Skill Preview Modal -->
      <div id="preview-modal" class="onboarding-backdrop" style="display:none; z-index: 1000;">
        <div class="onboarding-card" style="max-width: 800px; width: 90%; max-height: 90vh; overflow-y: auto; padding: 24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
            <h2 id="preview-title" style="margin:0;">Preview</h2>
            <button onclick="document.getElementById('preview-modal').style.display='none'" class="btn-secondary">Close</button>
          </div>
          <div id="preview-content" style="font-family: monospace; white-space: pre-wrap; background: var(--bg-dark); padding: 16px; border-radius: 6px; font-size: 13px; border: 1px solid var(--border);"></div>
        </div>
      </div>

      <!-- MCP Tools View -->
      <section id="view-mcp-tools" class="view-panel">
        <div class="view-header flex-header">
          <h2 class="view-title">
            <span id="txt-sec-mcp-tools">MCP Tools</span>
            <span class="sec-badge" id="badge-mcp-tools-count-header">0</span>
          </h2>
          <div class="market-controls">
            <input id="mcp-install-name" type="text" class="search-input" style="width: 160px; padding-left: 12px;" placeholder="Server name">
            <input id="mcp-install-command" type="text" class="search-input" style="width: 320px; padding-left: 12px;" placeholder="Command or URL">
            <select id="mcp-install-target" class="filter-select">
              <option value="project">Project</option>
              <option value="cursor">Cursor</option>
              <option value="claude">Claude</option>
            </select>
            <button id="mcp-install" class="btn-primary" data-skillops-action="install-mcp-form">Install MCP</button>
            <button id="mcp-tools-refresh" class="btn-secondary">Refresh</button>
          </div>
        </div>
        <div class="split-layout">
          <div class="list-pane">
            <div id="mcp-tools-list" class="list-container"></div>
          </div>
          <div class="details-pane" id="mcp-tools-inspector"></div>
        </div>
      </section>
    </main>
  </div>

      <div id="onboarding" class="onboarding-backdrop">
        <div class="onboarding-card">
      <h2 id="onboarding-title">Welcome to SkillOps</h2>
      <p id="onboarding-copy">SkillOps runs locally and helps you inspect skills and MCP servers before agents use them.</p>
      <div class="permission-list">
        <div class="permission-item">
          <strong id="perm-scan-title">Local scan</strong>
          <span id="perm-scan-copy">Reads common skill folders such as ~/.codex/skills and ~/.claude/skills. This is enabled by default.</span>
        </div>
        <div class="permission-item">
          <strong id="perm-market-title">Skill market</strong>
          <span id="perm-market-copy">Searches public skill sources and previews usage information. Preview does not execute scripts.</span>
        </div>
        <div class="permission-item">
          <label class="checkbox-label">
            <input id="perm-install" type="checkbox">
            <strong id="perm-install-title">Allow install</strong>
          </label>
          <span id="perm-install-copy">Allows SkillOps to copy a reviewed skill into Codex, Claude, or the current project.</span>
        </div>
        <div class="permission-item">
          <label class="checkbox-label">
            <input id="perm-remove" type="checkbox">
            <strong id="perm-remove-title">Allow remove</strong>
          </label>
          <span id="perm-remove-copy">Allows SkillOps to move installed skills into ~/.skillops/trash or permanently delete them after confirmation.</span>
        </div>
      </div>
      <div class="onboarding-actions">
        <button id="onboarding-readonly" class="btn-secondary">Start read-only</button>
        <button id="onboarding-save" class="btn-primary">Continue</button>
      </div>
        </div>
      </div>

      <div id="dialog-modal" class="onboarding-backdrop">
        <div class="onboarding-card" style="max-width: 460px;">
          <h2 id="dialog-title">Confirm action</h2>
          <p id="dialog-message">Are you sure?</p>
          <div class="onboarding-actions">
            <button id="dialog-cancel" class="btn-secondary">Cancel</button>
            <button id="dialog-ok" class="btn-primary">OK</button>
          </div>
        </div>
      </div>

      <script>
    const TRANSLATIONS = {
      zh: {
        title: "SkillOps Local",
        statusReady: "准备就绪",
        statusScanning: "正在扫描...",
        statusFailed: "扫描失败",
        statusLastScan: "上次扫描: ",
        btnRefresh: "刷新扫描",
        labelHome: "包含主目录能力 (~/.codex 等)",
        labelProbe: "探测/测试 MCP 服务器",
        openSourceTitle: "准备开源到 GitHub",
        openSourceCopy: "MIT 协议，本地优先；支持 npm CLI、mac M 系列客户端和 Windows 客户端发布。",
        metricTotal: "全部代理能力",
        metricSkills: "Skills 技能",
        metricMcps: "MCP 服务端",
        metricWarnings: "健康警告数",
        metricIssues: "发现安全与配置缺陷",
        metricHintTotal: "清空筛选，查看全部能力",
        metricHintSkills: "筛选本地已安装 Skills",
        metricHintMcps: "筛选 MCP 服务端",
        metricHintWarnings: "筛选健康状态为 Warning 的能力",
        metricHintIssues: "跳转到缺陷与风险报告",
        searchPlaceholder: "输入名称、描述、路径或指令搜索...",
        filterAllTypes: "所有类型",
        filterAllHealth: "所有健康度",
        filterAllRisk: "所有安全风险",
        secCapabilities: "发现的代理能力",
        secIssues: "缺陷与风险报告",
        thName: "名称 / 来源",
        thType: "类型",
        thHealth: "健康度",
        thRisk: "安全风险",
        thDesc: "描述 / 绝对路径",
        thActions: "操作",
        secMarket: "Skill 市场",
        marketSearchPlaceholder: "搜索未安装 skills、来源、标签或使用方法...",
        marketRefresh: "搜索市场",
        marketTargetCodex: "安装到 Codex",
        marketTargetClaude: "安装到 Claude",
        marketTargetProject: "安装到当前项目",
        marketGitHubPlaceholder: "从 GitHub URL 安装，例如 https://github.com/owner/repo/tree/main/skills/foo",
        marketGitHubInstall: "安装 GitHub Skill",
        marketInstall: "安装",
        marketInstalled: "已安装",
        marketOpen: "打开来源",
        marketUsage: "使用方法",
        marketDirectoryOnly: "目录来源",
        marketInstalledTargets: "已安装用户",
        marketQuickCommands: "快速指令",
        marketSummary: "简介",
        marketViewAll: "全部市场条目",
        marketViewNew: "新发现",
        marketViewUninstalled: "未安装",
        marketViewInstallable: "可直接安装",
        marketViewDirectories: "发现目录",
        marketViewInstalled: "已安装",
        marketDiscoveryTitle: "新 Skill 发现",
        marketDiscoveryCopy: "SkillOps 会把当前目录与本机已看过清单对比，突出新发现或未安装条目；安装仍然通过 GitHub URL 拉取并本地 lint。",
        marketShowNew: "只看新发现",
        marketMarkSeen: "标记为已看",
        marketNewBadge: "NEW",
        marketNoMatches: "没有找到符合当前筛选的市场条目",
        marketLoading: "正在搜索公开 Skill 来源...",
        secInstalled: "已安装清单",
        installedSearchPlaceholder: "搜索已安装 Skill、MCP、CLI、来源、路径或用法...",
        installedRefresh: "查询已安装",
        installedViewAll: "全部已安装",
        installedViewSkills: "Skills",
        installedViewMcp: "MCP 服务端",
        installedViewCli: "CLI 工具",
        installedDiscoveryTitle: "本机已安装查询",
        installedDiscoveryCopy: "这里直接查询当前电脑已经安装的 Skills、MCP servers 和 CLI tools。每一项都会展示简介、使用方法、来源/路径、健康状态和可复制快捷指令。",
        installedNoMatches: "没有找到符合当前筛选的已安装项目",
        installedFor: "已安装用户",
        installedSource: "来源",
        installedHealth: "健康度",
        installedRisk: "风险",
        installedCommand: "命令",
        secTrash: "回收站",
        trashRefresh: "刷新回收站",
        trashDiscoveryTitle: "Skill 回收站",
        trashDiscoveryCopy: "移除到回收站的 skill 会出现在这里，可恢复到原路径，也可永久删除。",
        trashNoItems: "回收站为空",
        trashRestore: "恢复",
        trashDelete: "永久删除",
        trashRestoreConfirm: "确认把这个 skill 恢复到原路径？",
        trashDeleteConfirm: "确认从回收站永久删除这个 skill？这个操作不可恢复。",
        dialogConfirm: "确认操作",
        dialogNotice: "提示",
        dialogCancel: "取消",
        dialogOk: "确定",
        trashOriginalPath: "原路径",
        trashPath: "回收站路径",
        trashTrashedAt: "移除时间",
        trashCannotRestore: "旧回收站项目缺少原路径记录，不能自动恢复。",
        secCli: "CLI 工具",
        cliSearchPlaceholder: "搜索已安装或未安装 CLI、平台、来源、用法...",
        cliRefresh: "刷新 CLI",
        cliViewAll: "全部 CLI",
        cliViewInstalled: "已安装",
        cliViewUninstalled: "未安装",
        cliViewAgent: "AI Agent CLI",
        cliViewToolchain: "工具链",
        cliDiscoveryTitle: "已安装 CLI 清单",
        cliDiscoveryCopy: "SkillOps 会从 PATH 探测已知 AI/开发 CLI，展示路径、版本、简介、用法、来源，并把帮助/安装/示例命令做成可复制快捷指令。",
        cliInstalled: "已安装",
        cliUninstalled: "未安装",
        cliInstall: "安装方式",
        cliCommand: "命令",
        cliPath: "安装路径",
        cliVersion: "版本",
        cliPlatforms: "平台",
        cliNoMatches: "没有找到符合当前筛选的 CLI",
        cliRemove: "卸载",
        cliInstallConfirm: "确认执行这个 CLI 安装命令？这会调用本机包管理器并可能联网。",
        cliRemoveConfirm: "确认执行这个 CLI 卸载命令？这会调用本机包管理器移除对应工具。",
        mcpInstallName: "Server 名称",
        mcpInstallCommand: "命令或 URL，例如 npx -y @modelcontextprotocol/server-filesystem /tmp",
        mcpInstallTargetProject: "当前项目",
        mcpInstallTargetCursor: "Cursor",
        mcpInstallTargetClaude: "Claude",
        mcpInstall: "安装 MCP",
        mcpRemove: "移除 MCP",
        mcpInstallConfirm: "确认安装这个 MCP Server？这会写入本地 MCP 配置文件。",
        mcpRemoveConfirm: "确认从配置文件移除这个 MCP Server？",
        copyCommand: "复制",
        copiedCommand: "已复制快捷指令",
        removeSkill: "移除",
        deleteSkill: "永久删除",
        removeConfirm: "确认移除这个 skill？它会被移动到 ~/.skillops/trash，不会永久删除。",
        deleteConfirm: "确认永久删除这个 skill？这个操作会直接删除对应目录，不能从 SkillOps 回收站恢复。",
        installConfirm: "确认安装这个 skill？安装前会先拉取源码并执行本地 lint，但不会执行 skill 脚本。",
        permissionDeniedInstall: "安装权限未开启。请先打开 Permissions 并允许安装。",
        permissionDeniedRemove: "移除权限未开启。请先打开 Permissions 并允许移除。",
        permissions: "权限",
        onboardingTitle: "欢迎使用 SkillOps 客户端",
        onboardingCopy: "SkillOps 在你的电脑本地运行，用来检查 skills 和 MCP servers。默认只读扫描；安装和移除需要你显式授权。",
        permScanTitle: "本地扫描",
        permScanCopy: "读取 ~/.codex/skills、~/.claude/skills、项目 skills 等常见目录。默认开启。",
        permMarketTitle: "Skill 市场",
        permMarketCopy: "搜索公开 skill 来源并预览简介、用法和风险。预览不会执行脚本。",
        permInstallTitle: "允许安装",
        permInstallCopy: "允许 SkillOps 把已检查的 skill 复制到 Codex、Claude 或当前项目。",
        permRemoveTitle: "允许移除",
        permRemoveCopy: "允许 SkillOps 把已安装 skill 移动到 ~/.skillops/trash，或在二次确认后永久删除对应目录。",
        startReadOnly: "只读开始",
        continue: "继续",
        actionDone: "操作完成，已刷新",
        noIssues: "环境非常健康，未检测到任何缺陷或风险！",
        detailsTitle: "能力详细信息",
        detailsPath: "文件路径:",
        detailsConfig: "配置文件:",
        detailsLang: "开发语言/运行时:",
        detailsPerms: "申请权限:",
        detailsNoPerms: "无需特殊权限",
        issueEvidence: "检测证据 / 代码片段:",
        issueSuggestion: "修复改进建议:",
        typeSkill: "技能 (Skill)",
        typeMcpServer: "MCP 服务器",
        typePlugin: "插件 (Plugin)",
        typeCommand: "外部命令",
        typeHook: "生命周期钩子",
        typeAgent: "智能体 (Agent)",
        healthOk: "健康 (OK)",
        healthWarning: "警告 (Warning)",
        healthBroken: "损坏 (Broken)",
        healthUnknown: "未知 (Unknown)",
        riskLow: "低风险 (Low)",
        riskMedium: "中风险 (Medium)",
        riskHigh: "高风险 (High)",
        riskCritical: "危险 (Critical)",
        riskMethodTitle: "报告判定依据",
        riskMethodSeverityTitle: "缺陷严重度",
        riskMethodSeverityCopy: "P0=疑似密钥/私钥；P1=提示注入、危险可执行命令、配置解析失败；P2=元数据缺失、触发范围过宽、文档中出现危险命令；P3=引用文件缺失或辅助文件不可读。",
        riskMethodHealthTitle: "健康度",
        riskMethodHealthCopy: "有 P0/P1 记为 Broken；有任意 P2/P3 记为 Warning；没有 issue 记为 OK；未探测的 MCP 为 Unknown。",
        riskMethodRiskTitle: "安全风险",
        riskMethodRiskCopy: "风险=权限推断分 + issue 分。写文件、shell、环境变量、发消息、数据库写入、云资源和支付交易会提高权限分；P0/P1/P2/P3 分别叠加不同 issue 分。",
        riskMethodScopeTitle: "当前范围",
        riskMethodScopeCopy: "扫描 SKILL.md、支持文件、MCP 配置和项目代理配置；预览市场不会执行脚本，安装和移除需要显式授权。",
        totalCount: "个",
        navHistory: "操作历史",
        navMcpTools: "MCP 工具",
        secHistory: "操作历史",
        secMcpTools: "MCP 工具",
        mcpToolsEmpty: "未发现 MCP 服务端",
        mcpToolsCount: "工具数",
        mcpToolsAvailable: "可用工具",
        mcpToolsNone: "无暴露工具",
        mcpToolNoDesc: "未提供描述",
        historyEmpty: "暂无历史记录。安装或移除 skill 后将在此显示。",
        previewSkillMd: "预览 SKILL.md",
        capabilitiesNoMatch: "没有找到符合过滤条件的代理能力",
      },
      en: {
        title: "SkillOps Local",
        statusReady: "Ready",
        statusScanning: "Scanning...",
        statusFailed: "Scan failed",
        statusLastScan: "Last scan: ",
        btnRefresh: "Refresh Scan",
        labelHome: "include home capabilities",
        labelProbe: "probe MCP servers",
        openSourceTitle: "Open source ready",
        openSourceCopy: "MIT, local-first; publish the npm CLI plus Mac M-series and Windows desktop builds.",
        metricTotal: "Total Capabilities",
        metricSkills: "Skills",
        metricMcps: "MCP Servers",
        metricWarnings: "Warnings",
        metricIssues: "Issues",
        metricHintTotal: "Clear filters and show all capabilities",
        metricHintSkills: "Filter installed Skills",
        metricHintMcps: "Filter MCP servers",
        metricHintWarnings: "Filter capabilities with Warning health",
        metricHintIssues: "Open the issues and risk report",
        searchPlaceholder: "Search by name, description, path...",
        filterAllTypes: "All Types",
        filterAllHealth: "All Health",
        filterAllRisk: "All Risks",
        secCapabilities: "Capabilities",
        secIssues: "Issues",
        thName: "Name / Source",
        thType: "Type",
        thHealth: "Health",
        thRisk: "Risk",
        thDesc: "Description",
        thActions: "Actions",
        secMarket: "Skill Market",
        marketSearchPlaceholder: "Search uninstalled skills, sources, tags, or usage...",
        marketRefresh: "Search Market",
        marketTargetCodex: "Install to Codex",
        marketTargetClaude: "Install to Claude",
        marketTargetProject: "Install to Project",
        marketGitHubPlaceholder: "Install from GitHub URL, e.g. https://github.com/owner/repo/tree/main/skills/foo",
        marketGitHubInstall: "Install GitHub Skill",
        marketInstall: "Install",
        marketInstalled: "Installed",
        marketOpen: "Open Source",
        marketUsage: "Usage",
        marketDirectoryOnly: "Directory",
        marketInstalledTargets: "Installed users",
        marketQuickCommands: "Quick commands",
        marketSummary: "Summary",
        marketViewAll: "All market entries",
        marketViewNew: "New to you",
        marketViewUninstalled: "Uninstalled",
        marketViewInstallable: "Direct install",
        marketViewDirectories: "Discovery directories",
        marketViewInstalled: "Installed",
        marketDiscoveryTitle: "New Skill Discovery",
        marketDiscoveryCopy: "SkillOps compares the current catalog with your local seen list, highlights new or uninstalled entries, and keeps install safe through GitHub URL import plus local lint.",
        marketShowNew: "Show New",
        marketMarkSeen: "Mark Seen",
        marketNewBadge: "NEW",
        marketNoMatches: "No market entries match the current filters",
        marketLoading: "Searching public Skill sources...",
        secInstalled: "Installed Inventory",
        installedSearchPlaceholder: "Search installed Skills, MCP, CLI, sources, paths, or usage...",
        installedRefresh: "Query Installed",
        installedViewAll: "All installed",
        installedViewSkills: "Skills",
        installedViewMcp: "MCP servers",
        installedViewCli: "CLI tools",
        installedDiscoveryTitle: "Installed Inventory",
        installedDiscoveryCopy: "Directly queries this computer's installed Skills, MCP servers, and CLI tools. Each item shows description, usage, source/path, health, and copyable commands.",
        installedNoMatches: "No installed items match the current filters",
        installedFor: "Installed for",
        installedSource: "Source",
        installedHealth: "Health",
        installedRisk: "Risk",
        installedCommand: "Command",
        secTrash: "Trash",
        trashRefresh: "Refresh Trash",
        trashDiscoveryTitle: "Skill Trash",
        trashDiscoveryCopy: "Skills removed to trash appear here. You can restore them to the original path or permanently delete them.",
        trashNoItems: "Trash is empty",
        trashRestore: "Restore",
        trashDelete: "Delete permanently",
        trashRestoreConfirm: "Restore this skill to its original path?",
        trashDeleteConfirm: "Permanently delete this skill from trash? This cannot be undone.",
        dialogConfirm: "Confirm action",
        dialogNotice: "Notice",
        dialogCancel: "Cancel",
        dialogOk: "OK",
        trashOriginalPath: "Original path",
        trashPath: "Trash path",
        trashTrashedAt: "Removed at",
        trashCannotRestore: "This older trash item has no original path record, so it cannot be restored automatically.",
        secCli: "CLI Tools",
        cliSearchPlaceholder: "Search installed or uninstalled CLIs, platforms, sources, or usage...",
        cliRefresh: "Refresh CLI",
        cliViewAll: "All CLI tools",
        cliViewInstalled: "Installed",
        cliViewUninstalled: "Uninstalled",
        cliViewAgent: "AI agent CLIs",
        cliViewToolchain: "Toolchain",
        cliDiscoveryTitle: "Installed CLI Inventory",
        cliDiscoveryCopy: "SkillOps checks known AI/developer CLIs from PATH, shows path, version, description, usage, source, and copyable help/install/example commands.",
        cliInstalled: "Installed",
        cliUninstalled: "Uninstalled",
        cliInstall: "Install",
        cliCommand: "Command",
        cliPath: "Path",
        cliVersion: "Version",
        cliPlatforms: "Platforms",
        cliNoMatches: "No CLI tools match the current filters",
        cliRemove: "Uninstall",
        cliInstallConfirm: "Run this CLI install command? This calls a local package manager and may use the network.",
        cliRemoveConfirm: "Run this CLI uninstall command? This calls a local package manager to remove the tool.",
        mcpInstallName: "Server name",
        mcpInstallCommand: "Command or URL, e.g. npx -y @modelcontextprotocol/server-filesystem /tmp",
        mcpInstallTargetProject: "Project",
        mcpInstallTargetCursor: "Cursor",
        mcpInstallTargetClaude: "Claude",
        mcpInstall: "Install MCP",
        mcpRemove: "Remove MCP",
        mcpInstallConfirm: "Install this MCP Server? This writes to a local MCP config file.",
        mcpRemoveConfirm: "Remove this MCP Server from the config file?",
        copyCommand: "Copy",
        copiedCommand: "Copied quick command",
        removeSkill: "Remove",
        deleteSkill: "Delete",
        removeConfirm: "Remove this skill? It will be moved to ~/.skillops/trash, not permanently deleted.",
        deleteConfirm: "Permanently delete this skill? This directly deletes the local directory and cannot be restored from the SkillOps trash.",
        installConfirm: "Install this skill? SkillOps will fetch the source and lint it locally before copying files.",
        permissionDeniedInstall: "Install permission is disabled. Open Permissions and allow install first.",
        permissionDeniedRemove: "Remove permission is disabled. Open Permissions and allow remove first.",
        permissions: "Permissions",
        onboardingTitle: "Welcome to SkillOps Desktop",
        onboardingCopy: "SkillOps runs locally on your computer to inspect skills and MCP servers. Scanning is read-only by default; install and remove require explicit permission.",
        permScanTitle: "Local scan",
        permScanCopy: "Reads common folders like ~/.codex/skills, ~/.claude/skills, and project skills. Enabled by default.",
        permMarketTitle: "Skill market",
        permMarketCopy: "Searches public skill sources and previews descriptions, usage, and risk. Preview does not execute scripts.",
        permInstallTitle: "Allow install",
        permInstallCopy: "Allows SkillOps to copy reviewed skills into Codex, Claude, or the current project.",
        permRemoveTitle: "Allow remove",
        permRemoveCopy: "Allows SkillOps to move installed skills into ~/.skillops/trash, or permanently delete the directory after confirmation.",
        startReadOnly: "Start read-only",
        continue: "Continue",
        actionDone: "Done. Refreshed.",
        noIssues: "No issues detected",
        detailsTitle: "Capability Details",
        detailsPath: "Path:",
        detailsConfig: "Config Path:",
        detailsLang: "Languages:",
        detailsPerms: "Permissions:",
        detailsNoPerms: "No permissions requested",
        issueEvidence: "Evidence:",
        issueSuggestion: "Suggestion:",
        typeSkill: "Skill",
        typeMcpServer: "MCP Server",
        typePlugin: "Plugin",
        typeCommand: "Command",
        typeHook: "Hook",
        typeAgent: "Agent",
        healthOk: "OK",
        healthWarning: "Warning",
        healthBroken: "Broken",
        healthUnknown: "Unknown",
        riskLow: "Low",
        riskMedium: "Medium",
        riskHigh: "High",
        riskCritical: "Critical",
        riskMethodTitle: "How Reports Are Scored",
        riskMethodSeverityTitle: "Issue severity",
        riskMethodSeverityCopy: "P0=possible secrets/private keys; P1=prompt injection, dangerous executable commands, or broken config parsing; P2=missing metadata, over-broad activation, or dangerous commands mentioned in docs; P3=missing references or unreadable support files.",
        riskMethodHealthTitle: "Health",
        riskMethodHealthCopy: "Any P0/P1 becomes Broken; any P2/P3 becomes Warning; no issues is OK; unprobed MCP servers remain Unknown.",
        riskMethodRiskTitle: "Security risk",
        riskMethodRiskCopy: "Risk combines inferred permission score and issue score. File writes, shell, env reads, messaging, database writes, cloud resources, and payment/trading raise the permission score; P0/P1/P2/P3 add issue score.",
        riskMethodScopeTitle: "Current scope",
        riskMethodScopeCopy: "SkillOps scans SKILL.md, support files, MCP configs, and project agent config. Market preview does not execute scripts; install/remove require explicit permission.",
        totalCount: "",
        navHistory: "History",
        navMcpTools: "MCP Tools",
        secHistory: "Operation History",
        secMcpTools: "MCP Tools",
        mcpToolsEmpty: "No MCP Servers found.",
        mcpToolsCount: "Tools",
        mcpToolsAvailable: "Available Tools",
        mcpToolsNone: "No tools exposed",
        mcpToolNoDesc: "No description provided.",
        historyEmpty: "No history found. Install or remove skills to see activity here.",
        previewSkillMd: "Preview SKILL.md",
        capabilitiesNoMatch: "No capabilities matching the filters found.",
      }
    };

    let currentLang = localStorage.getItem("lang") || (navigator.language.startsWith("zh") ? "zh" : "en");
    let capabilityData = [];
    let summaryData = {};
    let installedData = [];
    let installedSummary = {};
    let trashData = [];
    let marketData = [];
    let marketLoading = false;
    let cliData = [];
    let historyData = [];
    let mcpToolsData = [];
    let permissions = loadPermissions();
    let activeTab = "capabilities";
    let selectedCapabilityId = null;
    let selectedInstalledId = null;
    let selectedTrashId = null;
    let selectedMarketId = null;
    let selectedCliId = null;
    let selectedMcpToolId = null;
    let filterIssuesActive = false;
    let batchInstalledIds = new Set();
    const MARKET_SEEN_KEY = "skillopsSeenMarketSkillIds";
    let seenMarketIds = loadSeenMarketIds();
    const quickCommandRegistry = new Map();

    const statusDotEl = document.getElementById("status-dot");
    const statusTextEl = document.getElementById("status-text");
    const permissionsButton = document.getElementById("btn-permissions");
    const openSourceTitle = document.getElementById("open-source-title");
    const openSourceCopy = document.getElementById("open-source-copy");
    const summaryEl = document.getElementById("summary");
    const capabilitiesEl = document.getElementById("capabilities-list");
    const issuesEl = document.getElementById("issues");
    const refreshButton = document.getElementById("refresh");
    const homeInput = document.getElementById("home");
    const probeInput = document.getElementById("probe");
    const langBtn = document.getElementById("btn-lang");
    
    // Filters
    const searchInput = document.getElementById("search");
    const filterType = document.getElementById("filter-type");
    const filterHealth = document.getElementById("filter-health");
    const filterRisk = document.getElementById("filter-risk");
    
    // Badge and text elements
    const txtHome = document.getElementById("txt-home");
    const txtProbe = document.getElementById("txt-probe");
    const txtSecCap = document.getElementById("txt-sec-cap");
    const txtSecIssue = document.getElementById("txt-sec-issue");
    const badgeCapCount = document.getElementById("badge-cap-count");
    const badgeCapCountSec = document.getElementById("badge-cap-count-sec");
    const badgeIssueCount = document.getElementById("badge-issue-count");
    
    // Unused elements in split layout (set to null to prevent errors)
    const thName = null;
    const thType = null;
    const thHealth = null;
    const thRisk = null;
    const thDesc = null;
    const thActions = null;

    const txtSecInstalled = document.getElementById("txt-sec-installed");
    const badgeInstalledCount = document.getElementById("badge-installed-count");
    const badgeInstalledCountSec = document.getElementById("badge-installed-count-sec");
    const installedSearchInput = document.getElementById("installed-search");
    const installedViewSelect = document.getElementById("installed-view");
    const installedRefreshButton = document.getElementById("installed-refresh");
    const installedListEl = document.getElementById("installed-list");
    const installedBatchBar = document.getElementById("installed-batch-bar");
    const installedBatchCount = document.getElementById("installed-batch-count");
    const installedDiscoveryTitle = document.getElementById("installed-discovery-title");
    const installedDiscoveryCopy = document.getElementById("installed-discovery-copy");

    const txtSecTrash = document.getElementById("txt-sec-trash");
    const badgeTrashCount = document.getElementById("badge-trash-count");
    const badgeTrashCountSec = document.getElementById("badge-trash-count-sec");
    const trashRefreshButton = document.getElementById("trash-refresh");
    const trashListEl = document.getElementById("trash-list");
    const trashDiscoveryTitle = document.getElementById("trash-discovery-title");
    const trashDiscoveryCopy = document.getElementById("trash-discovery-copy");
    
    const txtSecMarket = document.getElementById("txt-sec-market");
    const badgeMarketCount = document.getElementById("badge-market-count");
    const badgeMarketCountSec = document.getElementById("badge-market-count-sec");
    const marketSearchInput = document.getElementById("market-search");
    const marketViewSelect = document.getElementById("market-view");
    const marketTarget = document.getElementById("market-target");
    const marketRefreshButton = document.getElementById("market-refresh");
    const marketListEl = document.getElementById("market-list");
    const marketDiscoveryTitle = document.getElementById("market-discovery-title");
    const marketDiscoveryCopy = document.getElementById("market-discovery-copy");
    const marketShowNewButton = document.getElementById("market-show-new");
    const marketMarkSeenButton = document.getElementById("market-mark-seen");
    const githubSourceInput = document.getElementById("github-source");
    const githubInstallButton = document.getElementById("github-install");
    const txtSecCli = document.getElementById("txt-sec-cli");
    const badgeCliCount = document.getElementById("badge-cli-count");
    const badgeCliCountSec = document.getElementById("badge-cli-count-sec");
    const cliSearchInput = document.getElementById("cli-search");
    const cliViewSelect = document.getElementById("cli-view");
    const cliRefreshButton = document.getElementById("cli-refresh");
    const cliListEl = document.getElementById("cli-list");
    const cliDiscoveryTitle = document.getElementById("cli-discovery-title");
    const cliDiscoveryCopy = document.getElementById("cli-discovery-copy");
    
    const txtSecHistory = document.getElementById("txt-sec-history");
    const badgeHistoryCount = document.getElementById("badge-history-count");
    const badgeHistoryCountHeader = document.getElementById("badge-history-count-header");
    const historyListEl = document.getElementById("history-list");
    
    const txtSecMcpTools = document.getElementById("txt-sec-mcp-tools");
    const badgeMcpToolsCount = document.getElementById("badge-mcp-tools-count");
    const badgeMcpToolsCountHeader = document.getElementById("badge-mcp-tools-count-header");
    const mcpToolsListEl = document.getElementById("mcp-tools-list");
    const mcpToolsRefreshBtn = document.getElementById("mcp-tools-refresh");
    const mcpToolsInspectorEl = document.getElementById("mcp-tools-inspector");
    const mcpInstallNameInput = document.getElementById("mcp-install-name");
    const mcpInstallCommandInput = document.getElementById("mcp-install-command");
    const mcpInstallTargetSelect = document.getElementById("mcp-install-target");
    const mcpInstallButton = document.getElementById("mcp-install");
    
    const riskMethodologyEl = document.getElementById("risk-methodology");
    const onboardingEl = document.getElementById("onboarding");
    const onboardingTitle = document.getElementById("onboarding-title");
    const onboardingCopy = document.getElementById("onboarding-copy");
    const permScanTitle = document.getElementById("perm-scan-title");
    const permScanCopy = document.getElementById("perm-scan-copy");
    const permMarketTitle = document.getElementById("perm-market-title");
    const permMarketCopy = document.getElementById("perm-market-copy");
    const permInstallTitle = document.getElementById("perm-install-title");
    const permInstallCopy = document.getElementById("perm-install-copy");
    const permRemoveTitle = document.getElementById("perm-remove-title");
    const permRemoveCopy = document.getElementById("perm-remove-copy");
    const permInstallInput = document.getElementById("perm-install");
    const permRemoveInput = document.getElementById("perm-remove");
    const onboardingReadOnly = document.getElementById("onboarding-readonly");
    const onboardingSave = document.getElementById("onboarding-save");
    const dialogModal = document.getElementById("dialog-modal");
    const dialogTitle = document.getElementById("dialog-title");
    const dialogMessage = document.getElementById("dialog-message");
    const dialogCancel = document.getElementById("dialog-cancel");
    const dialogOk = document.getElementById("dialog-ok");
    let dialogResolver = null;

    langBtn.addEventListener("click", () => {
      currentLang = currentLang === "zh" ? "en" : "zh";
      localStorage.setItem("lang", currentLang);
      applyTranslations();
      render();
      renderInstalled();
      renderTrash();
      renderMarket();
      renderCliTools();
    });

    const themeBtn = document.getElementById("btn-theme");
    themeBtn.addEventListener("click", () => {
      const activeTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", activeTheme);
      localStorage.setItem("theme", activeTheme);
    });

    refreshButton.addEventListener("click", load);
    homeInput.addEventListener("change", load);
    probeInput.addEventListener("change", load);
    
    // Live search/filtering listeners
    searchInput.addEventListener("input", render);
    filterType.addEventListener("change", render);
    filterHealth.addEventListener("change", render);
    filterRisk.addEventListener("change", render);
    installedSearchInput.addEventListener("input", debounce(loadInstalled, 250));
    installedViewSelect.addEventListener("change", renderInstalled);
    installedRefreshButton.addEventListener("click", loadInstalled);
    trashRefreshButton.addEventListener("click", loadTrash);
    marketSearchInput.addEventListener("input", debounce(loadMarket, 250));
    marketViewSelect.addEventListener("change", renderMarket);
    marketRefreshButton.addEventListener("click", loadMarket);
    cliSearchInput.addEventListener("input", debounce(loadCliTools, 250));
    cliViewSelect.addEventListener("change", renderCliTools);
    cliRefreshButton.addEventListener("click", loadCliTools);
    if (mcpToolsRefreshBtn) mcpToolsRefreshBtn.addEventListener("click", loadMcpTools);
    if (mcpInstallButton) mcpInstallButton.addEventListener("click", installMcpFromForm);
    marketShowNewButton.addEventListener("click", () => {
      marketViewSelect.value = "new";
      renderMarket();
      switchTab("market");
    });
    marketMarkSeenButton.addEventListener("click", () => {
      seenMarketIds = new Set(marketData.map((skill) => skill.id));
      localStorage.setItem(MARKET_SEEN_KEY, JSON.stringify([...seenMarketIds]));
      renderMarket();
    });
    githubInstallButton.addEventListener("click", () => installGitHub());
    permissionsButton.addEventListener("click", () => showOnboarding(false));
    onboardingReadOnly.addEventListener("click", () => savePermissions({ install: false, remove: false }));
    onboardingSave.addEventListener("click", () => savePermissions({
      install: permInstallInput.checked,
      remove: permRemoveInput.checked
    }));
    dialogCancel.addEventListener("click", () => closeDialog(false));
    dialogOk.addEventListener("click", () => closeDialog(true));
    document.addEventListener("click", (event) => {
      const target = event.target?.closest?.("[data-skillops-action]");
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      const id = target.dataset.id || "";
      const action = target.dataset.skillopsAction;
      if (action === "install-market") {
        installMarketSkill(id);
      } else if (action === "install-github") {
        installGitHub();
      } else if (action === "install-mcp-form") {
        installMcpFromForm();
      } else if (action === "remove-capability") {
        removeCapability(id, target.dataset.mode || "trash", target.dataset.kind || "skill");
      } else if (action === "remove-mcp") {
        removeMcpCapability(id);
      } else if (action === "cli-action") {
        runCliAction(id, target.dataset.cliAction || "install");
      } else if (action === "restore-trash") {
        restoreTrashEntry(id);
      } else if (action === "delete-trash") {
        deleteTrashEntry(id);
      }
    }, true);

    function switchTab(tabId) {
      activeTab = tabId;
      document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
      const navEl = document.getElementById("nav-" + tabId);
      if (navEl) navEl.classList.add("active");
      
      document.querySelectorAll(".view-panel").forEach(el => el.classList.remove("active"));
      const viewEl = document.getElementById("view-" + tabId);
      if (viewEl) viewEl.classList.add("active");
    }
    window.switchTab = switchTab;

    function selectCapability(id) {
      selectedCapabilityId = id;
      render();
    }
    window.selectCapability = selectCapability;

    function selectInstalled(id) {
      selectedInstalledId = id;
      renderInstalled();
    }
    window.selectInstalled = selectInstalled;

    function selectTrash(id) {
      selectedTrashId = id;
      renderTrash();
    }
    window.selectTrash = selectTrash;

    function selectMarket(id) {
      selectedMarketId = id;
      renderMarket();
    }
    window.selectMarket = selectMarket;

    function selectCli(id) {
      selectedCliId = id;
      renderCliTools();
    }
    window.selectCli = selectCli;

    function selectMcpTool(id) {
      selectedMcpToolId = id;
      renderMcpTools();
    }
    window.selectMcpTool = selectMcpTool;

    function toggleBatchInstalled(id, e) {
      e.stopPropagation();
      if (batchInstalledIds.has(id)) {
        batchInstalledIds.delete(id);
      } else {
        batchInstalledIds.add(id);
      }
      renderInstalled();
    }
    window.toggleBatchInstalled = toggleBatchInstalled;

    async function batchRemoveInstalled() {
      if (batchInstalledIds.size === 0) return;
      if (!permissions.remove) {
        requestPermission("remove");
        return;
      }
      if (!(await askConfirm("Are you sure you want to remove " + batchInstalledIds.size + " capabilities?", { danger: true }))) return;
      
      let successCount = 0;
      for (const id of batchInstalledIds) {
        const item = installedData.find((candidate) => candidate.id === id);
        if (!item) continue;
        try {
          let res;
          if (item.kind === "cli") {
            if (!item.uninstallCommand) continue;
            res = await fetch("/api/cli/action", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ toolId: item.id, action: "uninstall", confirm: true })
            });
          } else {
            res = await fetch("/api/capability/remove", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ capabilityId: item.capabilityId || item.id, mode: "trash", confirm: true })
            });
          }
          if (res.ok) successCount++;
        } catch (e) {
          console.error("Failed to remove", id, e);
        }
      }
      
      batchInstalledIds.clear();
      await loadInstalled();
      await showNotice("Removed " + successCount + " capabilities.");
    }
    window.batchRemoveInstalled = batchRemoveInstalled;

    async function previewSkill(source) {
      const modal = document.getElementById('preview-modal');
      const title = document.getElementById('preview-title');
      const content = document.getElementById('preview-content');
      if (!modal || !title || !content) return;
      
      modal.style.display = 'flex';
      title.textContent = "Loading preview...";
      content.textContent = "Fetching SKILL.md from " + source + "...";
      
      try {
        const res = await fetch("/api/skill/preview?source=" + encodeURIComponent(source));
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        title.textContent = data.preview.name;
        content.textContent = data.preview.markdown;
      } catch (err) {
        title.textContent = "Preview Error";
        content.textContent = err.message || err;
      }
    }
    window.previewSkill = previewSkill;

    window.removeCapability = removeCapability;
    window.restoreTrashEntry = restoreTrashEntry;
    window.deleteTrashEntry = deleteTrashEntry;
    window.installMarketSkill = installMarketSkill;
    window.runCliAction = runCliAction;
    window.removeMcpCapability = removeMcpCapability;
    window.copyQuickCommand = copyQuickCommand;

    function toggleMetricFilter(filterName, value) {
      switchTab(filterName === "issues" ? "issues" : "capabilities");
      if (filterName === "reset") {
        filterType.value = "all";
        filterHealth.value = "all";
        filterRisk.value = "all";
        searchInput.value = "";
        filterIssuesActive = false;
        render();
        return;
      }
      if (filterName === "type") {
        filterType.value = (filterType.value === value) ? "all" : value;
        filterHealth.value = "all";
        filterRisk.value = "all";
        searchInput.value = "";
        filterIssuesActive = false;
      } else if (filterName === "health") {
        filterType.value = "all";
        filterHealth.value = (filterHealth.value === value) ? "all" : value;
        filterRisk.value = "all";
        searchInput.value = "";
        filterIssuesActive = false;
      } else if (filterName === "issues") {
        filterIssuesActive = !filterIssuesActive;
        searchInput.value = "";
      }
      render();
    }
    window.toggleMetricFilter = toggleMetricFilter;

    function t(key) {
      return TRANSLATIONS[currentLang][key] || key;
    }

    function applyTranslations() {
      langBtn.textContent = currentLang === "zh" ? "English" : "中文";
      permissionsButton.textContent = t("permissions");
      if (openSourceTitle) openSourceTitle.textContent = t("openSourceTitle");
      if (openSourceCopy) openSourceCopy.textContent = t("openSourceCopy");
      document.querySelector("h1").textContent = t("title");
      refreshButton.textContent = t("btnRefresh");
      txtHome.textContent = t("labelHome");
      txtProbe.textContent = t("labelProbe");
      if (txtSecCap) txtSecCap.textContent = t("secCapabilities");
      if (txtSecIssue) txtSecIssue.textContent = t("secIssues");
      searchInput.placeholder = t("searchPlaceholder");
      
      if (thName) thName.textContent = t("thName");
      if (thType) thType.textContent = t("thType");
      if (thHealth) thHealth.textContent = t("thHealth");
      if (thRisk) thRisk.textContent = t("thRisk");
      if (thDesc) thDesc.textContent = t("thDesc");
      if (thActions) thActions.textContent = t("thActions");
      if (txtSecInstalled) txtSecInstalled.textContent = t("secInstalled");
      installedSearchInput.placeholder = t("installedSearchPlaceholder");
      installedRefreshButton.textContent = t("installedRefresh");
      if (installedDiscoveryTitle) installedDiscoveryTitle.textContent = t("installedDiscoveryTitle");
      if (installedDiscoveryCopy) installedDiscoveryCopy.textContent = t("installedDiscoveryCopy");
      if (txtSecTrash) txtSecTrash.textContent = t("secTrash");
      if (trashRefreshButton) trashRefreshButton.textContent = t("trashRefresh");
      if (trashDiscoveryTitle) trashDiscoveryTitle.textContent = t("trashDiscoveryTitle");
      if (trashDiscoveryCopy) trashDiscoveryCopy.textContent = t("trashDiscoveryCopy");
      if (txtSecMarket) txtSecMarket.textContent = t("secMarket");
      if (marketSearchInput) marketSearchInput.placeholder = t("marketSearchPlaceholder");
      if (marketRefreshButton) marketRefreshButton.textContent = t("marketRefresh");
      if (marketDiscoveryTitle) marketDiscoveryTitle.textContent = t("marketDiscoveryTitle");
      if (marketDiscoveryCopy) marketDiscoveryCopy.textContent = t("marketDiscoveryCopy");
      if (marketShowNewButton) marketShowNewButton.textContent = t("marketShowNew");
      if (marketMarkSeenButton) marketMarkSeenButton.textContent = t("marketMarkSeen");
      if (githubSourceInput) githubSourceInput.placeholder = t("marketGitHubPlaceholder");
      if (githubInstallButton) githubInstallButton.textContent = t("marketGitHubInstall");
      if (txtSecCli) txtSecCli.textContent = t("secCli");
      if (cliSearchInput) cliSearchInput.placeholder = t("cliSearchPlaceholder");
      if (cliRefreshButton) cliRefreshButton.textContent = t("cliRefresh");
      if (cliDiscoveryTitle) cliDiscoveryTitle.textContent = t("cliDiscoveryTitle");
      if (cliDiscoveryCopy) cliDiscoveryCopy.textContent = t("cliDiscoveryCopy");
      if (mcpInstallNameInput) mcpInstallNameInput.placeholder = t("mcpInstallName");
      if (mcpInstallCommandInput) mcpInstallCommandInput.placeholder = t("mcpInstallCommand");
      if (mcpInstallButton) mcpInstallButton.textContent = t("mcpInstall");
      if (mcpToolsRefreshBtn) mcpToolsRefreshBtn.textContent = t("cliRefresh");
      onboardingTitle.textContent = t("onboardingTitle");
      onboardingCopy.textContent = t("onboardingCopy");
      permScanTitle.textContent = t("permScanTitle");
      permScanCopy.textContent = t("permScanCopy");
      permMarketTitle.textContent = t("permMarketTitle");
      permMarketCopy.textContent = t("permMarketCopy");
      permInstallTitle.textContent = t("permInstallTitle");
      permInstallCopy.textContent = t("permInstallCopy");
      permRemoveTitle.textContent = t("permRemoveTitle");
      permRemoveCopy.textContent = t("permRemoveCopy");
      onboardingReadOnly.textContent = t("startReadOnly");
      onboardingSave.textContent = t("continue");
      
      // Update new nav text elements dynamically
      const navCapText = document.getElementById("txt-nav-capabilities");
      if (navCapText) navCapText.textContent = t("secCapabilities");
      const navInstalledText = document.getElementById("txt-nav-installed");
      if (navInstalledText) navInstalledText.textContent = t("secInstalled");
      const navTrashText = document.getElementById("txt-nav-trash");
      if (navTrashText) navTrashText.textContent = t("secTrash");
      const navMarketText = document.getElementById("txt-nav-market");
      if (navMarketText) navMarketText.textContent = t("secMarket");
      const navCliText = document.getElementById("txt-nav-cli");
      if (navCliText) navCliText.textContent = t("secCli");
      const navIssuesText = document.getElementById("txt-nav-issues");
      if (navIssuesText) navIssuesText.textContent = t("secIssues");
      
      const navHistoryText = document.getElementById("txt-nav-history");
      if (navHistoryText) navHistoryText.textContent = t("navHistory");
      const navMcpToolsText = document.getElementById("txt-nav-mcp-tools");
      if (navMcpToolsText) navMcpToolsText.textContent = t("navMcpTools");
      
      const txtSecHistory = document.getElementById("txt-sec-history");
      if (txtSecHistory) txtSecHistory.textContent = t("secHistory");
      const txtSecMcpTools = document.getElementById("txt-sec-mcp-tools");
      if (txtSecMcpTools) txtSecMcpTools.textContent = t("secMcpTools");

      // Update options
      updateSelectOptions(filterType, {
        "all": t("filterAllTypes"),
        "skill": t("typeSkill"),
        "mcp_server": t("typeMcpServer"),
        "plugin": t("typePlugin"),
        "command": t("typeCommand"),
        "hook": t("typeHook"),
        "agent": t("typeAgent")
      });
      updateSelectOptions(filterHealth, {
        "all": t("filterAllHealth"),
        "ok": t("healthOk"),
        "warning": t("healthWarning"),
        "broken": t("healthBroken"),
        "unknown": t("healthUnknown")
      });
      updateSelectOptions(filterRisk, {
        "all": t("filterAllRisk"),
        "low": t("riskLow"),
        "medium": t("riskMedium"),
        "high": t("riskHigh"),
        "critical": t("riskCritical")
      });
      updateSelectOptions(installedViewSelect, {
        "all": t("installedViewAll"),
        "skill": t("installedViewSkills"),
        "mcp_server": t("installedViewMcp"),
        "cli": t("installedViewCli")
      });
      updateSelectOptions(marketTarget, {
        "codex": t("marketTargetCodex"),
        "claude": t("marketTargetClaude"),
        "project": t("marketTargetProject")
      });
      updateSelectOptions(marketViewSelect, {
        "all": t("marketViewAll"),
        "new": t("marketViewNew"),
        "uninstalled": t("marketViewUninstalled"),
        "installable": t("marketViewInstallable"),
        "directories": t("marketViewDirectories"),
        "installed": t("marketViewInstalled")
      });
      updateSelectOptions(cliViewSelect, {
        "all": t("cliViewAll"),
        "installed": t("cliViewInstalled"),
        "uninstalled": t("cliViewUninstalled"),
        "agent": t("cliViewAgent"),
        "toolchain": t("cliViewToolchain")
      });
      if (mcpInstallTargetSelect) {
        updateSelectOptions(mcpInstallTargetSelect, {
          "project": t("mcpInstallTargetProject"),
          "cursor": t("mcpInstallTargetCursor"),
          "claude": t("mcpInstallTargetClaude")
        });
      }
      renderRiskMethodology();
    }

    function updateSelectOptions(selectEl, translations) {
      const selectedValue = selectEl.value;
      Array.from(selectEl.options).forEach(opt => {
        if (translations[opt.value]) {
          opt.textContent = translations[opt.value];
        }
      });
    }

    function loadPermissions() {
      try {
        const saved = JSON.parse(localStorage.getItem("skillopsPermissions") || "{}");
        return {
          onboarded: Boolean(saved.onboarded),
          install: Boolean(saved.install),
          remove: Boolean(saved.remove)
        };
      } catch {
        return { onboarded: false, install: false, remove: false };
      }
    }

    function loadSeenMarketIds() {
      try {
        const parsed = JSON.parse(localStorage.getItem(MARKET_SEEN_KEY) || "[]");
        return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
      } catch {
        return new Set();
      }
    }

    function getNewMarketIds(skills) {
      return new Set(skills.filter((skill) => !skill.installed && !seenMarketIds.has(skill.id)).map((skill) => skill.id));
    }

    function savePermissions(next) {
      permissions = {
        onboarded: true,
        install: Boolean(next.install),
        remove: Boolean(next.remove)
      };
      localStorage.setItem("skillopsPermissions", JSON.stringify(permissions));
      onboardingEl.classList.remove("visible");
      render();
      renderInstalled();
      renderTrash();
      renderMarket();
      renderCliTools();
    }

    function showOnboarding(isFirstRun) {
      permInstallInput.checked = permissions.install;
      permRemoveInput.checked = permissions.remove;
      onboardingEl.classList.add("visible");
    }

    function openDialog(message, options = {}) {
      if (!dialogModal || !dialogTitle || !dialogMessage || !dialogCancel || !dialogOk) {
        return Promise.resolve(true);
      }
      dialogTitle.textContent = options.title || t(options.notice ? "dialogNotice" : "dialogConfirm");
      dialogMessage.textContent = message;
      dialogCancel.textContent = t("dialogCancel");
      dialogOk.textContent = options.okText || t("dialogOk");
      dialogCancel.style.display = options.notice ? "none" : "";
      dialogOk.className = options.danger ? "btn-danger" : "btn-primary";
      dialogModal.classList.add("visible");
      return new Promise((resolve) => {
        dialogResolver = resolve;
      });
    }

    function closeDialog(result) {
      if (dialogModal) dialogModal.classList.remove("visible");
      const resolve = dialogResolver;
      dialogResolver = null;
      if (resolve) resolve(Boolean(result));
    }

    async function askConfirm(message, options = {}) {
      return openDialog(message, options);
    }

    async function showNotice(message) {
      await openDialog(message, { notice: true });
    }

    function requestPermission(kind) {
      const message = kind === "install" ? t("permissionDeniedInstall") : t("permissionDeniedRemove");
      statusDotEl.className = "pulse-dot failed";
      statusTextEl.textContent = message;
      showOnboarding(false);
    }

    function debounce(fn, delay) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      };
    }

    function escapeText(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char]));
    }

    function jsSingleQuote(value) {
      return String(value ?? "")
        .replace(/\\\\/g, "\\\\\\\\")
        .replace(/'/g, "\\\\'")
        .replace(/\\n/g, "\\\\n")
        .replace(/\\r/g, "\\\\r");
    }

    function registerQuickCommand(command) {
      const id = "cmd-" + quickCommandRegistry.size + "-" + Math.random().toString(36).slice(2, 8);
      quickCommandRegistry.set(id, command);
      return id;
    }

    function renderQuickCommands(commands, maxCount = 5) {
      if (!commands || commands.length === 0) return "";
      return '<div class="quick-command-list"><div class="issue-meta-title">' + escapeText(t("marketQuickCommands")) + '</div>' +
        commands.slice(0, maxCount).map((item) => {
          const id = registerQuickCommand(item.command);
          return '<div class="quick-command-row" title="' + escapeText(item.description || "") + '">' +
            '<div class="quick-command">' +
              '<div class="quick-command-label">' + escapeText(item.label || t("cliCommand")) + '</div>' +
              escapeText(item.command) +
            '</div>' +
            '<button class="btn-secondary quick-command-copy" onclick="copyQuickCommand(' + "'" + id + "'" + ')">' + escapeText(t("copyCommand")) + '</button>' +
          '</div>';
        }).join("") +
      '</div>';
    }

    async function copyQuickCommand(commandId) {
      const command = quickCommandRegistry.get(commandId);
      if (!command) return;
      try {
        try {
          if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
          await navigator.clipboard.writeText(command);
        } catch {
          const textarea = document.createElement("textarea");
          textarea.value = command;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand("copy");
          textarea.remove();
        }
        statusDotEl.className = "pulse-dot";
        statusTextEl.textContent = t("copiedCommand");
      } catch (error) {
        statusDotEl.className = "pulse-dot failed";
        statusTextEl.textContent = error.message || String(error);
      }
    }

    function getHealthClass(health) {
      return health === "ok" ? "ok" : health === "warning" ? "warning" : health === "broken" ? "broken" : "unknown";
    }

    function getRiskClass(risk) {
      return risk === "low" ? "low" : risk === "medium" ? "medium" : (risk === "high" || risk === "critical") ? "broken" : "unknown";
    }

    function getTranslateTerm(type, val) {
      if (!val) return "";
      const strVal = String(val);
      if (type === "type") {
        return t("type" + strVal.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')) || strVal;
      }
      if (type === "health") {
        return t("health" + strVal.charAt(0).toUpperCase() + strVal.slice(1));
      }
      if (type === "risk") {
        return t("risk" + strVal.charAt(0).toUpperCase() + strVal.slice(1));
      }
      return strVal;
    }

    function pill(type, value) {
      const displayVal = getTranslateTerm(type, value);
      const cssClass = type === "type" ? value : (type === "health" ? getHealthClass(value) : getRiskClass(value));
      return '<span class="pill ' + cssClass + '">' + escapeText(displayVal) + '</span>';
    }

    function metric(labelKey, value, cssClass = "", active = false, onClickStr = "") {
      const activeClass = active ? " active" : "";
      const onclickAttr = onClickStr ? ' onclick="' + onClickStr + '"' : '';
      const title = t("metricHint" + labelKey.replace("metric", ""));
      return '<div class="metric ' + cssClass + activeClass + '" role="button" tabindex="0" title="' + escapeText(title) + '"' + onclickAttr + ' onkeydown="if(event.key===\\'Enter\\'||event.key===\\' \\'){event.preventDefault(); this.click();}"><span>' + escapeText(t(labelKey)) + '</span><strong>' + escapeText(value) + ' ' + t("totalCount") + '</strong></div>';
    }

    function renderRiskMethodology() {
      riskMethodologyEl.innerHTML =
        '<h3>' + escapeText(t("riskMethodTitle")) + '</h3>' +
        '<div class="methodology-grid">' +
          '<div class="methodology-item"><strong>' + escapeText(t("riskMethodSeverityTitle")) + '</strong>' + escapeText(t("riskMethodSeverityCopy")) + '</div>' +
          '<div class="methodology-item"><strong>' + escapeText(t("riskMethodHealthTitle")) + '</strong>' + escapeText(t("riskMethodHealthCopy")) + '</div>' +
          '<div class="methodology-item"><strong>' + escapeText(t("riskMethodRiskTitle")) + '</strong>' + escapeText(t("riskMethodRiskCopy")) + '</div>' +
          '<div class="methodology-item"><strong>' + escapeText(t("riskMethodScopeTitle")) + '</strong>' + escapeText(t("riskMethodScopeCopy")) + '</div>' +
        '</div>';
    }

    async function load() {
      refreshButton.disabled = true;
      statusDotEl.className = "pulse-dot scanning";
      statusTextEl.textContent = t("statusScanning");

      const params = new URLSearchParams({
        home: homeInput.checked ? "true" : "false",
        probeMcp: probeInput.checked ? "true" : "false"
      });

      try {
        const response = await fetch("/api/scan?" + params.toString());
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        
        capabilityData = data.capabilities || [];
        summaryData = data.summary || {};
        
        statusDotEl.className = "pulse-dot";
        statusTextEl.textContent = t("statusLastScan") + new Date().toLocaleTimeString();
        render();
        loadInstalled();
        loadTrash();
        loadMarket();
        loadCliTools();
        loadMcpTools();
        loadHistory();
      } catch (error) {
        statusDotEl.className = "pulse-dot failed";
        statusTextEl.textContent = t("statusFailed");
        issuesEl.innerHTML = '<div class="issue"><div class="issue-header"><div class="issue-title">' + escapeText(error.message || error) + '</div></div></div>';
      } finally {
        refreshButton.disabled = false;
      }
    }

    async function loadInstalled() {
      const params = new URLSearchParams({
        q: installedSearchInput.value.trim(),
        home: homeInput.checked ? "true" : "false",
        probeMcp: probeInput.checked ? "true" : "false"
      });

      installedRefreshButton.disabled = true;
      try {
        const response = await fetch("/api/installed?" + params.toString());
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        installedData = data.items || [];
        installedSummary = data.summary || {};
        renderInstalled();
      } catch (error) {
        installedListEl.innerHTML = '<div class="issue"><div class="issue-title">' + escapeText(error.message || error) + '</div></div>';
      } finally {
        installedRefreshButton.disabled = false;
      }
    }

    async function loadTrash() {
      trashRefreshButton.disabled = true;
      try {
        const response = await fetch("/api/trash");
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        trashData = data.items || [];
        renderTrash();
      } catch (error) {
        trashListEl.innerHTML = '<div class="issue"><div class="issue-title">' + escapeText(error.message || error) + '</div></div>';
      } finally {
        trashRefreshButton.disabled = false;
      }
    }

    async function loadMarket() {
      const params = new URLSearchParams({
        q: marketSearchInput.value.trim()
      });

      marketLoading = true;
      marketRefreshButton.disabled = true;
      renderMarket();
      try {
        const response = await fetch("/api/market?" + params.toString());
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        marketData = data.skills || [];
      } catch (error) {
        marketListEl.innerHTML = '<div class="issue"><div class="issue-title">' + escapeText(error.message || error) + '</div></div>';
      } finally {
        marketLoading = false;
        marketRefreshButton.disabled = false;
        renderMarket();
      }
    }

    async function loadCliTools() {
      const params = new URLSearchParams({
        q: cliSearchInput.value.trim()
      });

      cliRefreshButton.disabled = true;
      try {
        const response = await fetch("/api/cli-tools?" + params.toString());
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        cliData = data.tools || [];
        renderCliTools();
      } catch (error) {
        cliListEl.innerHTML = '<div class="issue"><div class="issue-title">' + escapeText(error.message || error) + '</div></div>';
      } finally {
        cliRefreshButton.disabled = false;
      }
    }

    async function loadHistory() {
      try {
        const response = await fetch("/api/history?limit=100");
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        historyData = data.entries || [];
        renderHistory();
      } catch (error) {
        if (historyListEl) {
          historyListEl.innerHTML = '<div class="issue"><div class="issue-title">' + escapeText(error.message || error) + '</div></div>';
        }
      }
    }

    async function loadMcpTools() {
      if (mcpToolsRefreshBtn) mcpToolsRefreshBtn.disabled = true;
      try {
        const response = await fetch("/api/mcp/tools");
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        mcpToolsData = data.servers || [];
        renderMcpTools();
      } catch (error) {
        if (mcpToolsListEl) {
          mcpToolsListEl.innerHTML = '<div class="issue"><div class="issue-title">' + escapeText(error.message || error) + '</div></div>';
        }
      } finally {
        if (mcpToolsRefreshBtn) mcpToolsRefreshBtn.disabled = false;
      }
    }

    async function installMarketSkill(skillId) {
      if (!permissions.install) {
        requestPermission("install");
        return;
      }
      const marketSkill = marketData.find((skill) => skill.id === skillId);
      if (!(await askConfirm(t("installConfirm")))) return;
      await runAction(async () => {
        const response = await fetch("/api/market/install", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            skillId,
            source: marketSkill?.sourceUrl?.includes("github.com") ? marketSkill.sourceUrl : undefined,
            target: marketTarget.value,
            confirm: true
          })
        });
        if (!response.ok) throw new Error(await response.text());
      });
    }

    async function installGitHub() {
      const source = githubSourceInput.value.trim();
      if (!source) return;
      if (!permissions.install) {
        requestPermission("install");
        return;
      }
      if (!(await askConfirm(t("installConfirm")))) return;
      await runAction(async () => {
        const response = await fetch("/api/market/install", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source, target: marketTarget.value, confirm: true })
        });
        if (!response.ok) throw new Error(await response.text());
        githubSourceInput.value = "";
      });
    }

    async function installMcpFromForm() {
      if (!permissions.install) {
        requestPermission("install");
        return;
      }
      const name = (mcpInstallNameInput?.value || "").trim();
      const raw = (mcpInstallCommandInput?.value || "").trim();
      if (!name || !raw) return;
      if (!(await askConfirm(t("mcpInstallConfirm")))) return;

      const body = {
        name,
        target: mcpInstallTargetSelect?.value || "project",
        confirm: true
      };
      const rawLower = raw.toLowerCase();
      if (rawLower.startsWith("http://") || rawLower.startsWith("https://")) {
        body.url = raw;
      } else {
        const parts = splitCommandLine(raw);
        body.command = parts[0] || raw;
        body.args = parts.slice(1);
      }

      await runAction(async () => {
        const response = await fetch("/api/mcp/install", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(await response.text());
        if (mcpInstallNameInput) mcpInstallNameInput.value = "";
        if (mcpInstallCommandInput) mcpInstallCommandInput.value = "";
        await loadMcpTools();
      });
    }

    async function removeMcpCapability(capabilityId) {
      if (!permissions.remove) {
        requestPermission("remove");
        return;
      }
      if (!(await askConfirm(t("mcpRemoveConfirm"), { danger: true }))) return;
      await runAction(async () => {
        const response = await fetch("/api/mcp/remove", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ capabilityId, confirm: true })
        });
        if (!response.ok) throw new Error(await response.text());
        selectedMcpToolId = null;
        await loadMcpTools();
        await loadInstalled();
      });
    }

    async function runCliAction(toolId, action) {
      const needsInstall = action === "install";
      if (needsInstall && !permissions.install) {
        requestPermission("install");
        return;
      }
      if (!needsInstall && !permissions.remove) {
        requestPermission("remove");
        return;
      }
      if (!(await askConfirm(t(needsInstall ? "cliInstallConfirm" : "cliRemoveConfirm"), { danger: !needsInstall }))) return;
      await runAction(async () => {
        const response = await fetch("/api/cli/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ toolId, action: needsInstall ? "install" : "uninstall", confirm: true })
        });
        if (!response.ok) throw new Error(await response.text());
        await loadCliTools();
        await loadInstalled();
      });
    }

    function splitCommandLine(input) {
      const parts = [];
      let current = "";
      let quote = "";
      let escaped = false;
      for (const char of input) {
        if (escaped) {
          current += char;
          escaped = false;
          continue;
        }
        if (char === "\\\\") {
          escaped = true;
          continue;
        }
        if (quote) {
          if (char === quote) quote = "";
          else current += char;
          continue;
        }
        if (char === "'" || char === '"') {
          quote = char;
          continue;
        }
        if (/\\s/.test(char)) {
          if (current) {
            parts.push(current);
            current = "";
          }
          continue;
        }
        current += char;
      }
      if (current) parts.push(current);
      return parts;
    }

    async function removeCapability(capabilityId, mode = "trash", kind = "skill") {
      if (kind === "mcp_server") {
        await removeMcpCapability(capabilityId);
        return;
      }
      if (kind === "cli") {
        await runCliAction(capabilityId, "uninstall");
        return;
      }
      if (!permissions.remove) {
        requestPermission("remove");
        return;
      }
      if (!(await askConfirm(t(mode === "delete" ? "deleteConfirm" : "removeConfirm"), { danger: mode === "delete" }))) return;
      await runAction(async () => {
        const response = await fetch("/api/capability/remove", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ capabilityId, mode, confirm: true })
        });
        if (!response.ok) throw new Error(await response.text());
      });
      if (mode === "trash") {
        switchTab("trash");
      }
    }

    async function restoreTrashEntry(trashId) {
      if (!permissions.remove) {
        requestPermission("remove");
        return;
      }
      if (!(await askConfirm(t("trashRestoreConfirm")))) return;
      await runAction(async () => {
        const response = await fetch("/api/trash/restore", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trashId, confirm: true })
        });
        if (!response.ok) throw new Error(await response.text());
      });
    }

    async function deleteTrashEntry(trashId) {
      if (!permissions.remove) {
        requestPermission("remove");
        return;
      }
      if (!(await askConfirm(t("trashDeleteConfirm"), { danger: true }))) return;
      await runAction(async () => {
        const response = await fetch("/api/trash/delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trashId, confirm: true })
        });
        if (!response.ok) throw new Error(await response.text());
      });
    }

    async function runAction(action) {
      refreshButton.disabled = true;
      installedRefreshButton.disabled = true;
      trashRefreshButton.disabled = true;
      marketRefreshButton.disabled = true;
      githubInstallButton.disabled = true;
      cliRefreshButton.disabled = true;
      statusDotEl.className = "pulse-dot scanning";
      statusTextEl.textContent = t("statusScanning");
      try {
        await action();
        statusDotEl.className = "pulse-dot";
        statusTextEl.textContent = t("actionDone");
        await load();
      } catch (error) {
        statusDotEl.className = "pulse-dot failed";
        statusTextEl.textContent = error.message || String(error);
      } finally {
        refreshButton.disabled = false;
        installedRefreshButton.disabled = false;
        trashRefreshButton.disabled = false;
        marketRefreshButton.disabled = false;
        githubInstallButton.disabled = false;
        cliRefreshButton.disabled = false;
      }
    }

    function isDangerousPermission(perm) {
      const dangerous = ["shell", "local-files-write", "cloud-resource-write", "payment-or-trade"];
      return dangerous.includes(perm);
    }

    function render() {
      if (githubInstallButton) {
        githubInstallButton.title = permissions.install ? "" : t("permissionDeniedInstall");
      }
      
      // 1. Filter Capabilities Client-side
      const search = searchInput.value.toLowerCase().trim();
      const typeVal = filterType.value;
      const healthVal = filterHealth.value;
      const riskVal = filterRisk.value;

      const filtered = capabilityData.filter(cap => {
        // Search filter
        if (search) {
          const name = (cap.name || "").toLowerCase();
          const desc = (cap.description || "").toLowerCase();
          const path = (cap.path || "").toLowerCase();
          const source = (cap.source || "").toLowerCase();
          const cPath = (cap.configPath || "").toLowerCase();
          
          if (!name.includes(search) && !desc.includes(search) && !path.includes(search) && !source.includes(search) && !cPath.includes(search)) {
            return false;
          }
        }
        // Type filter
        if (typeVal !== "all" && cap.type !== typeVal) return false;
        // Health filter
        if (healthVal !== "all" && cap.health !== healthVal) return false;
        // Risk filter
        if (riskVal !== "all" && cap.risk !== riskVal) return false;
        // Issues filter
        if (filterIssuesActive && (!cap.issues || cap.issues.length === 0)) return false;

        return true;
      });

      // Update counters
      badgeCapCount.textContent = filtered.length;
      if (badgeCapCountSec) badgeCapCountSec.textContent = filtered.length;

      // 2. Render Metrics (based on total scanned data)
      const isAllReset = typeVal === "all" && healthVal === "all" && riskVal === "all" && !search && !filterIssuesActive;
      summaryEl.innerHTML = [
        metric("metricTotal", summaryData.total || 0, "total", isAllReset, "toggleMetricFilter('reset')"),
        metric("metricSkills", summaryData.byType?.skill || 0, "skills", typeVal === "skill", "toggleMetricFilter('type', 'skill')"),
        metric("metricMcps", summaryData.byType?.mcp_server || 0, "mcps", typeVal === "mcp_server", "toggleMetricFilter('type', 'mcp_server')"),
        metric("metricWarnings", summaryData.byHealth?.warning || 0, "warnings", healthVal === "warning", "toggleMetricFilter('health', 'warning')"),
        metric("metricIssues", summaryData.issueCount || 0, "issues", filterIssuesActive, "toggleMetricFilter('issues')")
      ].join("");

      // 3. Select active capability
      let activeCap = filtered.find(c => c.id === selectedCapabilityId);
      if (!activeCap && filtered.length > 0) {
        activeCap = filtered[0];
        selectedCapabilityId = activeCap.id;
      } else if (filtered.length === 0) {
        selectedCapabilityId = null;
        activeCap = null;
      }

      // Render Capabilities Card List
      if (filtered.length === 0) {
        capabilitiesEl.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 30px 10px;">' + escapeText(t("capabilitiesNoMatch")) + '</div>';
      } else {
        capabilitiesEl.innerHTML = filtered.map((cap) => {
          const isActive = cap.id === selectedCapabilityId ? "active" : "";
          
          return '<div class="cap-card ' + isActive + '" onclick="selectCapability(' + "'" + cap.id + "'" + ')">' +
            '<div class="cap-card-header">' +
              '<span class="cap-card-title">' + escapeText(cap.name) + '</span>' +
              '<span class="cap-card-source">' + escapeText(cap.source) + '</span>' +
            '</div>' +
            '<div class="cap-card-desc">' + escapeText(cap.description || "") + '</div>' +
            '<div class="cap-card-badges">' +
              pill("type", cap.type) +
              pill("health", cap.health) +
              pill("risk", cap.risk) +
            '</div>' +
          '</div>';
        }).join("");
      }

      // Render Active Capability Details in Inspector
      const inspectorEl = document.getElementById("capability-inspector");
      if (!activeCap) {
        inspectorEl.innerHTML = '<div class="inspector-welcome">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>' +
          '<div>' + (currentLang === "zh" ? "选择左侧的代理能力以查看详细分析与缺陷报告" : "Select a capability on the left to view details and issue analysis.") + '</div>' +
        '</div>';
      } else {
        const canRemove =
          (activeCap.type === "skill" && Boolean(activeCap.path)) ||
          (activeCap.type === "mcp_server" && Boolean(activeCap.configPath));
        
        // Generate permission tags
        const permissionsHtml = (activeCap.permissions && activeCap.permissions.length > 0)
          ? activeCap.permissions.map(perm => {
              const isDang = isDangerousPermission(perm);
              return '<span class="perm-tag ' + (isDang ? 'dangerous' : '') + '">' + escapeText(perm) + '</span>';
            }).join("")
          : '<span class="perm-tag">' + t("detailsNoPerms") + '</span>';

        // Languages tag
        const langText = (activeCap.language && activeCap.language.length > 0) ? activeCap.language.join(", ") : "-";

        // Remove/delete buttons
        const removeLabel = activeCap.type === "mcp_server" ? t("mcpRemove") : t("removeSkill");
        const removeKind = activeCap.type === "mcp_server" ? "mcp_server" : "skill";
        const removeTitle = permissions.remove ? "" : ' title="' + escapeText(t("permissionDeniedRemove")) + '"';
        const removeButtonHtml = canRemove
          ? '<button class="btn-danger"' + removeTitle + ' data-skillops-action="remove-capability" data-id="' + escapeText(activeCap.id) + '" data-mode="trash" data-kind="' + escapeText(removeKind) + '">' + removeLabel + '</button>'
          : '';
        const deleteButtonHtml = activeCap.type === "skill" && canRemove
          ? '<button class="btn-danger"' + removeTitle + ' data-skillops-action="remove-capability" data-id="' + escapeText(activeCap.id) + '" data-mode="delete" data-kind="skill">' + t("deleteSkill") + '</button>'
          : '';

        // Specific issues for this capability
        const capIssuesHtml = (activeCap.issues && activeCap.issues.length > 0)
          ? activeCap.issues.map(issue => 
              '<div class="issue" style="margin-top: 10px; border: 1px solid var(--line); border-radius: 8px;">' +
                '<div class="issue-header">' +
                  '<div class="issue-title-block">' +
                    '<span class="issue-sev ' + issue.severity + '">' + escapeText(issue.severity) + '</span>' +
                    '<span class="issue-title">' + escapeText(issue.title) + '</span>' +
                  '</div>' +
                '</div>' +
                '<div class="issue-content">' +
                  (issue.evidence ? '<div><div class="issue-meta-title">' + t("issueEvidence") + '</div><div class="issue-code">' + escapeText(issue.evidence) + '</div></div>' : '') +
                  (issue.suggestion ? '<div><div class="issue-meta-title">' + t("issueSuggestion") + '</div><p>' + escapeText(issue.suggestion) + '</p></div>' : '') +
                '</div>' +
              '</div>'
            ).join("")
          : '<div class="no-issue-state" style="padding: 20px 0;">' + t("noIssues") + '</div>';

        inspectorEl.innerHTML = 
          '<div class="inspector-header">' +
            '<div class="inspector-title-block">' +
              '<h2>' + escapeText(activeCap.name) + '</h2>' +
              '<div class="inspector-source">' + escapeText(activeCap.source) + '</div>' +
            '</div>' +
            '<div class="inspector-actions-row">' +
              removeButtonHtml +
              deleteButtonHtml +
            '</div>' +
          '</div>' +
          '<div class="inspector-grid">' +
            (activeCap.path ? '<div class="inspector-card"><span class="inspector-label">' + t("detailsPath") + '</span><span class="inspector-value">' + escapeText(activeCap.path) + '</span></div>' : '') +
            (activeCap.configPath ? '<div class="inspector-card"><span class="inspector-label">' + t("detailsConfig") + '</span><span class="inspector-value">' + escapeText(activeCap.configPath) + '</span></div>' : '') +
            '<div class="inspector-card"><span class="inspector-label">' + t("detailsLang") + '</span><span class="inspector-value">' + escapeText(langText) + '</span></div>' +
            '<div class="inspector-card"><span class="inspector-label">' + t("detailsPerms") + '</span><div class="tag-container">' + permissionsHtml + '</div></div>' +
          '</div>' +
          '<div class="inspector-section-title">' + t("secIssues") + ' (' + activeCap.issues.length + ')</div>' +
          '<div style="display:flex; flex-direction:column; gap:10px;">' + capIssuesHtml + '</div>';
      }

      // 4. Render General Issues Feed (filtered to show issues of current displayed capabilities)
      const issues = filtered.flatMap((cap) =>
        cap.issues.map((issue) => ({ cap, issue }))
      );

      badgeIssueCount.textContent = issues.length;
      const badgeIssueCountNav = document.getElementById("badge-issue-count-nav");
      if (badgeIssueCountNav) badgeIssueCountNav.textContent = issues.length;

      if (issues.length === 0) {
        issuesEl.innerHTML = '<div class="no-issue-state">' + t("noIssues") + '</div>';
      } else {
        issuesEl.innerHTML = issues.slice(0, 80).map(({ cap, issue }) => (
          '<div class="issue">' +
            '<div class="issue-header">' +
              '<div class="issue-title-block">' +
                '<span class="issue-sev ' + issue.severity + '">' + escapeText(issue.severity) + '</span>' +
                '<span class="issue-title">' + escapeText(cap.name + ": " + issue.title) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="issue-content">' +
              (issue.evidence ? '<div><div class="issue-meta-title">' + t("issueEvidence") + '</div><div class="issue-code">' + escapeText(issue.evidence) + '</div></div>' : '') +
              (issue.suggestion ? '<div><div class="issue-meta-title">' + t("issueSuggestion") + '</div><p>' + escapeText(issue.suggestion) + '</p></div>' : '') +
            '</div>' +
          '</div>'
        )).join("");
      }
    }
    function renderInstalled() {
      const view = installedViewSelect.value;
      const filteredInstalled = installedData
        .filter((item) => view === "all" || item.kind === view)
        .sort((a, b) => {
          const kindOrder = { skill: 0, mcp_server: 1, cli: 2 };
          const kindDiff = (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9);
          if (kindDiff !== 0) return kindDiff;
          return a.name.localeCompare(b.name);
        });

      badgeInstalledCount.textContent = filteredInstalled.length;
      if (badgeInstalledCountSec) badgeInstalledCountSec.textContent = filteredInstalled.length;

      // Select active item
      let activeItem = filteredInstalled.find(c => c.id === selectedInstalledId);
      if (!activeItem && filteredInstalled.length > 0) {
        activeItem = filteredInstalled[0];
        selectedInstalledId = activeItem.id;
      } else if (filteredInstalled.length === 0) {
        selectedInstalledId = null;
        activeItem = null;
      }

      // Update batch bar
      if (installedBatchBar && installedBatchCount) {
        if (batchInstalledIds.size > 0) {
          installedBatchBar.style.display = "flex";
          installedBatchCount.textContent = batchInstalledIds.size + " selected";
        } else {
          installedBatchBar.style.display = "none";
        }
      }

      // Render left list scroll
      if (filteredInstalled.length === 0) {
        installedListEl.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 30px 10px;">' + t("installedNoMatches") + '</div>';
      } else {
        installedListEl.innerHTML = filteredInstalled.map((item) => {
          const isActive = item.id === selectedInstalledId ? "active" : "";
          const isChecked = batchInstalledIds.has(item.id) ? "checked" : "";
          return '<div class="list-card ' + isActive + '" onclick="selectInstalled(' + "'" + item.id + "'" + ')">' +
            '<div class="list-card-header">' +
              '<div style="display:flex; align-items:center; gap:8px;">' +
                '<input type="checkbox" ' + isChecked + ' onclick="toggleBatchInstalled(' + "'" + item.id + "'" + ', event)">' +
                '<span class="list-card-title">' + escapeText(item.name) + '</span>' +
              '</div>' +
              '<span class="list-card-subtitle">' + escapeText(item.kind === "mcp_server" ? "MCP" : item.kind) + '</span>' +
            '</div>' +
            '<div class="list-card-desc">' + escapeText(item.description || "") + '</div>' +
            '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">' +
              pill("health", item.health) +
              pill("risk", item.risk) +
            '</div>' +
          '</div>';
        }).join("");
      }

      // Render right details inspector
      const inspectorEl = document.getElementById("installed-inspector");
      if (inspectorEl) {
        if (!activeItem) {
          inspectorEl.innerHTML = '<div class="inspector-welcome">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>' +
            '<strong>' + escapeText(t("installedDiscoveryTitle")) + '</strong>' +
            '<div>' + escapeText(t("installedDiscoveryCopy")) + '</div>' +
          '</div>';
        } else {
          const actionId = activeItem.kind === "cli" ? activeItem.id : (activeItem.capabilityId || activeItem.id);
          const canRemove =
            (activeItem.kind === "skill" && Boolean(activeItem.path)) ||
            (activeItem.kind === "mcp_server" && Boolean(activeItem.configPath) && Boolean(actionId)) ||
            (activeItem.kind === "cli" && Boolean(activeItem.uninstallCommand));
          const sourceLink = activeItem.sourceUrl
            ? '<a class="btn-secondary" href="' + escapeText(activeItem.sourceUrl) + '" target="_blank" rel="noopener noreferrer" style="text-decoration:none; display:inline-flex; align-items:center;">' + t("marketOpen") + '</a>'
            : '';
          const removeLabel = activeItem.kind === "mcp_server" ? t("mcpRemove") : activeItem.kind === "cli" ? t("cliRemove") : t("removeSkill");
          const removeTitle = permissions.remove ? "" : ' title="' + escapeText(t("permissionDeniedRemove")) + '"';
          const removeButtonHtml = canRemove
            ? '<button class="btn-danger"' + removeTitle + ' data-skillops-action="remove-capability" data-id="' + escapeText(actionId) + '" data-mode="trash" data-kind="' + escapeText(activeItem.kind) + '">' + removeLabel + '</button>'
            : '';
          const deleteButtonHtml = activeItem.kind === "skill" && canRemove
            ? '<button class="btn-danger"' + removeTitle + ' data-skillops-action="remove-capability" data-id="' + escapeText(actionId) + '" data-mode="delete" data-kind="skill">' + t("deleteSkill") + '</button>'
            : '';

          const locationHtml = [
            activeItem.path ? '<div class="inspector-card"><span class="inspector-label">' + t("detailsPath") + '</span><span class="inspector-value">' + escapeText(activeItem.path) + '</span></div>' : '',
            activeItem.configPath ? '<div class="inspector-card"><span class="inspector-label">' + t("detailsConfig") + '</span><span class="inspector-value">' + escapeText(activeItem.configPath) + '</span></div>' : '',
            activeItem.installedPath ? '<div class="inspector-card"><span class="inspector-label">' + t("cliPath") + '</span><span class="inspector-value">' + escapeText(activeItem.installedPath) + '</span></div>' : '',
            activeItem.command ? '<div class="inspector-card"><span class="inspector-label">' + t("installedCommand") + '</span><span class="inspector-value">' + escapeText(activeItem.command) + '</span></div>' : '',
            activeItem.version ? '<div class="inspector-card"><span class="inspector-label">' + t("cliVersion") + '</span><span class="inspector-value">' + escapeText(activeItem.version) + '</span></div>' : ''
          ].join("");

          const tagHtml = (activeItem.tags || []).map(tag => '<span class="perm-tag">' + escapeText(tag) + '</span>').join("");
          const languageHtml = (activeItem.languages || []).map(lang => '<span class="perm-tag">' + escapeText(lang) + '</span>').join("");
          const permissionHtml = (activeItem.permissions || []).map(perm => '<span class="perm-tag ' + (isDangerousPermission(perm) ? 'dangerous' : '') + '">' + escapeText(perm) + '</span>').join("");

          inspectorEl.innerHTML = 
            '<div class="inspector-header">' +
              '<div class="inspector-title-block">' +
                '<h2>' + escapeText(activeItem.name) + '</h2>' +
                '<div class="inspector-source">' + escapeText(activeItem.kind + " · " + activeItem.sourceName) + '</div>' +
              '</div>' +
              '<div class="inspector-actions-row">' +
                sourceLink +
                removeButtonHtml +
                deleteButtonHtml +
              '</div>' +
            '</div>' +
            '<div class="market-desc" style="font-size: 14.5px; line-height: 1.6;">' + escapeText(activeItem.description) + '</div>' +
            '<div class="market-usage"><strong>' + escapeText(t("marketUsage")) + ':</strong> ' + escapeText(activeItem.usage) + '</div>' +
            '<div class="inspector-grid">' +
              '<div class="inspector-card"><span class="inspector-label">' + t("installedFor") + '</span><span class="inspector-value">' + escapeText(activeItem.installedFor) + '</span></div>' +
              '<div class="inspector-card"><span class="inspector-label">' + t("installedHealth") + '</span><div class="tag-container">' + pill("health", activeItem.health) + '</div></div>' +
              '<div class="inspector-card"><span class="inspector-label">' + t("installedRisk") + '</span><div class="tag-container">' + pill("risk", activeItem.risk) + '</div></div>' +
              locationHtml +
            '</div>' +
            '<div class="inspector-section-title">' + escapeText(t("marketQuickCommands")) + '</div>' +
            renderQuickCommands(activeItem.quickCommands || [], 5) +
            '<div class="inspector-section-title">' + (currentLang === "zh" ? "分类与权限" : "Tags & Permissions") + '</div>' +
            '<div class="tag-container">' + tagHtml + languageHtml + permissionHtml + '</div>';
        }
      }
    }

    function renderTrash() {
      const count = trashData.length;
      badgeTrashCount.textContent = count;
      if (badgeTrashCountSec) badgeTrashCountSec.textContent = count;

      let activeItem = trashData.find(item => item.id === selectedTrashId);
      if (!activeItem && trashData.length > 0) {
        activeItem = trashData[0];
        selectedTrashId = activeItem.id;
      } else if (trashData.length === 0) {
        selectedTrashId = null;
        activeItem = null;
      }

      if (trashData.length === 0) {
        trashListEl.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 30px 10px;">' + escapeText(t("trashNoItems")) + '</div>';
      } else {
        trashListEl.innerHTML = trashData.map((item) => {
          const isActive = item.id === selectedTrashId ? "active" : "";
          const timeText = item.trashedAt ? new Date(item.trashedAt).toLocaleString() : "";
          return '<div class="list-card ' + isActive + '" onclick="selectTrash(' + "'" + jsSingleQuote(item.id) + "'" + ')">' +
            '<div class="list-card-header">' +
              '<span class="list-card-title">' + escapeText(item.name) + '</span>' +
              '<span class="list-card-subtitle">' + escapeText(timeText) + '</span>' +
            '</div>' +
            '<div class="list-card-desc">' + escapeText(item.originalPath || item.trashPath || "") + '</div>' +
            '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">' +
              (item.canRestore ? '<span class="pill ok">' + escapeText(t("trashRestore")) + '</span>' : '<span class="pill warning">' + escapeText(t("trashCannotRestore")) + '</span>') +
            '</div>' +
          '</div>';
        }).join("");
      }

      const inspectorEl = document.getElementById("trash-inspector");
      if (!inspectorEl) return;
      if (!activeItem) {
        inspectorEl.innerHTML = '<div class="inspector-welcome">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>' +
          '<strong>' + escapeText(t("trashDiscoveryTitle")) + '</strong>' +
          '<div>' + escapeText(t("trashDiscoveryCopy")) + '</div>' +
        '</div>';
        return;
      }

      const canRestore = activeItem.canRestore;
      const canDelete = true;
      const restoreTitle = activeItem.canRestore ? t("permissionDeniedRemove") : t("trashCannotRestore");
      const timeText = activeItem.trashedAt ? new Date(activeItem.trashedAt).toLocaleString() : "-";
      const restoreButtonHtml =
        '<button class="btn-primary" ' +
        (canRestore ? '' : 'disabled title="' + escapeText(restoreTitle) + '"') +
        ' data-skillops-action="restore-trash" data-id="' + escapeText(activeItem.id) + '">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: middle;"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>' +
        escapeText(t("trashRestore")) + '</button>';
      const deleteButtonHtml =
        '<button class="btn-danger" ' +
        (canDelete ? (permissions.remove ? '' : 'title="' + escapeText(t("permissionDeniedRemove")) + '"') : 'disabled') +
        ' data-skillops-action="delete-trash" data-id="' + escapeText(activeItem.id) + '">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: middle;"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>' +
        escapeText(t("trashDelete")) + '</button>';

      inspectorEl.innerHTML =
        '<div class="inspector-header" style="border-bottom: 1px solid var(--line); padding-bottom: 24px; margin-bottom: 24px;">' +
          '<div class="inspector-title-block">' +
            '<div style="display: flex; align-items: center; gap: 12px;">' +
              '<div style="background: rgba(255, 59, 48, 0.1); color: var(--bad); padding: 10px; border-radius: 12px;">' +
                '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
              '</div>' +
              '<div>' +
                '<h2 style="margin: 0; font-size: 22px;">' + escapeText(activeItem.name) + '</h2>' +
                '<div class="inspector-source" style="margin-top: 4px;">' + escapeText(t("secTrash")) + '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="inspector-actions-row" style="margin-top: 20px;">' +
            restoreButtonHtml +
            deleteButtonHtml +
          '</div>' +
        '</div>' +
        
        '<div style="background: rgba(255, 149, 0, 0.05); border: 1px solid rgba(255, 149, 0, 0.2); border-radius: 12px; padding: 16px; margin-bottom: 24px; color: var(--warn); display: flex; gap: 12px; align-items: flex-start;">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
          '<div>' +
            '<strong style="display: block; margin-bottom: 4px;">' + escapeText(t("trashDiscoveryTitle")) + '</strong>' +
            '<span style="font-size: 13.5px; opacity: 0.9;">' + escapeText(t("trashDiscoveryCopy")) + '</span>' +
          '</div>' +
        '</div>' +

        '<div class="inspector-grid" style="grid-template-columns: 1fr;">' +
          (activeItem.originalPath ? 
            '<div class="inspector-card" style="display: flex; flex-direction: column; gap: 8px;">' +
              '<span class="inspector-label">' + escapeText(t("trashOriginalPath")) + '</span>' +
              '<div style="font-family: JetBrains Mono, monospace; font-size: 13px; background: rgba(0,0,0,0.03); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line); word-break: break-all; color: var(--ink);">' + escapeText(activeItem.originalPath) + '</div>' +
            '</div>' 
          : '') +
          '<div class="inspector-card" style="display: flex; flex-direction: column; gap: 8px;">' +
            '<span class="inspector-label">' + escapeText(t("trashPath")) + '</span>' +
            '<div style="font-family: JetBrains Mono, monospace; font-size: 13px; background: rgba(0,0,0,0.03); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line); word-break: break-all; color: var(--ink);">' + escapeText(activeItem.trashPath) + '</div>' +
          '</div>' +
          '<div class="inspector-card" style="display: flex; flex-direction: column; gap: 8px;">' +
            '<span class="inspector-label">' + escapeText(t("trashTrashedAt")) + '</span>' +
            '<div style="font-size: 14.5px; color: var(--ink); font-weight: 500;">' + escapeText(timeText) + '</div>' +
          '</div>' +
        '</div>';
    }

    function renderMarket() {
      const newIds = getNewMarketIds(marketData);
      const view = marketViewSelect.value;
      const filteredMarket = marketData
        .filter((skill) => {
          if (view === "new") return newIds.has(skill.id);
          if (view === "uninstalled") return !skill.installed;
          if (view === "installable") return skill.installable && !skill.installed;
          if (view === "directories") return !skill.installable;
          if (view === "installed") return skill.installed;
          return true;
        })
        .sort((a, b) => {
          const newDiff = Number(newIds.has(b.id)) - Number(newIds.has(a.id));
          if (newDiff !== 0) return newDiff;
          const installableDiff = Number(b.installable) - Number(a.installable);
          if (installableDiff !== 0) return installableDiff;
          return a.name.localeCompare(b.name);
        });

      badgeMarketCount.textContent = filteredMarket.length;
      if (badgeMarketCountSec) badgeMarketCountSec.textContent = filteredMarket.length;

      if (marketLoading && marketData.length === 0) {
        marketListEl.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 30px 10px;">' + escapeText(t("marketLoading")) + '</div>';
        const inspectorEl = document.getElementById("market-inspector");
        if (inspectorEl) {
          inspectorEl.innerHTML = '<div class="inspector-welcome">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' +
            '<strong>' + escapeText(t("marketDiscoveryTitle")) + '</strong>' +
            '<div>' + escapeText(t("marketLoading")) + '</div>' +
          '</div>';
        }
        return;
      }

      // Select active item
      let activeSkill = filteredMarket.find(c => c.id === selectedMarketId);
      if (!activeSkill && filteredMarket.length > 0) {
        activeSkill = filteredMarket[0];
        selectedMarketId = activeSkill.id;
      } else if (filteredMarket.length === 0) {
        selectedMarketId = null;
        activeSkill = null;
      }

      // Render left list scroll
      if (filteredMarket.length === 0) {
        marketListEl.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 30px 10px;">' + t("marketNoMatches") + '</div>';
      } else {
        marketListEl.innerHTML = filteredMarket.map((skill) => {
          const isNew = newIds.has(skill.id);
          const isActive = skill.id === selectedMarketId ? "active" : "";
          
          let badgeHtml = "";
          if (isNew) {
            badgeHtml = '<span class="pill warning">' + t("marketNewBadge") + '</span>';
          } else if (skill.installed) {
            badgeHtml = '<span class="pill ok">' + t("marketInstalled") + '</span>';
          } else if (!skill.installable) {
            badgeHtml = '<span class="pill unknown">' + t("marketDirectoryOnly") + '</span>';
          }

          return '<div class="list-card ' + (skill.installed ? 'installed ' : '') + isActive + '" onclick="selectMarket(' + "'" + skill.id + "'" + ')">' +
            '<div class="list-card-header">' +
              '<span class="list-card-title">' + escapeText(skill.name) + '</span>' +
              '<span class="list-card-subtitle">' + escapeText(skill.sourceName) + '</span>' +
            '</div>' +
            '<div class="list-card-desc">' + escapeText(skill.description || "") + '</div>' +
            '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">' +
              badgeHtml +
            '</div>' +
          '</div>';
        }).join("");
      }

      // Render right details inspector
      const inspectorEl = document.getElementById("market-inspector");
      if (inspectorEl) {
        if (!activeSkill) {
          inspectorEl.innerHTML = '<div class="inspector-welcome">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>' +
            '<strong>' + escapeText(t("marketDiscoveryTitle")) + '</strong>' +
            '<div>' + escapeText(t("marketDiscoveryCopy")) + '</div>' +
          '</div>';
        } else {
          const tagHtml = (activeSkill.tags || []).map(tag => '<span class="perm-tag">' + escapeText(tag) + '</span>').join("");
          const languageHtml = (activeSkill.languages || []).map(lang => '<span class="perm-tag">' + escapeText(lang) + '</span>').join("");
          const installedTargetsHtml = (activeSkill.installedTargets || []).length
            ? '<div class="market-meta-row"><strong>' + escapeText(t("marketInstalledTargets")) + ':</strong> ' +
              activeSkill.installedTargets.map((target) => '<span class="installed-target">' + escapeText(target.platform + " / " + target.user) + '</span>').join("") +
              '</div>'
            : '';
          const quickCommandsHtml = renderQuickCommands(activeSkill.quickCommands || [], 3);
          
          const actionHtml = activeSkill.installed
            ? '<span class="pill ok" style="padding: 6px 12px; font-size: 13px; font-weight: 500;">' + t("marketInstalled") + '</span>'
            : activeSkill.installable
              ? '<button class="btn-primary" ' + (permissions.install ? '' : 'title="' + escapeText(t("permissionDeniedInstall")) + '"') + ' data-skillops-action="install-market" data-id="' + escapeText(activeSkill.id) + '">' + t("marketInstall") + '</button>'
              : '<span class="pill unknown" style="padding: 6px 12px; font-size: 13px; font-weight: 500;">' + t("marketDirectoryOnly") + '</span>';

          const openSourceHtml = activeSkill.sourceUrl
            ? '<a class="btn-secondary" href="' + escapeText(activeSkill.sourceUrl) + '" target="_blank" rel="noopener noreferrer" style="text-decoration:none; display:inline-flex; align-items:center;">' + t("marketOpen") + '</a>'
            : '';

          const previewHtml = '<button class="btn-secondary" onclick="previewSkill(' + "'" + escapeText(activeSkill.sourceUrl || activeSkill.id) + "'" + ')">' + escapeText(t("previewSkillMd")) + '</button>';

          inspectorEl.innerHTML =
            '<div class="inspector-header">' +
              '<div class="inspector-title-block">' +
                '<h2>' + escapeText(activeSkill.name) + '</h2>' +
                '<div class="inspector-source">' + escapeText(activeSkill.sourceName) + '</div>' +
              '</div>' +
              '<div class="inspector-actions-row">' +
                actionHtml +
                previewHtml +
                openSourceHtml +
              '</div>' +
            '</div>' +
            '<div class="market-desc" style="font-size: 14.5px; line-height: 1.6;">' + escapeText(activeSkill.description) + '</div>' +
            (activeSkill.summary ? '<div class="market-usage"><strong>' + t("marketSummary") + ':</strong> ' + escapeText(activeSkill.summary) + '</div>' : '') +
            '<div class="market-usage"><strong>' + t("marketUsage") + ':</strong> ' + escapeText(activeSkill.usage) + '</div>' +
            (activeSkill.installedPath ? '<div class="inspector-card"><span class="inspector-label">' + t("detailsPath") + '</span><span class="inspector-value">' + escapeText(activeSkill.installedPath) + '</span></div>' : '') +
            installedTargetsHtml +
            '<div class="inspector-section-title">' + escapeText(t("marketQuickCommands")) + '</div>' +
            quickCommandsHtml +
            '<div class="inspector-section-title">' + (currentLang === "zh" ? "分类与语言" : "Tags & Languages") + '</div>' +
            '<div class="tag-container">' + tagHtml + languageHtml + '</div>';
        }
      }
    }

    function renderCliTools() {
      const view = cliViewSelect.value;
      const filteredCli = cliData
        .filter((tool) => {
          if (view === "installed") return tool.installed;
          if (view === "uninstalled") return !tool.installed;
          if (view === "agent") return (tool.tags || []).some((tag) => ["ai-agent", "skills"].includes(tag));
          if (view === "toolchain") return !(tool.tags || []).some((tag) => ["ai-agent", "skills"].includes(tag));
          return true;
        })
        .sort((a, b) => {
          const installedDiff = Number(b.installed) - Number(a.installed);
          if (installedDiff !== 0) return installedDiff;
          return a.name.localeCompare(b.name);
        });

      badgeCliCount.textContent = filteredCli.length;
      if (badgeCliCountSec) badgeCliCountSec.textContent = filteredCli.length;

      // Select active item
      let activeCli = filteredCli.find(c => c.id === selectedCliId);
      if (!activeCli && filteredCli.length > 0) {
        activeCli = filteredCli[0];
        selectedCliId = activeCli.id;
      } else if (filteredCli.length === 0) {
        selectedCliId = null;
        activeCli = null;
      }

      // Render left list scroll
      if (filteredCli.length === 0) {
        cliListEl.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 30px 10px;">' + t("cliNoMatches") + '</div>';
      } else {
        cliListEl.innerHTML = filteredCli.map((tool) => {
          const isActive = tool.id === selectedCliId ? "active" : "";
          const badgeHtml = tool.installed
            ? '<span class="pill ok">' + t("cliInstalled") + '</span>'
            : '<span class="pill unknown">' + t("cliUninstalled") + '</span>';

          return '<div class="list-card ' + (tool.installed ? 'installed ' : '') + isActive + '" onclick="selectCli(' + "'" + tool.id + "'" + ')">' +
            '<div class="list-card-header">' +
              '<span class="list-card-title">' + escapeText(tool.name) + '</span>' +
              '<span class="list-card-subtitle">' + escapeText(tool.command) + '</span>' +
            '</div>' +
            '<div class="list-card-desc">' + escapeText(tool.description || "") + '</div>' +
            '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">' +
              badgeHtml +
            '</div>' +
          '</div>';
        }).join("");
      }

      // Render right details inspector
      const inspectorEl = document.getElementById("cli-inspector");
      if (inspectorEl) {
        if (!activeCli) {
          inspectorEl.innerHTML = '<div class="inspector-welcome">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>' +
            '<strong>' + escapeText(t("cliDiscoveryTitle")) + '</strong>' +
            '<div>' + escapeText(t("cliDiscoveryCopy")) + '</div>' +
          '</div>';
        } else {
          const tagHtml = (activeCli.tags || []).map(tag => '<span class="perm-tag">' + escapeText(tag) + '</span>').join("");
          const languageHtml = (activeCli.languages || []).map(lang => '<span class="perm-tag">' + escapeText(lang) + '</span>').join("");
          const platformText = (activeCli.platforms || []).join(", ");
          
          const installHtml = !activeCli.installed && activeCli.installCommand
            ? '<div class="market-usage"><strong>' + escapeText(t("cliInstall")) + ':</strong> ' + escapeText(activeCli.installCommand) + '</div>'
            : '';
          const uninstallHtml = activeCli.installed && activeCli.uninstallCommand
            ? '<div class="market-usage"><strong>' + escapeText(t("cliRemove")) + ':</strong> ' + escapeText(activeCli.uninstallCommand) + '</div>'
            : '';
          const pathHtml = activeCli.installedPath
            ? '<div class="inspector-card"><span class="inspector-label">' + t("cliPath") + '</span><span class="inspector-value">' + escapeText(activeCli.installedPath) + '</span></div>'
            : '';
          const versionHtml = activeCli.version
            ? '<div class="inspector-card"><span class="inspector-label">' + t("cliVersion") + '</span><span class="inspector-value">' + escapeText(activeCli.version) + '</span></div>'
            : '';

          const openSourceHtml = activeCli.sourceUrl
            ? '<a class="btn-secondary" href="' + escapeText(activeCli.sourceUrl) + '" target="_blank" rel="noopener noreferrer" style="text-decoration:none; display:inline-flex; align-items:center;">' + t("marketOpen") + '</a>'
            : '';
          const cliInstallActionHtml = !activeCli.installed && activeCli.installCommand
            ? '<button class="btn-primary" ' + (permissions.install ? '' : 'title="' + escapeText(t("permissionDeniedInstall")) + '"') + ' data-skillops-action="cli-action" data-id="' + escapeText(activeCli.id) + '" data-cli-action="install">' + t("cliInstall") + '</button>'
            : '';
          const cliRemoveActionHtml = activeCli.installed && activeCli.uninstallCommand
            ? '<button class="btn-danger" ' + (permissions.remove ? '' : 'title="' + escapeText(t("permissionDeniedRemove")) + '"') + ' data-skillops-action="cli-action" data-id="' + escapeText(activeCli.id) + '" data-cli-action="uninstall">' + t("cliRemove") + '</button>'
            : '';

          inspectorEl.innerHTML =
            '<div class="inspector-header">' +
              '<div class="inspector-title-block">' +
                '<h2>' + escapeText(activeCli.name) + '</h2>' +
                '<div class="inspector-source">' + escapeText(activeCli.command + " · " + activeCli.sourceName) + '</div>' +
              '</div>' +
              '<div class="inspector-actions-row">' +
                cliInstallActionHtml +
                cliRemoveActionHtml +
                openSourceHtml +
              '</div>' +
            '</div>' +
            '<div class="market-desc" style="font-size: 14.5px; line-height: 1.6;">' + escapeText(activeCli.description) + '</div>' +
            '<div class="market-usage"><strong>' + escapeText(t("marketUsage")) + ':</strong> ' + escapeText(activeCli.usage) + '</div>' +
            installHtml +
            uninstallHtml +
            '<div class="inspector-grid">' +
              pathHtml +
              versionHtml +
              '<div class="inspector-card"><span class="inspector-label">' + t("cliPlatforms") + '</span><span class="inspector-value">' + escapeText(platformText) + '</span></div>' +
            '</div>' +
            '<div class="inspector-section-title">' + escapeText(t("marketQuickCommands")) + '</div>' +
            renderQuickCommands(activeCli.quickCommands || [], 5) +
            '<div class="inspector-section-title">' + (currentLang === "zh" ? "分类与运行时" : "Tags & Runtime") + '</div>' +
            '<div class="tag-container">' + tagHtml + languageHtml + '</div>';
        }
      }
    }

    function renderMcpTools() {
      if (badgeMcpToolsCount) badgeMcpToolsCount.textContent = mcpToolsData.length || "0";
      if (badgeMcpToolsCountHeader) badgeMcpToolsCountHeader.textContent = mcpToolsData.length || "0";

      if (!mcpToolsListEl || !mcpToolsInspectorEl) return;

      if (!mcpToolsData || mcpToolsData.length === 0) {
        mcpToolsListEl.innerHTML = '<div class="inspector-welcome"><div>' + escapeText(t("mcpToolsEmpty")) + '</div></div>';
        mcpToolsInspectorEl.innerHTML = '';
        return;
      }

      if (!selectedMcpToolId) selectedMcpToolId = mcpToolsData[0].server.name;
      const activeServer = mcpToolsData.find(s => s.server.name === selectedMcpToolId) || mcpToolsData[0];
      selectedMcpToolId = activeServer.server.name;

      mcpToolsListEl.innerHTML = mcpToolsData.map((serverData) => {
        const isActive = serverData.server.name === selectedMcpToolId ? "active" : "";
        const badgeHtml = serverData.health === "ok" 
          ? '<span class="pill ok">OK</span>' 
          : '<span class="pill unknown">' + escapeText(serverData.health) + '</span>';

        return '<div class="list-card ' + isActive + '" onclick="selectMcpTool(' + "'" + jsSingleQuote(serverData.server.name) + "'" + ')">' +
          '<div class="list-card-header">' +
            '<span class="list-card-title">' + escapeText(serverData.server.name) + '</span>' +
            badgeHtml +
          '</div>' +
          '<div class="list-card-desc">' + escapeText(t("mcpToolsCount")) + ': ' + (serverData.tools?.length || 0) + '</div>' +
        '</div>';
      }).join("");

      const toolsHtml = (activeServer.tools || []).map(tool => {
        return '<div class="list-card">' +
          '<div class="list-card-header">' +
            '<span class="list-card-title" style="font-family:monospace;">' + escapeText(tool.name) + '</span>' +
          '</div>' +
          '<div class="list-card-desc">' + escapeText(tool.description || t("mcpToolNoDesc")) + '</div>' +
        '</div>';
      }).join("");

      const activeMcpCapability =
        capabilityData.find((cap) =>
          cap.type === "mcp_server" &&
          cap.name === activeServer.server.name &&
          (!activeServer.server.configPath || cap.configPath === activeServer.server.configPath)
        ) ||
        installedData.find((item) =>
          item.kind === "mcp_server" &&
          item.name === activeServer.server.name &&
          (!activeServer.server.configPath || item.configPath === activeServer.server.configPath)
        );
      const activeMcpCapabilityId = activeMcpCapability?.capabilityId || activeMcpCapability?.id || "";
      const mcpRemoveButtonHtml = activeMcpCapabilityId
        ? '<button class="btn-danger" ' + (permissions.remove ? '' : 'title="' + escapeText(t("permissionDeniedRemove")) + '"') + ' data-skillops-action="remove-mcp" data-id="' + escapeText(activeMcpCapabilityId) + '">' + t("mcpRemove") + '</button>'
        : '';

      mcpToolsInspectorEl.innerHTML =
        '<div class="inspector-header">' +
          '<div class="inspector-title-block">' +
            '<h2>' + escapeText(activeServer.server.name) + '</h2>' +
            '<div class="inspector-source">' + escapeText(activeServer.server.command || activeServer.server.url || "") + '</div>' +
          '</div>' +
          '<div class="inspector-actions-row">' +
            mcpRemoveButtonHtml +
          '</div>' +
        '</div>' +
        '<div class="inspector-section-title">' + escapeText(t("mcpToolsAvailable")) + '</div>' +
        (toolsHtml || '<div class="inspector-welcome" style="padding:10px;">' + escapeText(t("mcpToolsNone")) + '</div>');
    }

    function renderHistory() {
      if (badgeHistoryCount) badgeHistoryCount.textContent = historyData.length || "0";
      if (badgeHistoryCountHeader) badgeHistoryCountHeader.textContent = historyData.length || "0";

      if (!historyListEl) return;

      if (!historyData || historyData.length === 0) {
        historyListEl.innerHTML = '<div class="inspector-welcome"><div>' + escapeText(t("historyEmpty")) + '</div></div>';
        return;
      }

      historyListEl.innerHTML = historyData.map((entry) => {
        const date = new Date(entry.at).toLocaleString();
        const metaStr = Object.keys(entry.meta || {})
          .filter(k => k !== "error")
          .map(k => '<strong>' + escapeText(k) + '</strong>: ' + escapeText(String(entry.meta[k])))
          .join(" | ");
        
        let nodeClass = "unknown";
        if (entry.action === "install") nodeClass = "ok";
        if (entry.action === "remove") nodeClass = "bad";

        return '<div class="list-card">' +
          '<div class="list-card-header">' +
            '<span class="list-card-title">' + escapeText(entry.action).toUpperCase() + ' &rarr; ' + escapeText(entry.target) + '</span>' +
            '<span class="pill ' + nodeClass + '" style="font-size:11px; padding:2px 6px;">' + escapeText(new Date(entry.at).toLocaleTimeString()) + '</span>' +
          '</div>' +
          '<div class="list-card-desc" style="font-size:12.5px; color:var(--muted);">' + escapeText(date) + '</div>' +
          (metaStr ? '<div style="font-size:12.5px; margin-top:4px; color:var(--muted);">' + metaStr + '</div>' : '') +
          (entry.meta?.error ? '<div style="color:var(--bad); margin-top:4px; font-family:monospace; font-size:12px;">Error: ' + escapeText(entry.meta.error) + '</div>' : '') +
        '</div>';
      }).join("");
    }

    const params = new URLSearchParams(window.location.search);
    const requestTab = params.get("tab");
    const validTabs = ["capabilities", "installed", "market", "cli", "issues", "history", "mcp-tools", "trash"];
    if (requestTab && validTabs.includes(requestTab)) {
      switchTab(requestTab);
    }

    applyTranslations();
    load();
    if (!permissions.onboarded) {
      showOnboarding(true);
    }
  </script>
</body>
</html>`;
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return replacements[char] ?? char;
  });
}
