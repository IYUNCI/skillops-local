import path from "node:path";
import { homedir } from "node:os";
import { writeFile } from "node:fs/promises";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import yaml from "yaml";
import type { CapabilitySource, McpServerConfig, MpcTransport } from "./types.js";
import { fileExists, readText } from "./utils.js";

type RawMcpServer = {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, unknown>;
  type?: string;
  transport?: string;
};

export async function findMcpConfigs(root: string, includeHome = true): Promise<string[]> {
  const homeCandidates = [
    path.join(homedir(), ".codex", "config.toml"),
    path.join(homedir(), ".cursor", "mcp.json"),
    path.join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json")
  ];

  const projectCandidates = [
    path.join(root, ".mcp.json"),
    path.join(root, "mcp.json"),
    path.join(root, ".cursor", "mcp.json"),
    path.join(root, ".vscode", "mcp.json")
  ];

  const candidates = includeHome ? [...homeCandidates, ...projectCandidates] : projectCandidates;

  const existing: string[] = [];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) existing.push(candidate);
  }
  return [...new Set(existing)];
}

export async function loadMcpServers(configPath: string): Promise<McpServerConfig[]> {
  const text = await readText(configPath);
  const ext = path.extname(configPath).toLowerCase();
  const source = sourceFromPath(configPath);

  const data = parseMcpConfig(text, ext);

  return normalizeMcpServers(data, configPath, source);
}

export async function removeMcpServerConfig(configPath: string, name: string): Promise<{ configPath: string; name: string }> {
  const text = await readText(configPath);
  const ext = path.extname(configPath).toLowerCase();
  const data = parseMcpConfig(text, ext) as Record<string, unknown>;
  const servers = findWritableMcpServers(data);

  if (!servers || !Object.prototype.hasOwnProperty.call(servers, name)) {
    throw new Error(`MCP server not found in config: ${name}`);
  }

  delete servers[name];
  await writeFile(configPath, serializeMcpConfig(data, ext), "utf8");
  return { configPath, name };
}

export function normalizeMcpServers(data: unknown, configPath: string, source: CapabilitySource): McpServerConfig[] {
  const root = data as Record<string, unknown>;
  const rawServers =
    asRecord(root.mcpServers) ??
    asRecord(root.mcp_servers) ??
    asRecord(root.servers);

  if (!rawServers) return [];

  return Object.entries(rawServers)
    .map(([name, raw]) => normalizeOne(name, raw as RawMcpServer, configPath, source))
    .filter((server): server is McpServerConfig => Boolean(server));
}

function normalizeOne(
  name: string,
  raw: RawMcpServer,
  configPath: string,
  source: CapabilitySource
): McpServerConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const url = typeof raw.url === "string" ? raw.url : undefined;
  const command = typeof raw.command === "string" ? raw.command : undefined;
  const args = Array.isArray(raw.args) ? raw.args.map(String) : [];
  const env = Object.fromEntries(
    Object.entries(raw.env ?? {}).map(([key, value]) => [key, value == null ? "" : String(value)])
  );

  return {
    name,
    transport: inferTransport(raw, command, url),
    command,
    args,
    url,
    env,
    configPath,
    source
  };
}

function inferTransport(raw: RawMcpServer, command?: string, url?: string): MpcTransport {
  const declared = String(raw.transport ?? raw.type ?? "").toLowerCase();
  if (declared.includes("stdio")) return "stdio";
  if (declared.includes("sse")) return "sse";
  if (declared.includes("http")) return "http";
  if (command) return "stdio";
  if (url?.includes("/sse")) return "sse";
  if (url) return "http";
  return "unknown";
}


function parseMcpConfig(text: string, ext: string): unknown {
  if (ext === ".toml") return parseToml(text);
  if (ext === ".yaml" || ext === ".yml") return yaml.parse(text);
  return JSON.parse(text);
}

function serializeMcpConfig(data: unknown, ext: string): string {
  if (ext === ".toml") return stringifyToml(data as Record<string, unknown>);
  if (ext === ".yaml" || ext === ".yml") return yaml.stringify(data);
  return `${JSON.stringify(data, null, 2)}\n`;
}

function findWritableMcpServers(root: Record<string, unknown>): Record<string, unknown> | undefined {
  return asRecord(root.mcpServers) ?? asRecord(root.mcp_servers) ?? asRecord(root.servers);
}

function asRecord(input: unknown): Record<string, unknown> | undefined {
  if (input && typeof input === "object" && !Array.isArray(input)) return input as Record<string, unknown>;
  return undefined;
}

function sourceFromPath(configPath: string): CapabilitySource {
  if (configPath.includes(".codex")) return "codex";
  if (configPath.includes(".claude") || configPath.includes("Claude")) return "claude";
  if (configPath.includes(".cursor")) return "cursor";
  if (configPath.includes(".vscode")) return "vscode";
  return "project";
}
