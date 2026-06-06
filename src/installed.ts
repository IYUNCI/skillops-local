import path from "node:path";
import { homedir } from "node:os";
import type { Capability, Health, PermissionHint, RiskLevel } from "./types.js";
import { scanCapabilities } from "./scan.js";
import { loadMcpServers } from "./mcp-config.js";
import { scanCliTools, type CliTool, type CliQuickCommand } from "./cli-market.js";
import { readText, stableId, unique } from "./utils.js";

export type InstalledKind = "skill" | "mcp_server" | "cli";

export type InstalledQuickCommand = CliQuickCommand;

export type InstalledInventoryItem = {
  id: string;
  capabilityId?: string;
  kind: InstalledKind;
  name: string;
  description: string;
  usage: string;
  sourceName: string;
  sourceUrl?: string;
  path?: string;
  configPath?: string;
  command?: string;
  installCommand?: string;
  uninstallCommand?: string;
  installedPath?: string;
  version?: string;
  installedFor: string;
  languages: string[];
  permissions: PermissionHint[];
  health: Health;
  risk: RiskLevel;
  tags: string[];
  quickCommands: InstalledQuickCommand[];
};

export type InstalledInventory = {
  items: InstalledInventoryItem[];
  summary: {
    total: number;
    skills: number;
    mcpServers: number;
    cliTools: number;
  };
};

export async function getInstalledInventory(options: {
  root: string;
  includeHome?: boolean;
  probeMcp?: boolean;
  query?: string;
}): Promise<InstalledInventory> {
  const [capabilities, cliTools] = await Promise.all([
    scanCapabilities({
      root: options.root,
      includeHome: options.includeHome ?? true,
      probeMcp: options.probeMcp ?? false
    }),
    scanCliTools()
  ]);

  const capabilityItems = await Promise.all(
    capabilities
      .filter((capability) => capability.type === "skill" || capability.type === "mcp_server")
      .map((capability) => capabilityToInstalledItem(capability, options.root))
  );
  const cliItems = cliTools.filter((tool) => tool.installed).map(cliToInstalledItem);
  const items = [...capabilityItems, ...cliItems]
    .filter((item): item is InstalledInventoryItem => Boolean(item))
    .sort((a, b) => {
      const kindOrder: Record<InstalledKind, number> = { skill: 0, mcp_server: 1, cli: 2 };
      const kindDiff = kindOrder[a.kind] - kindOrder[b.kind];
      if (kindDiff !== 0) return kindDiff;
      return a.name.localeCompare(b.name);
    });

  const filtered = filterInstalledItems(items, options.query ?? "");
  return {
    items: filtered,
    summary: {
      total: filtered.length,
      skills: filtered.filter((item) => item.kind === "skill").length,
      mcpServers: filtered.filter((item) => item.kind === "mcp_server").length,
      cliTools: filtered.filter((item) => item.kind === "cli").length
    }
  };
}

async function capabilityToInstalledItem(capability: Capability, root: string): Promise<InstalledInventoryItem | undefined> {
  if (capability.type === "skill") return skillToInstalledItem(capability);
  if (capability.type === "mcp_server") return mcpToInstalledItem(capability, root);
  return undefined;
}

async function skillToInstalledItem(capability: Capability): Promise<InstalledInventoryItem> {
  const description = capability.description?.trim() || await extractSkillSummary(capability.path) || `Installed skill named ${capability.name}.`;
  const skillFile = capability.path ? path.join(capability.path, "SKILL.md") : undefined;
  const installedFor = describeInstalledTarget(capability.path, capability.source);
  return {
    id: stableId(["installed", capability.type, capability.id]),
    capabilityId: capability.id,
    kind: "skill",
    name: capability.name,
    description,
    usage: `Use by asking the agent for work related to: ${description.replace(/\.$/, "")}. You can also mention the skill name directly when you want this workflow.`,
    sourceName: sourceLabel(capability.source),
    path: capability.path,
    installedFor,
    languages: capability.language,
    permissions: capability.permissions,
    health: capability.health,
    risk: capability.risk,
    tags: unique(["skill", capability.source, ...capability.language]).slice(0, 8),
    quickCommands: [
      ...(capability.path ? [
        {
          label: "Lint",
          command: `skillops lint "${capability.path}"`,
          description: "Run a focused local lint check on this installed skill."
        },
        {
          label: "Share pack",
          command: `skillops share "${capability.path}" --out .skillops/share`,
          description: "Create a local share package for this installed skill."
        }
      ] : []),
      ...(skillFile ? [
        {
          label: "Edit",
          command: `$EDITOR "${skillFile}"`,
          description: "Open the skill entrypoint in your editor."
        }
      ] : []),
      {
        label: "Scan all",
        command: "skillops scan --json",
        description: "Query all installed skills and MCP servers as JSON."
      }
    ]
  };
}

async function mcpToInstalledItem(capability: Capability, root: string): Promise<InstalledInventoryItem> {
  const server = await findMcpServerForCapability(capability);
  const command = server?.command ? [server.command, ...server.args].join(" ") : server?.url;
  const commandIntro = command ? ` via ${command}` : "";
  const description = capability.description?.trim() && capability.description !== `${server?.transport ?? "unknown"} MCP server`
    ? capability.description
    : `${server?.transport ?? "Configured"} MCP server${commandIntro}.`;
  return {
    id: stableId(["installed", capability.type, capability.id]),
    capabilityId: capability.id,
    kind: "mcp_server",
    name: capability.name,
    description,
    usage: `Provides tools to agents through the MCP configuration in ${capability.configPath ?? "a local config file"}. Probe it when you need live tool descriptions and health checks.`,
    sourceName: sourceLabel(capability.source),
    configPath: capability.configPath,
    command,
    installedFor: describeInstalledTarget(capability.configPath, capability.source),
    languages: capability.language,
    permissions: capability.permissions,
    health: capability.health,
    risk: capability.risk,
    tags: unique(["mcp", capability.source, server?.transport, ...capability.language].filter(Boolean) as string[]).slice(0, 8),
    quickCommands: [
      {
        label: "Doctor",
        command: `skillops doctor mcp "${capability.name}" --root "${root}"`,
        description: "Run a focused health check for this MCP server."
      },
      {
        label: "Probe all MCP",
        command: `skillops scan --root "${root}" --probe-mcp --json`,
        description: "Query installed skills and MCP servers, including live MCP probing."
      },
      ...(capability.configPath ? [
        {
          label: "Edit config",
          command: `$EDITOR "${capability.configPath}"`,
          description: "Open the MCP config file in your editor."
        }
      ] : [])
    ]
  };
}

function cliToInstalledItem(tool: CliTool): InstalledInventoryItem {
  return {
    id: stableId(["installed", "cli", tool.id]),
    kind: "cli",
    name: tool.name,
    description: tool.description,
    usage: tool.usage,
    sourceName: tool.sourceName,
    sourceUrl: tool.sourceUrl,
    command: tool.command,
    installCommand: tool.installCommand,
    uninstallCommand: tool.uninstallCommand,
    installedPath: tool.installedPath,
    version: tool.version,
    installedFor: path.basename(homedir()),
    languages: tool.languages,
    permissions: ["shell"],
    health: "ok",
    risk: tool.tags.includes("ai-agent") ? "medium" : "low",
    tags: unique(["cli", ...tool.tags]).slice(0, 8),
    quickCommands: tool.quickCommands
  };
}

async function extractSkillSummary(skillPath?: string): Promise<string | undefined> {
  if (!skillPath) return undefined;
  try {
    const raw = await readText(path.join(skillPath, "SKILL.md"));
    const withoutFrontmatter = raw.replace(/^---[\s\S]*?---\s*/, "");
    const heading = withoutFrontmatter.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const paragraph = withoutFrontmatter
      .split(/\n\s*\n/)
      .map((block) => block.replace(/^#+\s*/, "").trim())
      .find((block) => block.length > 24 && !block.startsWith("```"));
    return (paragraph || heading)?.replace(/\s+/g, " ").slice(0, 260);
  } catch {
    return undefined;
  }
}

async function findMcpServerForCapability(capability: Capability) {
  if (!capability.configPath) return undefined;
  try {
    const servers = await loadMcpServers(capability.configPath);
    return servers.find((server) => server.name === capability.name);
  } catch {
    return undefined;
  }
}

function filterInstalledItems(items: InstalledInventoryItem[], query: string): InstalledInventoryItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => [
    item.kind,
    item.name,
    item.description,
    item.usage,
    item.sourceName,
    item.path ?? "",
    item.configPath ?? "",
    item.command ?? "",
    item.installedPath ?? "",
    item.version ?? "",
    item.installedFor,
    ...item.languages,
    ...item.permissions,
    ...item.tags
  ].join(" ").toLowerCase().includes(normalized));
}

function describeInstalledTarget(itemPath: string | undefined, source: Capability["source"]): string {
  const user = path.basename(homedir());
  if (!itemPath) return `${sourceLabel(source)} / ${user}`;
  const resolved = path.resolve(itemPath);
  const home = homedir();
  if (resolved.includes(path.join(home, ".codex"))) return `Codex / ${user}`;
  if (resolved.includes(path.join(home, ".claude")) || resolved.includes("Claude")) return `Claude / ${user}`;
  if (resolved.includes(path.join(home, ".agents"))) return `Agents / ${user}`;
  if (resolved.startsWith(path.resolve(process.cwd()))) return `Project / ${user}`;
  return `${sourceLabel(source)} / ${user}`;
}

function sourceLabel(source: Capability["source"]): string {
  if (source === "codex") return "Codex";
  if (source === "claude") return "Claude";
  if (source === "cursor") return "Cursor";
  if (source === "vscode") return "VS Code";
  if (source === "project") return "Project";
  return "Unknown";
}
