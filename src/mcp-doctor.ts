import { spawn, spawnSync } from "node:child_process";
import type { Issue, McpDoctorResult, McpServerConfig, McpToolInfo, PermissionHint } from "./types.js";
import { toolRisk } from "./detect.js";
import { healthFromIssues, mergeRisk } from "./risk.js";
import { loadMcpServers, findMcpConfigs } from "./mcp-config.js";

type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  result?: unknown;
  error?: { code: number; message: string };
};

export async function doctorMcpByNameOrPath(input: string, root: string): Promise<McpDoctorResult> {
  const servers = await loadTargetServers(input, root);
  const exact = servers.find((server) => server.name === input) ?? servers[0];
  if (!exact) {
    const placeholder: McpServerConfig = {
      name: input,
      transport: "unknown",
      args: [],
      env: {},
      configPath: input,
      source: "unknown"
    };
    return {
      server: placeholder,
      health: "broken",
      risk: "medium",
      tools: [],
      issues: [
        {
          severity: "P1",
          code: "mcp.not-found",
          title: "MCP server was not found",
          evidence: input,
          suggestion: "Pass a config file path or a server name from a discovered config."
        }
      ]
    };
  }

  return doctorMcpServer(exact);
}

export async function doctorMcpServer(server: McpServerConfig): Promise<McpDoctorResult> {
  const issues: Issue[] = [];
  let tools: McpToolInfo[] = [];
  const permissions: PermissionHint[] = [];

  if (server.transport === "unknown") {
    issues.push({
      severity: "P1",
      code: "mcp.transport-unknown",
      title: "MCP transport could not be inferred",
      evidence: server.configPath
    });
  }

  if (server.transport === "stdio") {
    if (!server.command) {
      issues.push({
        severity: "P1",
        code: "mcp.command-missing",
        title: "stdio MCP server is missing a command",
        evidence: server.configPath
      });
    } else if (!commandExists(server.command)) {
      issues.push({
        severity: "P1",
        code: "mcp.command-not-found",
        title: "MCP server command was not found on PATH",
        evidence: server.command,
        suggestion: "Install the command or update the MCP configuration."
      });
    }
  }

  for (const [key, value] of Object.entries(server.env)) {
    if (!value || value.includes("<") || value.includes("TODO") || value.includes("${")) {
      issues.push({
        severity: "P2",
        code: "mcp.env-placeholder",
        title: "MCP server has an unset or placeholder environment value",
        evidence: key,
        suggestion: "Set the environment variable before starting this server."
      });
    }
  }

  if (server.transport === "stdio" && server.command && commandExists(server.command)) {
    const probe = await probeStdioServer(server);
    issues.push(...probe.issues);
    tools = probe.tools;
  } else if (server.transport === "http" || server.transport === "sse") {
    issues.push({
      severity: "P3",
      code: "mcp.remote-not-probed",
      title: "Remote MCP probing is not implemented yet",
      evidence: server.url,
      suggestion: "V0 only performs full initialize/tools-list checks for stdio servers."
    });
  }

  for (const tool of tools) {
    permissions.push(...tool.permissions);
    if (!tool.description || tool.description.length < 16) {
      issues.push({
        severity: "P2",
        code: "mcp.tool-description-short",
        title: "MCP tool has a missing or short description",
        evidence: tool.name,
        suggestion: "Improve tool descriptions so agents can select tools safely."
      });
    }
  }

  return {
    server,
    health: healthFromIssues(issues),
    risk: mergeRisk(permissions, issues),
    issues,
    tools
  };
}

async function loadTargetServers(input: string, root: string): Promise<McpServerConfig[]> {
  if (input.endsWith(".json") || input.endsWith(".toml") || input.endsWith(".yaml") || input.endsWith(".yml")) {
    return loadMcpServers(input);
  }

  const configs = await findMcpConfigs(root, true);
  const nested = await Promise.all(
    configs.map(async (configPath) => {
      try {
        return await loadMcpServers(configPath);
      } catch {
        return [];
      }
    })
  );
  return nested.flat();
}

function commandExists(command: string): boolean {
  if (command.includes("/")) {
    return spawnSync("test", ["-x", command]).status === 0;
  }
  return spawnSync("which", [command], { stdio: "ignore" }).status === 0;
}

async function probeStdioServer(server: McpServerConfig): Promise<{ issues: Issue[]; tools: McpToolInfo[] }> {
  const issues: Issue[] = [];
  const tools: McpToolInfo[] = [];

  return new Promise((resolve) => {
    const child = spawn(server.command!, server.args, {
      env: { ...process.env, ...server.env },
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let initialized = false;
    let completed = false;

    const finish = () => {
      if (completed) return;
      completed = true;
      child.kill();
      resolve({ issues, tools });
    };

    const timeout = setTimeout(() => {
      issues.push({
        severity: initialized ? "P2" : "P1",
        code: initialized ? "mcp.tools-timeout" : "mcp.initialize-timeout",
        title: initialized ? "Timed out waiting for tools/list" : "Timed out waiting for initialize response",
        evidence: stderr.slice(0, 500)
      });
      finish();
    }, 6000);

    child.on("error", (error) => {
      clearTimeout(timeout);
      issues.push({
        severity: "P1",
        code: "mcp.spawn-failed",
        title: "Failed to spawn MCP server",
        evidence: error.message
      });
      finish();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim().startsWith("{")) continue;
        let message: JsonRpcMessage;
        try {
          message = JSON.parse(line) as JsonRpcMessage;
        } catch {
          continue;
        }

        if (message.id === 1) {
          initialized = true;
          writeJson(child, {
            jsonrpc: "2.0",
            method: "notifications/initialized",
            params: {}
          });
          writeJson(child, {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/list",
            params: {}
          });
        }

        if (message.id === 2) {
          clearTimeout(timeout);
          if (message.error) {
            issues.push({
              severity: "P1",
              code: "mcp.tools-list-failed",
              title: "tools/list returned an error",
              evidence: message.error.message
            });
          } else {
            const rawTools = extractTools(message.result);
            tools.push(...rawTools);
          }
          finish();
        }
      }
    });

    writeJson(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: {
          name: "skillops-local",
          version: "0.1.0"
        }
      }
    });
  });
}

function writeJson(child: ReturnType<typeof spawn>, message: Record<string, unknown>): void {
  child.stdin?.write(`${JSON.stringify(message)}\n`);
}

function extractTools(result: unknown): McpToolInfo[] {
  const maybe = result as { tools?: Array<{ name?: string; description?: string }> };
  if (!Array.isArray(maybe.tools)) return [];
  return maybe.tools
    .filter((tool) => typeof tool.name === "string")
    .map((tool) => {
      const risk = toolRisk(tool.name!, tool.description);
      return {
        name: tool.name!,
        description: tool.description,
        risk: risk.risk,
        permissions: risk.permissions
      };
    });
}
