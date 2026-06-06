export type CapabilityType =
  | "skill"
  | "mcp_server"
  | "plugin"
  | "command"
  | "hook"
  | "agent";

export type CapabilitySource =
  | "codex"
  | "claude"
  | "cursor"
  | "vscode"
  | "project"
  | "unknown";

export type Severity = "P0" | "P1" | "P2" | "P3";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Health = "ok" | "warning" | "broken" | "unknown";

export type Issue = {
  severity: Severity;
  code: string;
  title: string;
  evidence?: string;
  suggestion?: string;
};

export type PermissionHint =
  | "local-files-read"
  | "local-files-write"
  | "shell"
  | "network"
  | "env-read"
  | "message-send"
  | "database-write"
  | "cloud-resource-write"
  | "payment-or-trade"
  | "unknown";

export type Capability = {
  id: string;
  type: CapabilityType;
  name: string;
  description?: string;
  source: CapabilitySource;
  path?: string;
  configPath?: string;
  language: string[];
  permissions: PermissionHint[];
  health: Health;
  risk: RiskLevel;
  issues: Issue[];
};

export type MpcTransport = "stdio" | "http" | "sse" | "unknown";

export type McpServerConfig = {
  name: string;
  transport: MpcTransport;
  command?: string;
  args: string[];
  url?: string;
  env: Record<string, string>;
  configPath: string;
  source: CapabilitySource;
};

export type McpToolInfo = {
  name: string;
  description?: string;
  risk: RiskLevel;
  permissions: PermissionHint[];
};

export type McpDoctorResult = {
  server: McpServerConfig;
  health: Health;
  risk: RiskLevel;
  issues: Issue[];
  tools: McpToolInfo[];
};

