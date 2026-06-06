import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import matter from "gray-matter";
import fg from "fast-glob";
import { scanCapabilities } from "./scan.js";
import { findSkillDirs, noSkillMdErrorMessage, parseGitHubSource } from "./market.js";
import { lintSkill } from "./skill-lint.js";
import { getInstalledInventory, type InstalledInventoryItem } from "./installed.js";
import { doctorMcpByNameOrPath, doctorMcpServer } from "./mcp-doctor.js";
import { findMcpConfigs, loadMcpServers } from "./mcp-config.js";
import type { Capability, McpDoctorResult, McpServerConfig } from "./types.js";
import { checkSkillUpdate, currentGitCommit, gitOutput, readSkillInstallRecord, writeSkillInstallRecord, type SkillInstallRecord, type SkillUpdateStatus } from "./install-record.js";
import { listHistory, recordHistory } from "./history.js";
import { stableId, unique } from "./utils.js";

export type SkillPreview = {
  source: string;
  name: string;
  description: string;
  markdown: string;
  frontmatter: Record<string, unknown>;
  summary: string;
  lint: Capability;
};

export type ProfileSnapshot = {
  schemaVersion: "skillops.profile.v1";
  exportedAt: string;
  root: string;
  inventory: Awaited<ReturnType<typeof getInstalledInventory>>;
  mcpConfigs: Array<{ path: string; source: string; serverCount: number; servers: string[] }>;
  history: Awaited<ReturnType<typeof listHistory>>;
};

export type LocalDbSnapshotResult = {
  dbPath: string;
  backend: "sqlite" | "json-fallback";
  inventoryCount: number;
  feedbackCount: number;
};

export type FeedbackEntry = {
  id: string;
  at: string;
  targetId: string;
  rating: number;
  comment: string;
};

export type CompatibilityRow = {
  itemId: string;
  name: string;
  kind: string;
  codex: "native" | "compatible" | "manual" | "unknown";
  claude: "native" | "compatible" | "manual" | "unknown";
  cursor: "native" | "compatible" | "manual" | "unknown";
  notes: string[];
};

export type EvalResult = {
  skillPath: string;
  passed: boolean;
  health: Capability["health"];
  risk: Capability["risk"];
  checks: Array<{ name: string; passed: boolean; message: string }>;
  issues: Capability["issues"];
};

export type DependencyGraph = {
  nodes: Array<{ id: string; label: string; type: string }>;
  edges: Array<{ from: string; to: string; label: string }>;
  mermaid: string;
};

export type OfflineReview = {
  skillPath: string;
  verdict: "approve" | "review" | "block";
  summary: string;
  strengths: string[];
  concerns: string[];
  nextActions: string[];
};

export type EnhancementOverview = {
  feature: string;
  status: "implemented";
  entrypoints: string[];
};

const SKILLOPS_DIR = path.join(homedir(), ".skillops");
const PROFILE_DIR = path.join(SKILLOPS_DIR, "profiles");
const FEEDBACK_FILE = path.join(SKILLOPS_DIR, "feedback.jsonl");
const DB_FILE = path.join(SKILLOPS_DIR, "skillops.db");

export function getEnhancementOverview(): EnhancementOverview[] {
  return [
    { feature: "Skill update detection and one-click upgrade", status: "implemented", entrypoints: ["skillops updates check", "skillops updates upgrade"] },
    { feature: "Skill content preview before install", status: "implemented", entrypoints: ["skillops preview skill", "GET /api/skill/preview"] },
    { feature: "MCP server live tool browser", status: "implemented", entrypoints: ["skillops mcp tools", "GET /api/mcp/tools"] },
    { feature: "Enhanced risk scoring", status: "implemented", entrypoints: ["skillops risk audit", "skillops lint"] },
    { feature: "Configuration profile import/export", status: "implemented", entrypoints: ["skillops profile export", "skillops profile import"] },
    { feature: "Operation history log", status: "implemented", entrypoints: ["skillops history list", "~/.skillops/history.jsonl"] },
    { feature: "SQLite local library", status: "implemented", entrypoints: ["skillops db snapshot", "~/.skillops/skillops.db"] },
    { feature: "Skill rating and feedback", status: "implemented", entrypoints: ["skillops feedback add", "~/.skillops/feedback.jsonl"] },
    { feature: "Multi-agent compatibility matrix", status: "implemented", entrypoints: ["skillops compat matrix"] },
    { feature: "Skill creation wizard", status: "implemented", entrypoints: ["skillops create skill"] },
    { feature: "MCP server one-click install", status: "implemented", entrypoints: ["skillops mcp install"] },
    { feature: "Eval runner sandbox", status: "implemented", entrypoints: ["skillops eval skill"] },
    { feature: "Realtime file monitor", status: "implemented", entrypoints: ["skillops watch"] },
    { feature: "AI-assisted skill review", status: "implemented", entrypoints: ["skillops review skill"] },
    { feature: "Local dependency graph visualization", status: "implemented", entrypoints: ["skillops graph dependencies"] }
  ];
}

export async function previewSkillSource(source: string): Promise<SkillPreview> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "skillops-preview-"));
  try {
    const skillDir = await resolveSkillSource(source, tempRoot);
    const markdown = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
    const parsed = matter(markdown);
    const lint = await lintSkill(skillDir);
    return {
      source,
      name: lint.name,
      description: lint.description ?? "",
      markdown,
      frontmatter: parsed.data as Record<string, unknown>,
      summary: firstParagraph(parsed.content),
      lint
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function checkInstalledSkillUpdates(root: string): Promise<SkillUpdateStatus[]> {
  const capabilities = await scanCapabilities({ root, includeHome: true, probeMcp: false });
  const skills = capabilities.filter((item) => item.type === "skill" && item.path);
  return Promise.all(skills.map((skill) => checkSkillUpdate(skill.path!)));
}

export async function upgradeInstalledSkill(skillPath: string): Promise<{ path: string; name: string; record: SkillInstallRecord; lint: Capability }> {
  const record = await readSkillInstallRecord(skillPath);
  if (!record?.repoUrl) throw new Error(`No git-backed SkillOps install record found at ${skillPath}`);

  const tempRoot = await mkdtemp(path.join(tmpdir(), "skillops-upgrade-"));
  const backupPath = `${skillPath}.skillops-backup-${Date.now()}`;
  try {
    await gitOutput(["clone", "--depth", "1", ...(record.branch ? ["--branch", record.branch] : []), record.repoUrl, tempRoot]);
    const sourceDir = record.sourceSubdir ? path.join(tempRoot, record.sourceSubdir) : await singleSkillDir(tempRoot);
    const lint = await lintSkill(sourceDir);
    await rename(skillPath, backupPath);
    await cp(sourceDir, skillPath, { recursive: true, filter: (source) => !source.includes(`${path.sep}.git${path.sep}`) && !source.includes("node_modules") });
    const installedCommit = await currentGitCommit(tempRoot);
    const nextRecord: SkillInstallRecord = {
      ...record,
      installedCommit,
      installedAt: new Date().toISOString(),
      installedBy: "skillops"
    };
    await writeSkillInstallRecord(skillPath, nextRecord);
    await rm(backupPath, { recursive: true, force: true });
    await recordHistory("skill.upgrade", lint.name, { path: skillPath, sourceUrl: record.sourceUrl, installedCommit });
    return { path: skillPath, name: lint.name, record: nextRecord, lint: await lintSkill(skillPath) };
  } catch (error) {
    if (!existsSync(skillPath) && existsSync(backupPath)) {
      await rename(backupPath, skillPath);
    }
    throw error;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function browseMcpTools(root: string, input?: string): Promise<McpDoctorResult[]> {
  if (input) return [await doctorMcpByNameOrPath(input, root)];
  const configs = await findMcpConfigs(root, true);
  const nested = await Promise.all(configs.map(async (configPath) => {
    try {
      return await loadMcpServers(configPath);
    } catch {
      return [];
    }
  }));
  const servers = nested.flat();
  const results: McpDoctorResult[] = [];
  for (const server of servers) {
    results.push(await doctorMcpServer(server));
  }
  return results;
}

export async function auditSkillRisk(skillPath: string): Promise<Capability> {
  return lintSkill(skillPath);
}

export async function exportProfile(root: string, outPath?: string): Promise<{ path: string; profile: ProfileSnapshot }> {
  const configs = await findMcpConfigs(root, true);
  const profile: ProfileSnapshot = {
    schemaVersion: "skillops.profile.v1",
    exportedAt: new Date().toISOString(),
    root,
    inventory: await getInstalledInventory({ root, includeHome: true, probeMcp: false }),
    mcpConfigs: await Promise.all(configs.map(async (configPath) => {
      const servers = await loadMcpServers(configPath).catch(() => []);
      return {
        path: configPath,
        source: servers[0]?.source ?? "unknown",
        serverCount: servers.length,
        servers: servers.map((server) => server.name)
      };
    })),
    history: await listHistory(100)
  };

  await mkdir(PROFILE_DIR, { recursive: true });
  const target = outPath
    ? path.resolve(outPath)
    : path.join(PROFILE_DIR, `skillops-profile-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  await recordHistory("profile.export", target, { inventoryCount: profile.inventory.summary.total });
  return { path: target, profile };
}

export async function importProfile(profilePath: string): Promise<{ path: string; profile: ProfileSnapshot }> {
  const raw = await readFile(profilePath, "utf8");
  const profile = JSON.parse(raw) as ProfileSnapshot;
  if (profile.schemaVersion !== "skillops.profile.v1") throw new Error("Unsupported SkillOps profile schema.");
  await mkdir(PROFILE_DIR, { recursive: true });
  const target = path.join(PROFILE_DIR, `imported-${path.basename(profilePath)}`);
  await writeFile(target, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  await recordHistory("profile.import", target, { originalPath: profilePath, inventoryCount: profile.inventory?.summary?.total ?? 0 });
  return { path: target, profile };
}

export async function snapshotLocalLibrary(root: string): Promise<LocalDbSnapshotResult> {
  const inventory = await getInstalledInventory({ root, includeHome: true, probeMcp: false });
  const feedback = await listFeedback();
  await mkdir(SKILLOPS_DIR, { recursive: true });

  try {
    const sqlite = await loadNodeSqlite();
    const db = new sqlite.DatabaseSync(DB_FILE);
    db.exec(`
      CREATE TABLE IF NOT EXISTS inventory_snapshots (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        total INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        target_id TEXT NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT NOT NULL
      );
    `);
    db.prepare("INSERT INTO inventory_snapshots (id, created_at, total, payload) VALUES (?, ?, ?, ?)")
      .run(randomUUID(), new Date().toISOString(), inventory.summary.total, JSON.stringify(inventory));
    for (const item of feedback) {
      db.prepare("INSERT OR REPLACE INTO feedback (id, created_at, target_id, rating, comment) VALUES (?, ?, ?, ?, ?)")
        .run(item.id, item.at, item.targetId, item.rating, item.comment);
    }
    db.close();
    await recordHistory("db.snapshot", DB_FILE, { total: inventory.summary.total, backend: "sqlite" });
    return { dbPath: DB_FILE, backend: "sqlite", inventoryCount: inventory.summary.total, feedbackCount: feedback.length };
  } catch {
    const fallbackPath = path.join(SKILLOPS_DIR, "skillops-db-fallback.json");
    await writeFile(fallbackPath, `${JSON.stringify({ inventory, feedback, generatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
    await recordHistory("db.snapshot", fallbackPath, { total: inventory.summary.total, backend: "json-fallback" });
    return { dbPath: fallbackPath, backend: "json-fallback", inventoryCount: inventory.summary.total, feedbackCount: feedback.length };
  }
}

export async function addFeedback(targetId: string, rating: number, comment: string): Promise<FeedbackEntry> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("Rating must be an integer from 1 to 5.");
  const entry: FeedbackEntry = {
    id: randomUUID(),
    at: new Date().toISOString(),
    targetId,
    rating,
    comment
  };
  await mkdir(path.dirname(FEEDBACK_FILE), { recursive: true });
  await appendFile(FEEDBACK_FILE, `${JSON.stringify(entry)}\n`, "utf8");
  await recordHistory("feedback.add", targetId, { rating, comment });
  return entry;
}

export async function listFeedback(): Promise<FeedbackEntry[]> {
  if (!existsSync(FEEDBACK_FILE)) return [];
  const raw = await readFile(FEEDBACK_FILE, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FeedbackEntry)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export async function buildCompatibilityMatrix(root: string): Promise<CompatibilityRow[]> {
  const inventory = await getInstalledInventory({ root, includeHome: true, probeMcp: false });
  return inventory.items.map((item) => compatibilityForItem(item));
}

export async function createSkillTemplate(name: string, targetRoot: string): Promise<{ path: string }> {
  const safeName = name.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  if (!safeName) throw new Error("Skill name is required.");
  const skillPath = path.join(path.resolve(targetRoot), safeName);
  if (existsSync(skillPath)) throw new Error(`Target skill already exists: ${skillPath}`);
  await mkdir(path.join(skillPath, "scripts"), { recursive: true });
  await mkdir(path.join(skillPath, "examples"), { recursive: true });
  await writeFile(path.join(skillPath, "SKILL.md"), `---\nname: ${safeName}\ndescription: Use when the user needs ${safeName.replace(/-/g, " ")} support.\n---\n\n# ${safeName}\n\n## When to Use\n\nUse this skill for a focused, repeatable workflow.\n\n## Workflow\n\n1. Inspect the local context.\n2. Make the smallest safe change.\n3. Verify the result.\n`, "utf8");
  await writeFile(path.join(skillPath, "examples", "README.md"), `# ${safeName} examples\n\nAdd successful prompts and expected outputs here.\n`, "utf8");
  await recordHistory("skill.create", safeName, { path: skillPath });
  return { path: skillPath };
}

export async function installMcpServer(options: {
  root: string;
  target: "project" | "cursor" | "claude";
  name: string;
  command?: string;
  args?: string[];
  url?: string;
}): Promise<{ configPath: string; server: McpServerConfig }> {
  if (!options.name.trim()) throw new Error("MCP server name is required.");
  if (!options.command && !options.url) throw new Error("Provide either a command or URL for the MCP server.");
  const configPath = options.target === "project"
    ? path.join(path.resolve(options.root), ".mcp.json")
    : options.target === "cursor"
      ? path.join(homedir(), ".cursor", "mcp.json")
      : path.join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");

  await mkdir(path.dirname(configPath), { recursive: true });
  const existing = existsSync(configPath) ? JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown> : {};
  const mcpServers = typeof existing.mcpServers === "object" && existing.mcpServers ? existing.mcpServers as Record<string, unknown> : {};
  mcpServers[options.name] = options.url
    ? { url: options.url, transport: options.url.includes("/sse") ? "sse" : "http" }
    : { command: options.command, args: options.args ?? [] };
  existing.mcpServers = mcpServers;
  await writeFile(configPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
  const [server] = await loadMcpServers(configPath).then((servers) => servers.filter((item) => item.name === options.name));
  await recordHistory("mcp.install", options.name, { configPath, command: options.command, url: options.url });
  return { configPath, server };
}

export async function runSkillEval(skillPath: string): Promise<EvalResult> {
  const lint = await lintSkill(skillPath);
  const files = await fg(["**/*"], { cwd: skillPath, onlyFiles: true, dot: true, ignore: ["node_modules/**", ".git/**"] });
  const checks = [
    { name: "entrypoint", passed: existsSync(path.join(skillPath, "SKILL.md")), message: "SKILL.md exists" },
    { name: "lint-health", passed: lint.health !== "broken", message: `health=${lint.health}` },
    { name: "risk-threshold", passed: lint.risk !== "critical", message: `risk=${lint.risk}` },
    { name: "supporting-files", passed: files.length > 0, message: `${files.length} files found in sandbox scan` }
  ];
  const passed = checks.every((check) => check.passed);
  await recordHistory("eval.skill", lint.name, { skillPath, passed, health: lint.health, risk: lint.risk });
  return { skillPath, passed, health: lint.health, risk: lint.risk, checks, issues: lint.issues };
}

export async function reviewSkillOffline(skillPath: string): Promise<OfflineReview> {
  const lint = await lintSkill(skillPath);
  const criticalIssues = lint.issues.filter((issue) => issue.severity === "P0" || issue.severity === "P1");
  const concerns = lint.issues.slice(0, 8).map((issue) => `${issue.code}: ${issue.title}`);
  const strengths = [
    lint.description ? "Has an activation description." : "",
    lint.language.length ? `Declares or implies ${lint.language.join(", ")} assets.` : "",
    lint.permissions.length === 0 ? "No high-risk permissions inferred from text." : ""
  ].filter(Boolean);
  const verdict = criticalIssues.length > 0 ? "block" : lint.issues.length > 0 ? "review" : "approve";
  return {
    skillPath,
    verdict,
    summary: `${lint.name} is ${lint.health} with ${lint.risk} risk and ${lint.issues.length} detected issue(s).`,
    strengths,
    concerns,
    nextActions: lint.issues.length
      ? lint.issues.map((issue) => issue.suggestion).filter(Boolean).slice(0, 6) as string[]
      : ["Add examples and an eval case before publishing."]
  };
}

export async function buildDependencyGraph(root: string): Promise<DependencyGraph> {
  const inventory = await getInstalledInventory({ root, includeHome: true, probeMcp: false });
  const nodes = new Map<string, { id: string; label: string; type: string }>();
  const edges: DependencyGraph["edges"] = [];
  for (const item of inventory.items) {
    nodes.set(item.id, { id: item.id, label: item.name, type: item.kind });
    if (item.kind === "mcp_server" && item.command) {
      const runtime = item.command.split(/\s+/)[0];
      const runtimeId = stableId(["runtime", runtime]);
      nodes.set(runtimeId, { id: runtimeId, label: runtime, type: "runtime" });
      edges.push({ from: item.id, to: runtimeId, label: "runs on" });
    }
    if (item.path && item.kind === "skill") {
      for (const dependency of await readSkillDependencies(item.path)) {
        const depId = stableId(["dependency", dependency]);
        nodes.set(depId, { id: depId, label: dependency, type: "dependency" });
        edges.push({ from: item.id, to: depId, label: "declares" });
      }
    }
  }
  const mermaid = [
    "graph TD",
    ...[...nodes.values()].map((node) => `  ${mermaidId(node.id)}["${escapeMermaid(node.label)} (${escapeMermaid(node.type)})"]`),
    ...edges.map((edge) => `  ${mermaidId(edge.from)} -->|"${escapeMermaid(edge.label)}"| ${mermaidId(edge.to)}`)
  ].join("\n");
  return { nodes: [...nodes.values()], edges, mermaid };
}

export async function getWatchRoots(root: string): Promise<string[]> {
  const configs = await findMcpConfigs(root, true);
  return unique([
    path.join(homedir(), ".codex", "skills"),
    path.join(homedir(), ".agents", "skills"),
    path.join(homedir(), ".claude", "skills"),
    path.join(path.resolve(root), "skills"),
    ...configs
  ]).filter((item) => existsSync(item));
}

async function resolveSkillSource(source: string, tempRoot: string): Promise<string> {
  const local = path.resolve(source);
  if (existsSync(path.join(local, "SKILL.md"))) return local;
  const parsed = parseGitHubSource(source);
  await gitOutput(["clone", "--depth", "1", ...(parsed.branch ? ["--branch", parsed.branch] : []), parsed.repoUrl, tempRoot]);
  const skillRoot = parsed.subdir ? path.join(tempRoot, parsed.subdir) : tempRoot;
  return singleSkillDir(skillRoot, source, tempRoot, parsed.subdir);
}

async function singleSkillDir(
  root: string,
  source?: string,
  sourceRootForHint?: string,
  sourceSubdir?: string
): Promise<string> {
  const skillDirs = await findSkillDirs(root);
  if (skillDirs.length === 0) {
    if (source) {
      throw new Error(await noSkillMdErrorMessage(source, sourceRootForHint ?? root, sourceSubdir));
    }
    throw new Error("No SKILL.md found.");
  }
  if (skillDirs.length > 1) {
    throw new Error(`Multiple SKILL.md files found: ${skillDirs.map((item) => path.relative(root, item)).slice(0, 5).join(", ")}`);
  }
  return skillDirs[0]!;
}

async function readSkillDependencies(skillPath: string): Promise<string[]> {
  const dependencies = new Set<string>();
  const packageJson = path.join(skillPath, "package.json");
  if (existsSync(packageJson)) {
    const parsed = JSON.parse(await readFile(packageJson, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const key of Object.keys(parsed.dependencies ?? {})) dependencies.add(key);
    for (const key of Object.keys(parsed.devDependencies ?? {})) dependencies.add(key);
  }
  const requirements = path.join(skillPath, "requirements.txt");
  if (existsSync(requirements)) {
    const raw = await readFile(requirements, "utf8");
    for (const line of raw.split("\n")) {
      const name = line.trim().split(/[<>=~! ]/)[0];
      if (name && !name.startsWith("#")) dependencies.add(name);
    }
  }
  return [...dependencies].slice(0, 40);
}

function compatibilityForItem(item: InstalledInventoryItem): CompatibilityRow {
  const notes: string[] = [];
  const pathText = `${item.path ?? ""} ${item.configPath ?? ""}`;
  const codex = pathText.includes(".codex") ? "native" : item.kind === "skill" ? "compatible" : item.kind === "mcp_server" ? "native" : "manual";
  const claude = pathText.includes(".claude") || pathText.includes("Claude") ? "native" : item.kind === "skill" ? "compatible" : item.kind === "mcp_server" ? "compatible" : "manual";
  const cursor = pathText.includes(".cursor") ? "native" : item.kind === "mcp_server" ? "compatible" : "manual";
  if (item.kind === "skill" && !item.path?.includes(".codex") && !item.path?.includes(".claude")) notes.push("Copy or install the skill into the target agent's skill folder for native use.");
  if (item.kind === "mcp_server" && item.configPath) notes.push(`Configured in ${item.configPath}.`);
  return { itemId: item.id, name: item.name, kind: item.kind, codex, claude, cursor, notes };
}

async function loadNodeSqlite(): Promise<{ DatabaseSync: new (filename: string) => {
  exec(sql: string): void;
  prepare(sql: string): { run(...values: unknown[]): void };
  close(): void;
} }> {
  const importer = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
  return await importer("node:sqlite") as { DatabaseSync: new (filename: string) => {
    exec(sql: string): void;
    prepare(sql: string): { run(...values: unknown[]): void };
    close(): void;
  } };
}

function firstParagraph(markdown: string): string {
  return markdown
    .split(/\n{2,}/)
    .map((block) => block.replace(/^#+\s+/gm, "").trim())
    .find((block) => block && !block.startsWith("```") && block.length > 20)
    ?.slice(0, 500) ?? "";
}

function mermaidId(input: string): string {
  return `n_${input.replace(/[^a-zA-Z0-9_]+/g, "_")}`;
}

function escapeMermaid(input: string): string {
  return input.replace(/"/g, '\\"');
}
