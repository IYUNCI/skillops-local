import { spawn } from "node:child_process";
import path from "node:path";
import { stableId, unique } from "./utils.js";

export type CliQuickCommand = {
  label: string;
  command: string;
  description: string;
};

export type CliTool = {
  id: string;
  name: string;
  command: string;
  aliases: string[];
  description: string;
  usage: string;
  sourceName: string;
  sourceUrl: string;
  installCommand?: string;
  uninstallCommand?: string;
  installable: boolean;
  installed: boolean;
  installedPath?: string;
  version?: string;
  platforms: string[];
  languages: string[];
  tags: string[];
  quickCommands: CliQuickCommand[];
};

type CliCatalogEntry = Omit<CliTool, "id" | "installed" | "installedPath" | "version" | "quickCommands"> & {
  versionArgs?: string[];
  helpArgs?: string[];
  examples?: CliQuickCommand[];
};

export type CliToolActionResult = {
  tool: CliTool;
  action: "install" | "uninstall";
  command: string;
  code: number | null;
  stdout: string;
  stderr: string;
};

const CLI_CATALOG: CliCatalogEntry[] = [
  {
    name: "Codex CLI",
    command: "codex",
    aliases: ["openai-codex"],
    description: "OpenAI 的本地终端 coding agent，用于读写代码、运行命令、检查 diff，并可配合本机 Skills 工作流。",
    usage: "用于在当前项目里启动 Codex、执行编码任务、检查本地能力，或配合 SkillOps 安装 skill 到 ~/.codex/skills。",
    sourceName: "OpenAI",
    sourceUrl: "https://github.com/openai/codex",
    installCommand: "npm install -g @openai/codex",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["Node.js", "Rust"],
    tags: ["ai-agent", "codex", "skills", "local-cli"],
    versionArgs: ["--version"],
    examples: [
      {
        label: "Search skills",
        command: "skillops market search \"testing\"",
        description: "Search local and public skill sources from this SkillOps project."
      },
      {
        label: "Install skill",
        command: "skillops market install \"https://github.com/owner/repo/tree/main/skills/name\" --target codex --yes",
        description: "Install a reviewed GitHub skill into Codex's personal skill folder."
      }
    ]
  },
  {
    name: "Claude Code",
    command: "claude",
    aliases: ["claude-code"],
    description: "Anthropic 的终端 coding agent，支持 Claude Code skills，并用 /skill-name 或自然语言触发对应技能。",
    usage: "用于代码生成、审查、调试、项目自动化，也可把公共 SKILL.md 安装到 ~/.claude/skills。",
    sourceName: "Anthropic",
    sourceUrl: "https://code.claude.com/docs/en/skills",
    installCommand: "npm install -g @anthropic-ai/claude-code",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["Node.js"],
    tags: ["ai-agent", "claude", "skills", "local-cli"],
    versionArgs: ["--version"],
    examples: [
      {
        label: "Install skill",
        command: "skillops market install \"https://github.com/owner/repo/tree/main/skills/name\" --target claude --yes",
        description: "Install a reviewed GitHub skill into Claude Code's personal skill folder."
      },
      {
        label: "Create skill folder",
        command: "mkdir -p ~/.claude/skills/my-skill && $EDITOR ~/.claude/skills/my-skill/SKILL.md",
        description: "Create or edit a Claude Code personal skill."
      }
    ]
  },
  {
    name: "Gemini CLI",
    command: "gemini",
    aliases: ["google-gemini"],
    description: "Google Gemini 的终端 AI agent，用于把 Gemini 引入本地命令行开发流程。",
    usage: "用于本地代码问答、文件操作、命令辅助，以及与兼容 skill/extension 生态联动。",
    sourceName: "Google",
    sourceUrl: "https://github.com/google-gemini/gemini-cli",
    installCommand: "npm install -g @google/gemini-cli",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["TypeScript", "Node.js"],
    tags: ["ai-agent", "gemini", "extensions", "local-cli"],
    versionArgs: ["--version"]
  },
  {
    name: "OpenCode",
    command: "opencode",
    aliases: ["opencode-ai"],
    description: "开源终端 AI coding agent，面向本地开发、模型切换和可组合工具链。",
    usage: "用于在终端里运行代码代理、试验多模型 coding 工作流，并与公开 skill/rules 生态配合。",
    sourceName: "OpenCode",
    sourceUrl: "https://github.com/sst/opencode",
    installCommand: "npm install -g opencode-ai",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["TypeScript", "Go"],
    tags: ["ai-agent", "open-source", "local-cli"],
    versionArgs: ["--version"]
  },
  {
    name: "Aider",
    command: "aider",
    aliases: ["aider-chat"],
    description: "Git-aware AI pair programming CLI，擅长在仓库内按 diff 工作并自动提交上下文。",
    usage: "用于把现有代码仓库交给 AI 结对修改、重构和测试，特别适合命令行开发者。",
    sourceName: "Aider",
    sourceUrl: "https://aider.chat/",
    installCommand: "pipx install aider-chat",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["Python"],
    tags: ["ai-agent", "git", "pair-programming"],
    versionArgs: ["--version"]
  },
  {
    name: "Cursor CLI",
    command: "cursor",
    aliases: ["Cursor"],
    description: "Cursor 编辑器的命令行入口，用于从终端打开项目或文件并衔接 Cursor Agent 工作流。",
    usage: "用于快速打开仓库、定位文件、把本地 CLI 工作流交给 Cursor IDE 继续处理。",
    sourceName: "Cursor",
    sourceUrl: "https://cursor.com/",
    installable: false,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["Desktop app"],
    tags: ["ide", "ai-agent", "editor"],
    versionArgs: ["--version"],
    examples: [
      {
        label: "Open project",
        command: "cursor .",
        description: "Open the current project in Cursor if the CLI is installed in PATH."
      }
    ]
  },
  {
    name: "GitHub CLI",
    command: "gh",
    aliases: ["github-cli"],
    description: "GitHub 官方 CLI，用于 issue、PR、workflow、release 和 auth 等开发协作操作。",
    usage: "用于登录 GitHub、创建 PR、查看 CI、管理仓库，是 Skill/MCP 项目发布和协作的基础工具。",
    sourceName: "GitHub",
    sourceUrl: "https://cli.github.com/",
    installCommand: "brew install gh",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["Go"],
    tags: ["github", "devtools", "release"],
    versionArgs: ["--version"],
    examples: [
      {
        label: "Auth status",
        command: "gh auth status",
        description: "Check whether GitHub CLI is authenticated."
      }
    ]
  },
  {
    name: "Lark CLI",
    command: "lark-cli",
    aliases: ["feishu-cli"],
    description: "飞书/Lark 官方开放平台 CLI，用于文档、Base、IM、审批、日历等接口自动化。",
    usage: "用于把本地工具、SkillOps 报告或自动化结果写入飞书文档、多维表格、群消息等。",
    sourceName: "Lark Open Platform",
    sourceUrl: "https://github.com/larksuite/oapi-sdk-cli",
    installable: false,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["Go"],
    tags: ["lark", "feishu", "automation", "openapi"],
    versionArgs: ["--version"],
    examples: [
      {
        label: "Help",
        command: "lark-cli --help",
        description: "List available Lark CLI command groups."
      }
    ]
  },
  {
    name: "Docker CLI",
    command: "docker",
    aliases: ["docker-desktop"],
    description: "容器运行与镜像构建 CLI，可用于本地化部署 Skill/MCP 管理平台和隔离执行环境。",
    usage: "用于构建镜像、运行本地服务、打包部署 SkillOps 或隔离测试未审查的技能依赖。",
    sourceName: "Docker",
    sourceUrl: "https://docs.docker.com/reference/cli/docker/",
    installCommand: "brew install --cask docker",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["Go"],
    tags: ["deployment", "container", "local-first"],
    versionArgs: ["--version"],
    examples: [
      {
        label: "Containers",
        command: "docker ps",
        description: "List running local containers."
      }
    ]
  },
  {
    name: "Git",
    command: "git",
    aliases: [],
    description: "版本控制基础 CLI，用于获取公开 skill 仓库、查看变更、发布项目和回滚本地修改。",
    usage: "用于 clone public skill sources、提交 SkillOps 变更、检查工作区状态。",
    sourceName: "Git",
    sourceUrl: "https://git-scm.com/",
    installCommand: "brew install git",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["C"],
    tags: ["devtools", "source-control", "github"],
    versionArgs: ["--version"],
    examples: [
      {
        label: "Clone skill repo",
        command: "git clone https://github.com/VoltAgent/awesome-agent-skills.git",
        description: "Fetch a public skill directory for inspection."
      }
    ]
  },
  {
    name: "Node.js",
    command: "node",
    aliases: ["npm", "npx"],
    description: "JavaScript/TypeScript CLI 运行时，是 Codex、Claude、Gemini、SkillOps 本身和大量 MCP server 的基础环境。",
    usage: "用于运行本地 TypeScript/Node 工具、安装 AI CLI、启动 SkillOps UI 和执行构建脚本。",
    sourceName: "Node.js",
    sourceUrl: "https://nodejs.org/",
    installCommand: "brew install node",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["JavaScript", "TypeScript", "Node.js"],
    tags: ["runtime", "mcp", "cli", "typescript"],
    versionArgs: ["--version"],
    examples: [
      {
        label: "Run SkillOps",
        command: "node dist/cli.js ui --port 18765 --host 127.0.0.1",
        description: "Start this local SkillOps UI from the built JavaScript bundle."
      }
    ]
  },
  {
    name: "npm",
    command: "npm",
    aliases: ["npx"],
    description: "Node 包管理器，用于安装 Codex/Claude/Gemini CLI、MCP server 和本项目依赖。",
    usage: "用于安装全局或项目级 CLI，执行 npm scripts，并拉取公开包。",
    sourceName: "npm",
    sourceUrl: "https://docs.npmjs.com/cli/",
    installCommand: "brew install node",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["JavaScript", "Node.js"],
    tags: ["package-manager", "node", "mcp", "skills"],
    versionArgs: ["--version"],
    examples: [
      {
        label: "Install Codex",
        command: "npm install -g @openai/codex",
        description: "Install or update OpenAI Codex CLI."
      }
    ]
  },
  {
    name: "pnpm",
    command: "pnpm",
    aliases: [],
    description: "高性能 Node 包管理器，常见于现代前端、MCP server 和 monorepo 项目。",
    usage: "用于更快安装依赖、运行脚本和维护多包工作区。",
    sourceName: "pnpm",
    sourceUrl: "https://pnpm.io/",
    installCommand: "npm install -g pnpm",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["JavaScript", "Node.js"],
    tags: ["package-manager", "monorepo", "typescript"],
    versionArgs: ["--version"]
  },
  {
    name: "Bun",
    command: "bun",
    aliases: [],
    description: "一体化 JavaScript runtime/package manager/test runner，可用于快速启动本地工具和前端项目。",
    usage: "用于高性能运行 JS/TS 脚本、安装依赖、启动开发服务。",
    sourceName: "Bun",
    sourceUrl: "https://bun.sh/",
    installCommand: "curl -fsSL https://bun.sh/install | bash",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["JavaScript", "TypeScript", "Zig"],
    tags: ["runtime", "package-manager", "typescript"],
    versionArgs: ["--version"]
  },
  {
    name: "uv",
    command: "uv",
    aliases: [],
    description: "Python 包和项目管理工具，适合快速安装/隔离 Python 型 skills、MCP server 和自动化脚本依赖。",
    usage: "用于管理 Python 虚拟环境、安装工具、运行脚本和锁定依赖。",
    sourceName: "Astral",
    sourceUrl: "https://docs.astral.sh/uv/",
    installCommand: "brew install uv",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["Python", "Rust"],
    tags: ["python", "package-manager", "mcp", "skills"],
    versionArgs: ["--version"]
  },
  {
    name: "Python 3",
    command: "python3",
    aliases: ["python"],
    description: "Python 运行时，很多数据处理、PDF、表格、自动化和 MCP/skill 脚本都依赖它。",
    usage: "用于运行 Python 型 skill 支持脚本、创建虚拟环境、执行数据处理和自动化任务。",
    sourceName: "Python",
    sourceUrl: "https://www.python.org/",
    installCommand: "brew install python",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["Python"],
    tags: ["runtime", "python", "automation", "skills"],
    versionArgs: ["--version"]
  },
  {
    name: "pipx",
    command: "pipx",
    aliases: [],
    description: "Python CLI 隔离安装器，适合安装 aider、独立 MCP/skill 工具，避免污染全局 Python 环境。",
    usage: "用于把 Python CLI 安装进隔离环境，同时把命令暴露到 PATH。",
    sourceName: "pipx",
    sourceUrl: "https://pipx.pypa.io/",
    installCommand: "brew install pipx",
    installable: true,
    platforms: ["macOS", "Linux", "Windows"],
    languages: ["Python"],
    tags: ["python", "cli-installer", "isolation"],
    versionArgs: ["--version"]
  },
  {
    name: "Homebrew",
    command: "brew",
    aliases: [],
    description: "macOS/Linux 包管理器，用于安装 git、gh、docker、uv、python 等本地工具链。",
    usage: "用于补齐本地 CLI 依赖、安装桌面应用和管理系统级开发工具。",
    sourceName: "Homebrew",
    sourceUrl: "https://brew.sh/",
    installable: false,
    platforms: ["macOS", "Linux"],
    languages: ["Ruby"],
    tags: ["package-manager", "macos", "toolchain"],
    versionArgs: ["--version"],
    examples: [
      {
        label: "Search package",
        command: "brew search codex",
        description: "Search Homebrew packages related to Codex."
      }
    ]
  }
];

const DEFAULT_CLI_PATH_SEGMENTS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin"
];

export async function searchCliTools(query = ""): Promise<CliTool[]> {
  const normalized = query.trim().toLowerCase();
  const tools = await scanCliTools();
  return tools.filter((tool) => {
    if (!normalized) return true;
    return [
      tool.name,
      tool.command,
      ...tool.aliases,
      tool.description,
      tool.usage,
      tool.sourceName,
      tool.sourceUrl,
      tool.installCommand ?? "",
      ...tool.platforms,
      ...tool.languages,
      ...tool.tags
    ].join(" ").toLowerCase().includes(normalized);
  });
}

export async function scanCliTools(): Promise<CliTool[]> {
  const entries = await Promise.all(CLI_CATALOG.map(async (entry) => enrichCliTool(entry)));
  return entries.sort((a, b) => {
    const installedDiff = Number(b.installed) - Number(a.installed);
    if (installedDiff !== 0) return installedDiff;
    const agentDiff = Number(isAgentCli(b)) - Number(isAgentCli(a));
    if (agentDiff !== 0) return agentDiff;
    return a.name.localeCompare(b.name);
  });
}

export async function runCliToolAction(toolId: string, action: "install" | "uninstall"): Promise<CliToolActionResult> {
  const tools = await scanCliTools();
  const tool = tools.find((item) => item.id === toolId);
  if (!tool) throw new Error(`CLI tool not found: ${toolId}`);

  const command = action === "install" ? tool.installCommand : tool.uninstallCommand;
  if (!command) {
    throw new Error(`${action === "install" ? "Install" : "Uninstall"} command is not available for ${tool.name}.`);
  }
  if (action === "install" && !tool.installable) throw new Error(`${tool.name} is not marked as installable.`);

  const result = await runShell(command, 5 * 60 * 1000);
  const output = {
    tool,
    action,
    command,
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr
  };

  if (result.code !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`${command} failed${detail ? `:\n${detail.slice(0, 1200)}` : ""}`);
  }

  return output;
}

function isAgentCli(tool: CliTool): boolean {
  return tool.tags.some((tag) => ["ai-agent", "skills"].includes(tag));
}

async function enrichCliTool(entry: CliCatalogEntry): Promise<CliTool> {
  const candidates = unique([entry.command, ...entry.aliases]);
  const located = await locateAnyCommand(candidates);
  const version = located ? await readCliVersion(located.command, entry.versionArgs ?? ["--version"]) : undefined;
  const toolBase = {
    id: stableId(["cli", entry.command]),
    name: entry.name,
    command: located?.command ?? entry.command,
    aliases: entry.aliases,
    description: entry.description,
    usage: entry.usage,
    sourceName: entry.sourceName,
    sourceUrl: entry.sourceUrl,
    installCommand: entry.installCommand,
    uninstallCommand: entry.uninstallCommand ?? inferUninstallCommand(entry.installCommand),
    installable: entry.installable,
    installed: Boolean(located),
    installedPath: located?.path,
    version,
    platforms: entry.platforms,
    languages: entry.languages,
    tags: entry.tags
  };

  return {
    ...toolBase,
    quickCommands: buildCliQuickCommands(entry, toolBase.uninstallCommand, located?.command ?? entry.command, Boolean(located))
  };
}

async function locateAnyCommand(commands: string[]): Promise<{ command: string; path: string } | undefined> {
  for (const command of commands) {
    const output = await runShell(`command -v ${shellEscape(command)}`, 1200);
    const resolved = output.stdout.trim().split("\n")[0]?.trim();
    if (output.code === 0 && resolved) return { command, path: resolved };
  }
  return undefined;
}

async function readCliVersion(command: string, args: string[]): Promise<string | undefined> {
  const result = await runCommand(command, args, { timeoutMs: 1800 });
  if (result.code !== 0) return undefined;
  const text = `${result.stdout}\n${result.stderr}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
  if (!text) return undefined;
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function buildCliQuickCommands(entry: CliCatalogEntry, uninstallCommand: string | undefined, command: string, installed: boolean): CliQuickCommand[] {
  const commands: CliQuickCommand[] = [];
  if (installed) {
    commands.push({
      label: "Help",
      command: `${shellEscape(command)} ${(entry.helpArgs ?? ["--help"]).map(shellEscape).join(" ")}`.trim(),
      description: `Show usage help for ${entry.name}.`
    });
    commands.push({
      label: "Version",
      command: `${shellEscape(command)} ${(entry.versionArgs ?? ["--version"]).map(shellEscape).join(" ")}`.trim(),
      description: `Show the installed ${entry.name} version.`
    });
    if (uninstallCommand) {
      commands.push({
        label: "Uninstall",
        command: uninstallCommand,
        description: `Remove ${entry.name} using its package manager.`
      });
    }
  } else if (entry.installCommand) {
    commands.push({
      label: "Install",
      command: entry.installCommand,
      description: `Install ${entry.name} locally.`
    });
  }

  commands.push({
    label: "Open source",
    command: entry.sourceUrl,
    description: `Open documentation or source page for ${entry.name}.`
  });

  if (entry.examples?.length) commands.push(...entry.examples);
  return uniqueByCommand(commands).slice(0, 5);
}

function inferUninstallCommand(installCommand?: string): string | undefined {
  if (!installCommand) return undefined;

  const npmMatch = installCommand.match(/^npm\s+install\s+-g\s+(.+)$/);
  if (npmMatch) return `npm uninstall -g ${npmMatch[1].trim()}`;

  const pipxMatch = installCommand.match(/^pipx\s+install\s+(.+)$/);
  if (pipxMatch) return `pipx uninstall ${pipxMatch[1].trim().split(/\s+/)[0]}`;

  const brewCaskMatch = installCommand.match(/^brew\s+install\s+--cask\s+(.+)$/);
  if (brewCaskMatch) return `brew uninstall --cask ${brewCaskMatch[1].trim()}`;

  const brewMatch = installCommand.match(/^brew\s+install\s+(.+)$/);
  if (brewMatch) return `brew uninstall ${brewMatch[1].trim().split(/\s+/)[0]}`;

  return undefined;
}

function uniqueByCommand(commands: CliQuickCommand[]): CliQuickCommand[] {
  const seen = new Set<string>();
  return commands.filter((item) => {
    const key = item.command.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shellEscape(value: string): string {
  if (/^[\w@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function runCommand(
  command: string,
  args: string[],
  options: { timeoutMs?: number } = {}
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: buildCliToolEnv() });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, options.timeoutMs ?? 2000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", () => {
      clearTimeout(timeout);
      resolve({ code: 127, stdout, stderr });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

function runShell(script: string, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return runCommand("/bin/sh", ["-lc", script], { timeoutMs });
}

function buildCliToolEnv(): NodeJS.ProcessEnv {
  const pathSegments = [
    ...(process.env.PATH ?? "").split(path.delimiter),
    ...DEFAULT_CLI_PATH_SEGMENTS
  ].filter(Boolean);
  return {
    ...process.env,
    PATH: unique(pathSegments).join(path.delimiter),
    SHELL: process.env.SHELL || "/bin/zsh",
    npm_config_script_shell: process.env.npm_config_script_shell || "/bin/sh"
  };
}
