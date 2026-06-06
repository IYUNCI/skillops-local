import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { Capability } from "./types.js";
import { lintSkill } from "./skill-lint.js";
import { stableId, unique } from "./utils.js";
import { currentGitCommit, gitOutput, writeSkillInstallRecord } from "./install-record.js";
import { recordHistory } from "./history.js";

export type SkillInstallTarget = "codex" | "claude" | "project";

export type InstalledTarget = {
  platform: string;
  target: SkillInstallTarget | "agents" | "unknown";
  user: string;
  path: string;
};

export type QuickCommand = {
  label: string;
  command: string;
  description: string;
};

export type MarketSkill = {
  id: string;
  name: string;
  description: string;
  usage: string;
  summary?: string;
  sourceName: string;
  sourceUrl: string;
  repoUrl?: string;
  sourceSubdir?: string;
  languages: string[];
  tags: string[];
  installable: boolean;
  installed: boolean;
  installedPath?: string;
  installedTargets: InstalledTarget[];
  quickCommands: QuickCommand[];
  fetchedAt?: string;
};

export type InstallResult = {
  name: string;
  target: SkillInstallTarget;
  targetPath: string;
  lint: Capability;
};

type MarketCatalogEntry = Omit<MarketSkill, "installed" | "installedPath" | "installedTargets" | "quickCommands">;

const MARKET_CATALOG: MarketCatalogEntry[] = [
  {
    id: "anthropic-pdf",
    name: "pdf",
    description: "Extract text, create PDFs, and handle forms using a reference PDF skill from Anthropic's public skills repo.",
    usage: "Use when an agent needs to read, inspect, create, or transform PDF documents in a repeatable workflow.",
    sourceName: "anthropics/skills",
    sourceUrl: "https://github.com/anthropics/skills/tree/main/skills/pdf",
    repoUrl: "https://github.com/anthropics/skills.git",
    sourceSubdir: "skills/pdf",
    languages: ["Markdown", "Python"],
    tags: ["documents", "pdf", "official-reference"],
    installable: true
  },
  {
    id: "anthropic-xlsx",
    name: "xlsx",
    description: "Create, edit, and analyze Excel spreadsheets using Anthropic's public spreadsheet skill.",
    usage: "Use for spreadsheet analysis, workbook creation, formulas, charts, and table transformations.",
    sourceName: "anthropics/skills",
    sourceUrl: "https://github.com/anthropics/skills/tree/main/skills/xlsx",
    repoUrl: "https://github.com/anthropics/skills.git",
    sourceSubdir: "skills/xlsx",
    languages: ["Markdown", "Python"],
    tags: ["documents", "spreadsheet", "xlsx", "official-reference"],
    installable: true
  },
  {
    id: "anthropic-pptx",
    name: "pptx",
    description: "Create, edit, and analyze PowerPoint presentations using Anthropic's public presentation skill.",
    usage: "Use when the agent needs to generate, inspect, or modify slide decks with a structured workflow.",
    sourceName: "anthropics/skills",
    sourceUrl: "https://github.com/anthropics/skills/tree/main/skills/pptx",
    repoUrl: "https://github.com/anthropics/skills.git",
    sourceSubdir: "skills/pptx",
    languages: ["Markdown", "Python"],
    tags: ["documents", "presentation", "pptx", "official-reference"],
    installable: true
  },
  {
    id: "anthropic-webapp-testing",
    name: "webapp-testing",
    description: "Test local web applications using browser automation patterns from Anthropic's public skills repo.",
    usage: "Use for verifying local web apps, screenshots, browser interactions, and regression checks.",
    sourceName: "anthropics/skills",
    sourceUrl: "https://github.com/anthropics/skills/tree/main/skills/webapp-testing",
    repoUrl: "https://github.com/anthropics/skills.git",
    sourceSubdir: "skills/webapp-testing",
    languages: ["Markdown", "JavaScript"],
    tags: ["web", "testing", "playwright", "official-reference"],
    installable: true
  },
  {
    id: "anthropic-mcp-builder",
    name: "mcp-builder",
    description: "Create MCP servers to integrate external APIs and services.",
    usage: "Use when building or packaging an MCP server with a repeatable implementation checklist.",
    sourceName: "anthropics/skills",
    sourceUrl: "https://github.com/anthropics/skills/tree/main/skills/mcp-builder",
    repoUrl: "https://github.com/anthropics/skills.git",
    sourceSubdir: "skills/mcp-builder",
    languages: ["Markdown", "TypeScript", "Python"],
    tags: ["mcp", "developer-tools", "official-reference"],
    installable: true
  },
  {
    id: "anthropic-skill-creator",
    name: "skill-creator",
    description: "Guide for creating skills that extend an agent with specialized workflows and resources.",
    usage: "Use when designing a new SKILL.md package, writing metadata, examples, scripts, or install docs.",
    sourceName: "anthropics/skills",
    sourceUrl: "https://github.com/anthropics/skills/tree/main/skills/skill-creator",
    repoUrl: "https://github.com/anthropics/skills.git",
    sourceSubdir: "skills/skill-creator",
    languages: ["Markdown"],
    tags: ["skill-authoring", "template", "official-reference"],
    installable: true
  },
  {
    id: "voltagent-awesome-agent-skills",
    name: "awesome-agent-skills",
    description: "A curated GitHub list of 1,400+ official and community Agent Skills compatible with Claude Code, Codex, Antigravity, Gemini CLI, Cursor, and more.",
    usage: "Use this as a discovery source when searching for more public skills to review before installation.",
    sourceName: "VoltAgent",
    sourceUrl: "https://github.com/VoltAgent/awesome-agent-skills",
    languages: ["Markdown"],
    tags: ["directory", "discovery", "community"],
    installable: false
  },
  {
    id: "antigravity-awesome-skills-directory",
    name: "Antigravity Awesome Skills",
    description: "Installable GitHub library with 1,500+ agentic skills, bundles, workflows, plugins, and official/community collections.",
    usage: "Use this as a large GitHub-backed skill library. SkillOps can search its index and install matching GitHub tree entries locally.",
    sourceName: "sickn33/antigravity-awesome-skills",
    sourceUrl: "https://github.com/sickn33/antigravity-awesome-skills",
    languages: ["Markdown"],
    tags: ["directory", "github", "antigravity", "community", "large-catalog"],
    installable: false
  },
  {
    id: "agensi-directory",
    name: "Agensi Marketplace",
    description: "AI Agent Skills marketplace with free, paid, and bundle listings across Claude Code, Codex CLI, Cursor, OpenClaw, and more.",
    usage: "Use this as a marketplace-style discovery source. Paid or account-gated skills should be reviewed and downloaded from Agensi directly.",
    sourceName: "Agensi",
    sourceUrl: "https://www.agensi.io/browse",
    languages: ["Markdown"],
    tags: ["directory", "marketplace", "paid", "community", "discovery"],
    installable: false
  },
  {
    id: "awesome-agent-skills-dev-directory",
    name: "Awesome Agent Skills",
    description: "Auto-updating directory covering skills, MCP servers, tools, Gemini extensions, and Cursor rules across multiple agent platforms.",
    usage: "Use this when you want a broad source index beyond SKILL.md-only catalogs, then install exact GitHub-backed entries locally.",
    sourceName: "awesomeagentskills.dev",
    sourceUrl: "https://awesomeagentskills.dev/",
    languages: ["Markdown"],
    tags: ["directory", "mcp", "tools", "auto-updated", "discovery"],
    installable: false
  },
  {
    id: "skillsmp-directory",
    name: "SkillsMP Directory",
    description: "Community marketplace for searching open-source SKILL.md agent skills from GitHub.",
    usage: "Use this as an external search directory when the built-in catalog does not contain the skill you need.",
    sourceName: "SkillsMP",
    sourceUrl: "https://skillsmp.com/",
    languages: ["Markdown"],
    tags: ["directory", "marketplace", "community"],
    installable: false
  },
  {
    id: "awesomeskills-directory",
    name: "Awesome Agent Skills Directory",
    description: "Searchable directory for Claude Code, Codex, Cursor, and compatible SKILL.md packages.",
    usage: "Use this for broader marketplace discovery; install manually with a GitHub URL or future registry connector.",
    sourceName: "AwesomeSkills",
    sourceUrl: "https://www.awesomeskills.dev/",
    languages: ["Markdown"],
    tags: ["directory", "marketplace", "community"],
    installable: false
  },
  {
    id: "awesomeskill-ai-directory",
    name: "Awesome Skill AI",
    description: "Marketplace-style directory for discovering open-source agent skills for Claude, Codex, and ChatGPT-compatible workflows.",
    usage: "Use this as a broad discovery directory, then install a specific GitHub skill URL through SkillOps for local linting.",
    sourceName: "AwesomeSkill.ai",
    sourceUrl: "https://awesomeskill.ai/",
    languages: ["Markdown"],
    tags: ["directory", "marketplace", "community", "discovery"],
    installable: false
  },
  {
    id: "skillsmd-directory",
    name: "SkillsMD Registry",
    description: "Open agent skills registry with directory-style discovery and repository metadata.",
    usage: "Use this to look for currently active or changing public skill repositories before copying a GitHub URL into SkillOps.",
    sourceName: "SkillsMD",
    sourceUrl: "https://skillsmd.dev/",
    languages: ["Markdown"],
    tags: ["directory", "registry", "community", "discovery"],
    installable: false
  },
  {
    id: "skillvault-directory",
    name: "Skill Vault",
    description: "Marketplace for skills, agents, hooks, and rules across Codex, Claude Code, Cursor, Gemini CLI, and related tools.",
    usage: "Use this as a wider ecosystem discovery source, then install only reviewed GitHub-backed skills locally.",
    sourceName: "SkillVault",
    sourceUrl: "https://skillvault.md/",
    languages: ["Markdown"],
    tags: ["directory", "marketplace", "agents", "hooks", "community"],
    installable: false
  },
  {
    id: "agent-skills-md-directory",
    name: "Agent-Skills.md",
    description: "Search directory for agent skills and SKILL.md packages across multiple agent runtimes.",
    usage: "Use this to find candidate skills by category or repository, then bring the exact GitHub URL back for local install.",
    sourceName: "Agent-Skills.md",
    sourceUrl: "https://agent-skills.md/",
    languages: ["Markdown"],
    tags: ["directory", "marketplace", "community", "discovery"],
    installable: false
  },
  {
    id: "skillsmk-directory",
    name: "SkillsMK",
    description: "Open-source agent skills marketplace that surfaces GitHub community skill libraries and SKILL.md deployment guidance.",
    usage: "Use this as another public source directory, then copy exact GitHub skill URLs into SkillOps for local lint and install.",
    sourceName: "SkillsMK",
    sourceUrl: "https://skillsmk.com/",
    languages: ["Markdown"],
    tags: ["directory", "marketplace", "github", "community"],
    installable: false
  },
  {
    id: "github-skill-md-code-search",
    name: "GitHub SKILL.md Code Search",
    description: "GitHub code search query for public repositories containing SKILL.md files.",
    usage: "Use this as the rawest discovery source when curated directories miss a niche skill. Review repository trust before installing.",
    sourceName: "GitHub Search",
    sourceUrl: "https://github.com/search?q=filename%3ASKILL.md&type=code",
    languages: ["Markdown"],
    tags: ["directory", "github", "search", "uncurated", "discovery"],
    installable: false
  }
];

type GitHubSkillSource = {
  owner: string;
  repo: string;
  branch: string;
  subdir?: string;
  sourceUrl: string;
  sourceName: string;
  lineDescription?: string;
};

const PUBLIC_SOURCE_LIMIT = 48;

async function fetchPublicMarketEntries(query: string): Promise<MarketCatalogEntry[]> {
  const sources = await Promise.allSettled([
    fetchVoltAgentAwesomeSkills(query),
    fetchAntigravityAwesomeSkills(query)
  ]);
  return sources.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

type AntigravityIndexEntry = {
  id?: string;
  path?: string;
  category?: string;
  name?: string;
  description?: string;
  risk?: string;
  source?: string;
};

async function fetchAntigravityAwesomeSkills(query: string): Promise<MarketCatalogEntry[]> {
  const raw = await fetchText("https://raw.githubusercontent.com/sickn33/antigravity-awesome-skills/main/skills_index.json");
  const parsed = JSON.parse(raw) as AntigravityIndexEntry[];
  const normalized = query.trim().toLowerCase();
  const entries: MarketCatalogEntry[] = [];
  const seen = new Set<string>();

  for (const item of parsed) {
    if (!item.path || !item.name) continue;
    const haystack = [item.name, item.description ?? "", item.category ?? "", item.risk ?? "", item.source ?? ""].join(" ").toLowerCase();
    if (normalized && !haystack.includes(normalized)) continue;
    const key = item.path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      id: stableId(["antigravity-awesome-skills", item.id ?? item.name]),
      name: item.name,
      description: item.description || `Public Agent Skill from sickn33/antigravity-awesome-skills (${item.category ?? "uncategorized"}).`,
      summary: item.description,
      usage: "Install from the GitHub library, then review the local lint result before enabling it in Codex, Claude, or the project.",
      sourceName: "sickn33/antigravity-awesome-skills",
      sourceUrl: `https://github.com/sickn33/antigravity-awesome-skills/tree/main/${item.path}`,
      repoUrl: "https://github.com/sickn33/antigravity-awesome-skills.git",
      sourceSubdir: item.path,
      languages: ["Markdown"],
      tags: unique(["community", "github", item.category, item.risk, item.source].filter(Boolean) as string[]).slice(0, 8),
      installable: true,
      fetchedAt: new Date().toISOString()
    });
    if (entries.length >= PUBLIC_SOURCE_LIMIT) break;
  }

  return entries;
}

async function fetchVoltAgentAwesomeSkills(query: string): Promise<MarketCatalogEntry[]> {
  const readme = await fetchText("https://raw.githubusercontent.com/VoltAgent/awesome-agent-skills/main/README.md");
  const candidates: GitHubSkillSource[] = [];
  const seen = new Set<string>();

  for (const line of readme.split("\n")) {
    if (!line.includes("github.com/")) continue;
    if (query && !line.toLowerCase().includes(query)) continue;
    const matches = line.matchAll(/\[[^\]]+\]\((https:\/\/github\.com\/[^)\s#]+)\)/g);
    for (const match of matches) {
      const parsed = parseGitHubSkillUrl(match[1]);
      if (!parsed?.subdir) continue;
      const key = `${parsed.owner}/${parsed.repo}/${parsed.subdir}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        ...parsed,
        sourceName: "VoltAgent/awesome-agent-skills",
        lineDescription: extractDescriptionFromLine(line)
      });
    }
    if (candidates.length >= PUBLIC_SOURCE_LIMIT) break;
  }

  const enriched = await Promise.all(candidates.map((candidate) => enrichGitHubSkill(candidate)));
  return enriched.filter((entry): entry is MarketCatalogEntry => Boolean(entry));
}

async function enrichGitHubSkill(source: GitHubSkillSource): Promise<MarketCatalogEntry | undefined> {
  const fallbackName = source.subdir ? path.basename(source.subdir) : source.repo;
  const fallbackDescription = source.lineDescription || `Public Agent Skill from ${source.owner}/${source.repo}.`;

  try {
    const skillMd = source.subdir
      ? await fetchText(rawGitHubUrl(source.owner, source.repo, source.branch, source.subdir, "SKILL.md"))
      : "";
    const parsed = matter(skillMd);
    const frontmatterName = typeof parsed.data.name === "string" ? parsed.data.name.trim() : "";
    const frontmatterDescription = typeof parsed.data.description === "string" ? parsed.data.description.trim() : "";
    const heading = parsed.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const name = frontmatterName || heading || fallbackName;
    const description = frontmatterDescription || fallbackDescription;
    return {
      id: stableId(["github", source.owner, source.repo, source.subdir]),
      name,
      description,
      summary: firstParagraph(parsed.content) || description,
      usage: `Use when you need ${description.replace(/\.$/, "")}. Install from GitHub, then review local lint results before use.`,
      sourceName: source.sourceName,
      sourceUrl: source.sourceUrl,
      repoUrl: `https://github.com/${source.owner}/${source.repo}.git`,
      sourceSubdir: source.subdir,
      languages: inferMarketLanguages(skillMd),
      tags: unique(["community", "github", "public-source", ...tagify(name), ...tagify(description)]).slice(0, 8),
      installable: true,
      fetchedAt: new Date().toISOString()
    };
  } catch {
    return {
      id: stableId(["github", source.owner, source.repo, source.subdir]),
      name: fallbackName,
      description: fallbackDescription,
      summary: fallbackDescription,
      usage: "Open the source, review the SKILL.md package, then install the GitHub tree URL locally.",
      sourceName: source.sourceName,
      sourceUrl: source.sourceUrl,
      repoUrl: `https://github.com/${source.owner}/${source.repo}.git`,
      sourceSubdir: source.subdir,
      languages: ["Markdown"],
      tags: ["community", "github", "directory"],
      installable: true,
      fetchedAt: new Date().toISOString()
    };
  }
}

function enrichMarketEntry(entry: MarketCatalogEntry, installedCapabilities: Capability[]): MarketSkill {
  const installed = buildInstalledSkillMap(installedCapabilities);
  const installedTargets = uniqueInstalledTargets([
    ...(installed.get(entry.name.toLowerCase()) ?? []),
    ...(installed.get(path.basename(entry.sourceSubdir ?? entry.name).toLowerCase()) ?? []),
    ...(installed.get(path.basename(entry.sourceUrl).toLowerCase()) ?? [])
  ]);
  const installedPath = installedTargets[0]?.path;
  return {
    ...entry,
    installed: installedTargets.length > 0,
    installedPath,
    installedTargets,
    quickCommands: buildQuickCommands(entry)
  };
}

function dedupeMarketEntries(entries: MarketCatalogEntry[]): MarketCatalogEntry[] {
  const byKey = new Map<string, MarketCatalogEntry>();
  for (const entry of entries) {
    const key = (entry.repoUrl && entry.sourceSubdir)
      ? `${entry.repoUrl}#${entry.sourceSubdir}`.toLowerCase()
      : entry.sourceUrl.toLowerCase();
    const existing = byKey.get(key);
    if (!existing || (!existing.installable && entry.installable)) {
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()];
}

async function findMarketEntry(skillId: string): Promise<MarketCatalogEntry | undefined> {
  return MARKET_CATALOG.find((item) => item.id === skillId)
    ?? (await fetchPublicMarketEntries("")).find((item) => item.id === skillId);
}

export async function searchMarketSkills(query: string, installedCapabilities: Capability[]): Promise<MarketSkill[]> {
  const normalized = query.trim().toLowerCase();
  const publicEntries = await fetchPublicMarketEntries(normalized).catch(() => []);
  const entries = dedupeMarketEntries([...MARKET_CATALOG, ...publicEntries]);

  return entries
    .filter((entry) => {
      if (!normalized) return true;
      const haystack = [
        entry.name,
        entry.description,
        entry.usage,
        entry.summary ?? "",
        entry.sourceName,
        entry.sourceUrl,
        ...entry.languages,
        ...entry.tags
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    })
    .map((entry) => enrichMarketEntry(entry, installedCapabilities));
}

export async function installMarketSkill(
  skillId: string,
  target: SkillInstallTarget,
  projectRoot: string,
  installedCapabilities: Capability[]
): Promise<InstallResult> {
  const entry = await findMarketEntry(skillId);
  if (!entry) throw new Error(`Unknown market skill: ${skillId}`);
  if (!entry.installable || !entry.repoUrl || !entry.sourceSubdir) {
    throw new Error(`${entry.name} is a directory entry and is not directly installable yet.`);
  }

  const installed = buildInstalledSkillMap(installedCapabilities);
  const existingTarget = installed.get(entry.name.toLowerCase())?.[0]
    ?? installed.get(path.basename(entry.sourceSubdir).toLowerCase())?.[0];
  if (existingTarget) {
    return alreadyInstalledResult(existingTarget.path, entry.name, target, {
      sourceUrl: entry.sourceUrl,
      sourceType: "market"
    });
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), "skillops-market-"));
  try {
    await runGit(["clone", "--depth", "1", entry.repoUrl, tempRoot]);
    const sourceDir = path.join(tempRoot, entry.sourceSubdir);
    if (!existsSync(path.join(sourceDir, "SKILL.md"))) {
      throw new Error(`Market entry does not contain SKILL.md at ${entry.sourceSubdir}`);
    }

    const targetDir = getSkillTargetDir(target, projectRoot);
    await mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, entry.name);
    if (existsSync(targetPath)) {
      return alreadyInstalledResult(targetPath, entry.name, target, {
        sourceUrl: entry.sourceUrl,
        sourceType: "market"
      });
    }

    await cp(sourceDir, targetPath, {
      recursive: true,
      filter: (source) => !source.includes(`${path.sep}.git${path.sep}`) && !source.includes("node_modules")
    });
    await writeSkillInstallRecord(targetPath, {
      schemaVersion: "skillops.install.v1",
      sourceType: "market",
      sourceUrl: entry.sourceUrl,
      repoUrl: entry.repoUrl,
      sourceSubdir: entry.sourceSubdir,
      branch: "main",
      installedCommit: await currentGitCommit(tempRoot),
      installedAt: new Date().toISOString(),
      installedBy: "skillops"
    });
    const lint = await lintSkill(targetPath, target === "project" ? "project" : target);
    await recordHistory("skill.install", entry.name, {
      target,
      targetPath,
      sourceUrl: entry.sourceUrl,
      sourceType: "market"
    });
    return { name: entry.name, target, targetPath, lint };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function installGitHubSkill(
  source: string,
  target: SkillInstallTarget,
  projectRoot: string,
  installedCapabilities: Capability[]
): Promise<InstallResult> {
  const parsed = parseGitHubSource(source);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "skillops-github-"));
  try {
    await runGit(["clone", "--depth", "1", ...(parsed.branch ? ["--branch", parsed.branch] : []), parsed.repoUrl, tempRoot]);
    const candidates = parsed.subdir
      ? [path.join(tempRoot, parsed.subdir)]
      : await findSkillDirs(tempRoot);
    if (candidates.length === 0) throw new Error("No SKILL.md file found in the GitHub source.");
    if (candidates.length > 1) {
      throw new Error(`Multiple skills found. Use a GitHub tree URL for one folder. Found: ${candidates.slice(0, 5).join(", ")}`);
    }

    const sourceDir = candidates[0];
    const preview = await lintSkill(sourceDir);
    const installed = buildInstalledSkillMap(installedCapabilities);
    const existingTarget = installed.get(preview.name.toLowerCase())?.[0]
      ?? installed.get(path.basename(sourceDir).toLowerCase())?.[0];
    if (existingTarget) {
      return alreadyInstalledResult(existingTarget.path, preview.name, target, {
        sourceUrl: source,
        sourceType: "github"
      });
    }

    const targetDir = getSkillTargetDir(target, projectRoot);
    await mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, preview.name);
    if (existsSync(targetPath)) {
      return alreadyInstalledResult(targetPath, preview.name, target, {
        sourceUrl: source,
        sourceType: "github"
      });
    }

    await cp(sourceDir, targetPath, {
      recursive: true,
      filter: (filePath) => !filePath.includes(`${path.sep}.git${path.sep}`) && !filePath.includes("node_modules")
    });
    await writeSkillInstallRecord(targetPath, {
      schemaVersion: "skillops.install.v1",
      sourceType: "github",
      sourceUrl: source,
      repoUrl: parsed.repoUrl,
      sourceSubdir: parsed.subdir,
      branch: parsed.branch,
      installedCommit: await currentGitCommit(tempRoot),
      installedAt: new Date().toISOString(),
      installedBy: "skillops"
    });
    const lint = await lintSkill(targetPath, target === "project" ? "project" : target);
    await recordHistory("skill.install", lint.name, {
      target,
      targetPath,
      sourceUrl: source,
      sourceType: "github"
    });
    return { name: lint.name, target, targetPath, lint };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function alreadyInstalledResult(
  targetPath: string,
  fallbackName: string,
  target: SkillInstallTarget,
  historyMeta: Record<string, string>
): Promise<InstallResult> {
  const skillMdPath = path.join(targetPath, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    throw new Error(`Target path already exists and is not a skill folder: ${targetPath}`);
  }

  const lint = await lintSkill(targetPath, target === "project" ? "project" : target);
  await recordHistory("skill.install.exists", lint.name || fallbackName, {
    target,
    targetPath,
    ...historyMeta
  });
  return {
    name: lint.name || fallbackName,
    target,
    targetPath,
    lint
  };
}

function getSkillTargetDir(target: SkillInstallTarget, projectRoot: string): string {
  if (target === "codex") return path.join(homedir(), ".codex", "skills");
  if (target === "claude") return path.join(homedir(), ".claude", "skills");
  return path.join(projectRoot, "skills");
}

function buildInstalledSkillMap(capabilities: Capability[]): Map<string, InstalledTarget[]> {
  const map = new Map<string, InstalledTarget[]>();
  for (const capability of capabilities) {
    if (capability.type !== "skill" || !capability.path) continue;
    const target = describeInstalledTarget(capability.path);
    const keys = unique([capability.name.toLowerCase(), path.basename(capability.path).toLowerCase()]);
    for (const key of keys) {
      const existing = map.get(key) ?? [];
      if (!existing.some((item) => item.path === target.path)) existing.push(target);
      map.set(key, existing);
    }
  }
  return map;
}

function describeInstalledTarget(skillPath: string): InstalledTarget {
  const resolved = path.resolve(skillPath);
  const home = homedir();
  const user = path.basename(home);
  const roots: Array<{ root: string; platform: string; target: InstalledTarget["target"] }> = [
    { root: path.join(home, ".codex", "skills"), platform: "Codex", target: "codex" },
    { root: path.join(home, ".claude", "skills"), platform: "Claude", target: "claude" },
    { root: path.join(home, ".agents", "skills"), platform: "Agents", target: "agents" }
  ];

  const matched = roots.find((item) => resolved.startsWith(`${path.resolve(item.root)}${path.sep}`));
  if (matched) return { platform: matched.platform, target: matched.target, user, path: resolved };
  if (/\/skills\/[^/]+$/.test(resolved)) return { platform: "Project", target: "project", user, path: resolved };
  return { platform: "Unknown", target: "unknown", user, path: resolved };
}

function uniqueInstalledTargets(targets: InstalledTarget[]): InstalledTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    if (seen.has(target.path)) return false;
    seen.add(target.path);
    return true;
  });
}

function buildQuickCommands(entry: MarketCatalogEntry): QuickCommand[] {
  const source = getInstallSource(entry);
  if (!source) {
    return [
      {
        label: "Open directory",
        command: entry.sourceUrl,
        description: "Open this directory source, copy a GitHub skill URL, then install it locally."
      }
    ];
  }

  return [
    {
      label: "Codex",
      command: `skillops market install "${source}" --target codex --yes`,
      description: "Install this skill into ~/.codex/skills for Codex."
    },
    {
      label: "Claude",
      command: `skillops market install "${source}" --target claude --yes`,
      description: "Install this skill into ~/.claude/skills for Claude Code."
    },
    {
      label: "Project",
      command: `skillops market install "${source}" --target project --yes`,
      description: "Install this skill into ./skills for the current project."
    }
  ];
}

function getInstallSource(entry: MarketCatalogEntry): string | undefined {
  if (entry.sourceUrl.includes("github.com") && entry.sourceSubdir) return entry.sourceUrl;
  if (!entry.repoUrl || !entry.sourceSubdir) return undefined;
  const parsed = entry.repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)\.git$/);
  if (!parsed) return undefined;
  return `https://github.com/${parsed[1]}/${parsed[2]}/tree/main/${entry.sourceSubdir}`;
}

async function findSkillDirs(root: string): Promise<string[]> {
  const skillFiles = await fg(["**/SKILL.md"], {
    cwd: root,
    onlyFiles: true,
    unique: true,
    dot: true,
    ignore: ["node_modules/**", ".git/**"]
  });
  return skillFiles.map((file) => path.join(root, path.dirname(file)));
}

export function parseGitHubSource(source: string): { repoUrl: string; subdir?: string; branch?: string } {
  const trimmed = source.trim();
  if (!trimmed) throw new Error("GitHub source is required.");

  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
    return { repoUrl: `https://github.com/${trimmed}.git` };
  }

  const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    throw new Error("Only GitHub sources are supported in V0.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("GitHub URL must include owner and repo.");
  const [owner, repoRaw] = parts;
  const repo = repoRaw.replace(/\.git$/, "");
  const treeIndex = parts.indexOf("tree");
  const branch = treeIndex >= 0 && parts.length > treeIndex + 1 ? parts[treeIndex + 1] : undefined;
  const subdir = treeIndex >= 0 && parts.length > treeIndex + 2
    ? parts.slice(treeIndex + 2).join("/")
    : undefined;
  return { repoUrl: `https://github.com/${owner}/${repo}.git`, subdir, branch };
}

function parseGitHubSkillUrl(input: string): GitHubSkillSource | undefined {
  try {
    const url = new URL(input);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return undefined;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return undefined;
    const [owner, repoRaw] = parts;
    const repo = repoRaw.replace(/\.git$/, "");
    const treeIndex = parts.indexOf("tree");
    const blobIndex = parts.indexOf("blob");
    const markerIndex = treeIndex >= 0 ? treeIndex : blobIndex;
    const branch = markerIndex >= 0 && parts.length > markerIndex + 1 ? parts[markerIndex + 1] : "main";
    let subdir = markerIndex >= 0 && parts.length > markerIndex + 2
      ? parts.slice(markerIndex + 2).join("/")
      : undefined;
    if (subdir?.endsWith("/SKILL.md")) subdir = subdir.slice(0, -"/SKILL.md".length);
    if (subdir === "SKILL.md") subdir = undefined;
    return {
      owner,
      repo,
      branch,
      subdir,
      sourceUrl: `https://github.com/${owner}/${repo}${subdir ? `/tree/${branch}/${subdir}` : ""}`,
      sourceName: `${owner}/${repo}`
    };
  } catch {
    return undefined;
  }
}

function rawGitHubUrl(owner: string, repo: string, branch: string, subdir: string, file: string): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${subdir}/${file}`;
}

async function fetchText(url: string): Promise<string> {
  const cacheDir = path.join(homedir(), ".skillops", "cache");
  const urlHash = crypto.createHash("md5").update(url).digest("hex");
  const cachePath = path.join(cacheDir, urlHash);

  // Attempt to read from cache first (if less than 24 hours old, or if network fails)
  try {
    const stats = await import("node:fs/promises").then(m => m.stat(cachePath));
    const isStale = Date.now() - stats.mtimeMs > 24 * 60 * 60 * 1000;
    if (!isStale) {
      return await readFile(cachePath, "utf-8");
    }
  } catch (err) {
    // Cache miss or error
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "skillops-local" }
    });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    const text = await response.text();
    
    // Save to cache asynchronously
    mkdir(cacheDir, { recursive: true }).then(() => writeFile(cachePath, text)).catch(() => {});
    
    return text;
  } catch (err) {
    // On network failure, fallback to stale cache if it exists
    try {
      return await readFile(cachePath, "utf-8");
    } catch {
      throw err;
    }
  } finally {
    clearTimeout(timeout);
  }
}

function extractDescriptionFromLine(line: string): string {
  const withoutLinkSyntax = line
    .replace(/^\s*[-*]\s*/, "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .replace(/[`*_]/g, "")
    .replace(/^\s*[-:–—]\s*/, "")
    .trim();
  return withoutLinkSyntax || "Public Agent Skill discovered from a curated community directory.";
}

export function firstParagraph(markdown: string): string {
  return markdown
    .replace(/^---[\s\S]*?---/, "")
    .split(/\n{2,}/)
    .map((block) => block.replace(/^#+\s+/gm, "").trim())
    .find((block) => block && !block.startsWith("```") && block.length > 20)
    ?.slice(0, 240) ?? "";
}

function inferMarketLanguages(text: string): string[] {
  const languages = new Set<string>(["Markdown"]);
  if (/```(?:python|py)\b/i.test(text)) languages.add("Python");
  if (/```(?:ts|typescript)\b/i.test(text)) languages.add("TypeScript");
  if (/```(?:js|javascript|node)\b/i.test(text)) languages.add("JavaScript");
  if (/```(?:bash|sh|zsh|shell)\b/i.test(text)) languages.add("Shell");
  return [...languages];
}

function tagify(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .slice(0, 4);
}

async function runGit(args: string[]): Promise<void> {
  const isClone = args[0] === "clone";
  const maxRetries = isClone ? 3 : 1;
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const currentArgs = (i > 0 && isClone)
        ? ["-c", "http.postBuffer=524288000", "-c", "core.compression=0", ...args]
        : args;
      await gitOutput(currentArgs);
      return;
    } catch (err) {
      lastError = err;
      if (isClone && i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
      }
    }
  }
  throw lastError;
}
