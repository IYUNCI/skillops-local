import path from "node:path";
import { homedir } from "node:os";
import fg from "fast-glob";
import type { Capability, Issue } from "./types.js";
import { lintSkill } from "./skill-lint.js";
import { findMcpConfigs, loadMcpServers } from "./mcp-config.js";
import { doctorMcpServer } from "./mcp-doctor.js";
import { inferPermissions } from "./detect.js";
import { healthFromIssues, mergeRisk } from "./risk.js";
import { fileExists, readText, stableId, unique } from "./utils.js";

export type ScanOptions = {
  root: string;
  includeHome?: boolean;
  probeMcp?: boolean;
};

export async function scanCapabilities(options: ScanOptions): Promise<Capability[]> {
  const root = path.resolve(options.root);
  const [skills, mcpServers, projectArtifacts] = await Promise.all([
    scanSkills(root, options.includeHome ?? true),
    scanMcpServers(root, options.probeMcp ?? false, options.includeHome ?? true),
    scanProjectArtifacts(root)
  ]);

  return [...skills, ...mcpServers, ...projectArtifacts].sort((a, b) => a.name.localeCompare(b.name));
}

async function scanSkills(root: string, includeHome: boolean): Promise<Capability[]> {
  const patterns = [
    path.join(root, ".claude", "skills", "*", "SKILL.md"),
    path.join(root, ".codex", "skills", "*", "SKILL.md"),
    path.join(root, "skills", "*", "SKILL.md")
  ];

  if (includeHome) {
    patterns.push(
      path.join(homedir(), ".codex", "skills", "*", "SKILL.md"),
      path.join(homedir(), ".agents", "skills", "*", "SKILL.md"),
      path.join(homedir(), ".claude", "skills", "*", "SKILL.md"),
      path.join(homedir(), ".codex", "plugins", "cache", "*", "*", "skills", "*", "SKILL.md"),
      path.join(homedir(), ".codex", "plugins", "cache", "*", "*", "skills", "*", "*", "SKILL.md")
    );
  }

  const files = await fg(patterns.map((pattern) => pattern.replaceAll("\\", "/")), {
    onlyFiles: true,
    unique: true,
    dot: true
  });

  const skillDirs = unique(files.map((file) => path.dirname(file)));
  const results = await Promise.all(
    skillDirs.map(async (skillDir) => {
      try {
        return await lintSkill(skillDir, sourceFromSkillPath(skillDir, root));
      } catch (error) {
        return {
          id: stableId(["skill", skillDir]),
          type: "skill" as const,
          name: path.basename(skillDir),
          source: sourceFromSkillPath(skillDir, root),
          path: skillDir,
          language: [],
          permissions: [],
          health: "broken" as const,
          risk: "high" as const,
          issues: [
            {
              severity: "P1" as const,
              code: "skill.scan-failed",
              title: "Failed to scan skill",
              evidence: error instanceof Error ? error.message : String(error)
            }
          ]
        };
      }
    })
  );

  return results;
}

async function scanMcpServers(root: string, probeMcp: boolean, includeHome: boolean): Promise<Capability[]> {
  const configs = await findMcpConfigs(root, includeHome);
  const capabilities: Capability[] = [];

  for (const configPath of configs) {
    let servers = [];
    try {
      servers = await loadMcpServers(configPath);
    } catch (error) {
      capabilities.push({
        id: stableId(["mcp-config", configPath]),
        type: "mcp_server",
        name: path.basename(configPath),
        source: sourceFromConfigPath(configPath, root),
        configPath,
        language: [],
        permissions: [],
        health: "broken",
        risk: "medium",
        issues: [
          {
            severity: "P1",
            code: "mcp.config-parse-failed",
            title: "Failed to parse MCP config",
            evidence: error instanceof Error ? error.message : String(error)
          }
        ]
      });
      continue;
    }

    for (const server of servers) {
      if (probeMcp) {
        const doctor = await doctorMcpServer(server);
        capabilities.push({
          id: stableId(["mcp", server.source, server.name, server.configPath]),
          type: "mcp_server",
          name: server.name,
          description: `${server.transport} MCP server`,
          source: server.source,
          configPath: server.configPath,
          language: inferMcpLanguage(server.command, server.args),
          permissions: unique(doctor.tools.flatMap((tool) => tool.permissions)),
          health: doctor.health,
          risk: doctor.risk,
          issues: doctor.issues
        });
      } else {
        capabilities.push({
          id: stableId(["mcp", server.source, server.name, server.configPath]),
          type: "mcp_server",
          name: server.name,
          description: `${server.transport} MCP server`,
          source: server.source,
          configPath: server.configPath,
          language: inferMcpLanguage(server.command, server.args),
          permissions: inferPermissions([server.command, ...server.args, server.url].filter(Boolean).join(" ")),
          health: "unknown",
          risk: "low",
          issues: []
        });
      }
    }
  }

  return capabilities;
}

async function scanProjectArtifacts(root: string): Promise<Capability[]> {
  const candidates = [
    { type: "command" as const, file: path.join(root, "AGENTS.md") },
    { type: "command" as const, file: path.join(root, "CLAUDE.md") },
    { type: "hook" as const, file: path.join(root, ".claude", "settings.json") },
    { type: "hook" as const, file: path.join(root, ".codex", "config.toml") }
  ];

  const capabilities: Capability[] = [];
  for (const candidate of candidates) {
    if (!(await fileExists(candidate.file))) continue;
    const text = await readText(candidate.file);
    const permissions = inferPermissions(text);
    const issues: Issue[] = [];
    capabilities.push({
      id: stableId([candidate.type, candidate.file]),
      type: candidate.type,
      name: path.basename(candidate.file),
      description: `${candidate.type} configuration file`,
      source: "project",
      path: candidate.file,
      language: ["Markdown"],
      permissions,
      health: healthFromIssues(issues),
      risk: mergeRisk(permissions, issues),
      issues
    });
  }
  return capabilities;
}

function sourceFromSkillPath(skillDir: string, root: string): Capability["source"] {
  if (skillDir.startsWith(root)) return "project";
  if (skillDir.includes(".codex")) return "codex";
  if (skillDir.includes(".claude")) return "claude";
  return "unknown";
}

function sourceFromConfigPath(configPath: string, root: string): Capability["source"] {
  if (configPath.startsWith(root)) return "project";
  if (configPath.includes(".codex")) return "codex";
  if (configPath.includes(".claude") || configPath.includes("Claude")) return "claude";
  if (configPath.includes(".cursor")) return "cursor";
  if (configPath.includes(".vscode")) return "vscode";
  return "unknown";
}

function inferMcpLanguage(command = "", args: string[] = []): string[] {
  const text = [command, ...args].join(" ");
  if (/\b(?:node|npx|npm|pnpm|yarn|bun|tsx|ts-node)\b/.test(text)) return ["TypeScript", "JavaScript"];
  if (/\b(?:python|python3|uv|uvx|pipx)\b/.test(text)) return ["Python"];
  if (/\bdocker\b/.test(text)) return ["Docker"];
  if (/\bgo\b/.test(text)) return ["Go"];
  if (/\bcargo\b/.test(text)) return ["Rust"];
  return [];
}
