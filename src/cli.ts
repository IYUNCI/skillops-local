#!/usr/bin/env node
import { watch } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { scanCapabilities } from "./scan.js";
import { lintSkill } from "./skill-lint.js";
import { doctorMcpByNameOrPath } from "./mcp-doctor.js";
import { createSharePack } from "./share.js";
import { printCapability, printMcpDoctor, printScanReport, printShareResult } from "./report.js";
import { startUiServer } from "./ui.js";
import { installGitHubSkill, installMarketSkill, searchMarketSkills } from "./market.js";
import type { SkillInstallTarget } from "./market.js";
import { searchCliTools } from "./cli-market.js";
import { getInstalledInventory } from "./installed.js";
import { removeSkill } from "./manage.js";
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
  getWatchRoots,
  importProfile,
  installMcpServer,
  previewSkillSource,
  reviewSkillOffline,
  runSkillEval,
  snapshotLocalLibrary,
  upgradeInstalledSkill
} from "./enhancements.js";

const program = new Command();

program
  .name("skillops")
  .description("Local-first Skill and MCP capability manager")
  .version("0.1.6");

program
  .command("scan")
  .description("Scan local and project capabilities")
  .option("--json", "Print JSON output")
  .option("--root <path>", "Project root to scan", process.cwd())
  .option("--no-home", "Skip home-level skill/config scan")
  .option("--probe-mcp", "Start stdio MCP servers and call tools/list")
  .action(async (options: { json?: boolean; root: string; home: boolean; probeMcp?: boolean }) => {
    const capabilities = await scanCapabilities({
      root: options.root,
      includeHome: options.home,
      probeMcp: Boolean(options.probeMcp)
    });

    if (options.json) {
      console.log(JSON.stringify({ capabilities }, null, 2));
      return;
    }

    printScanReport(capabilities);
  });

program
  .command("lint")
  .description("Lint a SKILL.md capability folder")
  .argument("<skill-dir>", "Path to a skill directory")
  .option("--json", "Print JSON output")
  .action(async (skillDir: string, options: { json?: boolean }) => {
    const result = await lintSkill(skillDir);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    printCapability(result);
  });

const doctor = program.command("doctor").description("Run focused health checks");

doctor
  .command("mcp")
  .description("Check an MCP server by name or config file path")
  .argument("<name-or-config-path>", "MCP server name or config path")
  .option("--root <path>", "Project root to inspect", process.cwd())
  .option("--json", "Print JSON output")
  .action(async (input: string, options: { root: string; json?: boolean }) => {
    const result = await doctorMcpByNameOrPath(input, options.root);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    printMcpDoctor(result);
  });

program
  .command("share")
  .description("Create a local share pack for a skill")
  .argument("<skill-dir>", "Path to a skill directory")
  .option("--out <path>", "Output directory", ".skillops/share")
  .option("--include-source", "Copy source files into the share pack")
  .option("--json", "Print JSON output")
  .action(async (skillDir: string, options: { out: string; includeSource?: boolean; json?: boolean }) => {
    const result = await createSharePack(skillDir, {
      outDir: options.out,
      includeSource: Boolean(options.includeSource)
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    printShareResult(result);
  });

const market = program.command("market").description("Search and install public skills locally");

market
  .command("search")
  .description("Search the local/open skill market")
  .argument("[query]", "Search query", "")
  .option("--root <path>", "Project root to inspect", process.cwd())
  .option("--no-home", "Skip home-level installed skill scan")
  .option("--json", "Print JSON output")
  .action(async (query: string, options: { root: string; home: boolean; json?: boolean }) => {
    const capabilities = await scanCapabilities({
      root: options.root,
      includeHome: options.home,
      probeMcp: false
    });
    const skills = await searchMarketSkills(query, capabilities);

    if (options.json) {
      console.log(JSON.stringify({ skills }, null, 2));
      return;
    }

    for (const skill of skills.slice(0, 40)) {
      const status = skill.installed ? `installed: ${skill.installedTargets.map((item) => `${item.platform}/${item.user}`).join(", ")}` : "not installed";
      console.log(`${skill.name} (${skill.sourceName}) - ${status}`);
      console.log(`  ${skill.description}`);
      if (skill.installable && skill.sourceUrl.includes("github.com")) {
        console.log(`  skillops market install "${skill.sourceUrl}" --target codex --yes`);
      } else {
        console.log(`  ${skill.sourceUrl}`);
      }
    }
  });

market
  .command("refresh")
  .description("Refresh market sources and print discovered skills")
  .argument("[query]", "Search query", "")
  .option("--root <path>", "Project root to inspect", process.cwd())
  .option("--json", "Print JSON output")
  .action(async (query: string, options: { root: string; json?: boolean }) => {
    const capabilities = await scanCapabilities({
      root: options.root,
      includeHome: true,
      probeMcp: false
    });
    const skills = await searchMarketSkills(query, capabilities);
    if (options.json) {
      console.log(JSON.stringify({ skills }, null, 2));
      return;
    }
    console.log(`Discovered ${skills.length} market entries.`);
    for (const skill of skills.slice(0, 40)) {
      console.log(`- ${skill.name}: ${skill.description}`);
    }
  });

market
  .command("install")
  .description("Install a market skill by GitHub URL or bundled market id")
  .argument("<source-or-id>", "GitHub URL, owner/repo, or market skill id")
  .option("--target <target>", "Install target: codex, claude, or project", "codex")
  .option("--root <path>", "Project root for project installs", process.cwd())
  .option("--yes", "Confirm install")
  .option("--json", "Print JSON output")
  .action(async (input: string, options: { target: SkillInstallTarget; root: string; yes?: boolean; json?: boolean }) => {
    if (!["codex", "claude", "project"].includes(options.target)) {
      throw new Error(`Invalid target: ${options.target}`);
    }
    if (!options.yes) {
      throw new Error("Install requires --yes because it writes to a local skill directory.");
    }

    const capabilities = await scanCapabilities({
      root: options.root,
      includeHome: true,
      probeMcp: false
    });
    const isSource = input.includes("github.com") || /^[\w.-]+\/[\w.-]+$/.test(input);
    const result = isSource
      ? await installGitHubSkill(input, options.target, options.root, capabilities)
      : await installMarketSkill(input, options.target, options.root, capabilities);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Installed ${result.name} to ${result.targetPath}`);
    console.log(`Health: ${result.lint.health}, risk: ${result.lint.risk}`);
  });

const tools = program.command("tools").description("Inspect installed and installable local CLI tools");

tools
  .command("search")
  .description("Search known AI/developer CLI tools and detect what is installed")
  .argument("[query]", "Search query", "")
  .option("--json", "Print JSON output")
  .action(async (query: string, options: { json?: boolean }) => {
    const cliTools = await searchCliTools(query);
    if (options.json) {
      console.log(JSON.stringify({ tools: cliTools }, null, 2));
      return;
    }

    for (const tool of cliTools.slice(0, 60)) {
      const status = tool.installed
        ? `installed${tool.version ? `, ${tool.version}` : ""}${tool.installedPath ? `, ${tool.installedPath}` : ""}`
        : "not installed";
      console.log(`${tool.name} (${tool.command}) - ${status}`);
      console.log(`  ${tool.description}`);
      for (const command of tool.quickCommands.slice(0, 3)) {
        console.log(`  ${command.command}`);
      }
    }
  });

tools
  .command("list")
  .description("List installed known CLI tools")
  .option("--json", "Print JSON output")
  .action(async (options: { json?: boolean }) => {
    const cliTools = (await searchCliTools("")).filter((tool) => tool.installed);
    if (options.json) {
      console.log(JSON.stringify({ tools: cliTools }, null, 2));
      return;
    }

    for (const tool of cliTools) {
      console.log(`${tool.name} (${tool.command})`);
      if (tool.version) console.log(`  ${tool.version}`);
      if (tool.installedPath) console.log(`  ${tool.installedPath}`);
    }
  });

const installed = program.command("installed").description("Query installed Skills, MCP servers, and CLI tools on this computer");

installed
  .command("list")
  .description("List installed Skills, MCP servers, and CLI tools")
  .option("--root <path>", "Project root to inspect", process.cwd())
  .option("--no-home", "Skip home-level skill/config scan")
  .option("--probe-mcp", "Start stdio MCP servers and call tools/list")
  .option("--json", "Print JSON output")
  .action(async (options: { root: string; home: boolean; probeMcp?: boolean; json?: boolean }) => {
    const inventory = await getInstalledInventory({
      root: options.root,
      includeHome: options.home,
      probeMcp: Boolean(options.probeMcp)
    });
    if (options.json) {
      console.log(JSON.stringify(inventory, null, 2));
      return;
    }

    printInstalledInventory(inventory.items);
  });

installed
  .command("search")
  .description("Search installed Skills, MCP servers, and CLI tools")
  .argument("[query]", "Search query", "")
  .option("--root <path>", "Project root to inspect", process.cwd())
  .option("--no-home", "Skip home-level skill/config scan")
  .option("--probe-mcp", "Start stdio MCP servers and call tools/list")
  .option("--json", "Print JSON output")
  .action(async (query: string, options: { root: string; home: boolean; probeMcp?: boolean; json?: boolean }) => {
    const inventory = await getInstalledInventory({
      root: options.root,
      includeHome: options.home,
      probeMcp: Boolean(options.probeMcp),
      query
    });
    if (options.json) {
      console.log(JSON.stringify(inventory, null, 2));
      return;
    }

    printInstalledInventory(inventory.items);
  });

installed
  .command("remove")
  .description("Move an installed skill to ~/.skillops/trash, or permanently delete it with --delete")
  .argument("<capability-id>", "Capability id from skillops scan or installed list")
  .option("--root <path>", "Project root to inspect", process.cwd())
  .option("--no-home", "Skip home-level skill scan")
  .option("--delete", "Permanently delete the local skill directory instead of moving it to trash")
  .option("--yes", "Confirm the filesystem write")
  .option("--json", "Print JSON output")
  .action(async (
    capabilityId: string,
    options: { root: string; home: boolean; delete?: boolean; yes?: boolean; json?: boolean }
  ) => {
    if (!options.yes) {
      throw new Error("Remove requires --yes because it writes to the local filesystem.");
    }
    const capabilities = await scanCapabilities({
      root: options.root,
      includeHome: options.home,
      probeMcp: false
    });
    const result = await removeSkill(capabilityId, capabilities, options.delete ? "delete" : "trash");
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (result.deleted) {
      console.log(`Deleted ${result.name} from ${result.originalPath}`);
    } else {
      console.log(`Moved ${result.name} to ${result.trashPath}`);
    }
  });

program
  .command("features")
  .description("List implemented SkillOps enhancement entrypoints")
  .option("--json", "Print JSON output")
  .action((options: { json?: boolean }) => {
    const features = getEnhancementOverview();
    if (options.json) {
      console.log(JSON.stringify({ features }, null, 2));
      return;
    }
    for (const feature of features) {
      console.log(`${feature.feature}`);
      console.log(`  ${feature.entrypoints.join(", ")}`);
    }
  });

const updates = program.command("updates").description("Detect and apply git-backed skill updates");

updates
  .command("check")
  .description("Check installed SkillOps-managed skills for remote updates")
  .option("--root <path>", "Project root to inspect", process.cwd())
  .option("--json", "Print JSON output")
  .action(async (options: { root: string; json?: boolean }) => {
    const updatesResult = await checkInstalledSkillUpdates(options.root);
    if (options.json) {
      console.log(JSON.stringify({ updates: updatesResult }, null, 2));
      return;
    }
    for (const item of updatesResult) {
      console.log(`${item.status.padEnd(16)} ${item.path}`);
      if (item.remoteCommit) console.log(`  remote:    ${item.remoteCommit}`);
      if (item.installedCommit) console.log(`  installed: ${item.installedCommit}`);
      if (item.message) console.log(`  ${item.message}`);
    }
  });

updates
  .command("upgrade")
  .description("Replace an installed git-backed skill with the latest source copy")
  .argument("<skill-path>", "Installed skill directory")
  .option("--yes", "Confirm local filesystem replacement")
  .option("--json", "Print JSON output")
  .action(async (skillPath: string, options: { yes?: boolean; json?: boolean }) => {
    if (!options.yes) throw new Error("Upgrade requires --yes because it replaces a local skill directory.");
    const result = await upgradeInstalledSkill(skillPath);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Upgraded ${result.name} at ${result.path}`);
    if (result.record.installedCommit) console.log(`Commit: ${result.record.installedCommit}`);
  });

const preview = program.command("preview").description("Preview capabilities before installation");

preview
  .command("skill")
  .description("Render and lint a local or GitHub SKILL.md source before installing")
  .argument("<source>", "Local skill folder, GitHub tree URL, or owner/repo")
  .option("--json", "Print JSON output")
  .action(async (source: string, options: { json?: boolean }) => {
    const result = await previewSkillSource(source);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`# ${result.name}`);
    console.log(result.description);
    console.log("");
    console.log(result.markdown);
  });

const mcp = program.command("mcp").description("Browse and install MCP servers");

mcp
  .command("tools")
  .description("List live tools exposed by configured MCP servers")
  .argument("[name-or-config-path]", "Optional MCP server name or config path")
  .option("--root <path>", "Project root to inspect", process.cwd())
  .option("--json", "Print JSON output")
  .action(async (input: string | undefined, options: { root: string; json?: boolean }) => {
    const results = await browseMcpTools(options.root, input);
    if (options.json) {
      console.log(JSON.stringify({ servers: results }, null, 2));
      return;
    }
    for (const result of results) {
      console.log(`${result.server.name} (${result.health}, ${result.risk})`);
      for (const tool of result.tools) console.log(`  - ${tool.name}: ${tool.description ?? ""}`);
      for (const issue of result.issues) console.log(`  ! ${issue.code}: ${issue.title}`);
    }
  });

mcp
  .command("install")
  .description("Install an MCP server into a local JSON MCP config")
  .argument("<name>", "MCP server name")
  .option("--root <path>", "Project root for project target", process.cwd())
  .option("--target <target>", "project, cursor, or claude", "project")
  .option("--command <command>", "stdio command")
  .option("--arg <value>", "Append a stdio argument", collect, [] as string[])
  .option("--url <url>", "HTTP/SSE MCP server URL")
  .option("--yes", "Confirm config write")
  .option("--json", "Print JSON output")
  .action(async (name: string, options: { root: string; target: string; command?: string; arg: string[]; url?: string; yes?: boolean; json?: boolean }) => {
    if (!options.yes) throw new Error("MCP install requires --yes because it writes a local config file.");
    if (!["project", "cursor", "claude"].includes(options.target)) throw new Error(`Invalid MCP target: ${options.target}`);
    const result = await installMcpServer({
      root: options.root,
      target: options.target as "project" | "cursor" | "claude",
      name,
      command: options.command,
      args: options.arg,
      url: options.url
    });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Installed MCP server ${result.server.name} in ${result.configPath}`);
  });

const risk = program.command("risk").description("Run enhanced risk checks");

risk
  .command("audit")
  .description("Audit a skill with dependency and binary checks")
  .argument("<skill-dir>", "Path to skill directory")
  .option("--json", "Print JSON output")
  .action(async (skillDir: string, options: { json?: boolean }) => {
    const result = await auditSkillRisk(skillDir);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else printCapability(result);
  });

const profile = program.command("profile").description("Import and export local SkillOps profiles");

profile
  .command("export")
  .description("Export installed inventory and config metadata")
  .option("--root <path>", "Project root to inspect", process.cwd())
  .option("--out <path>", "Output profile path")
  .option("--json", "Print JSON output")
  .action(async (options: { root: string; out?: string; json?: boolean }) => {
    const result = await exportProfile(options.root, options.out);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`Exported profile to ${result.path}`);
  });

profile
  .command("import")
  .description("Import a SkillOps profile into ~/.skillops/profiles")
  .argument("<profile-path>", "Profile JSON path")
  .option("--json", "Print JSON output")
  .action(async (profilePath: string, options: { json?: boolean }) => {
    const result = await importProfile(profilePath);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`Imported profile to ${result.path}`);
  });

const history = program.command("history").description("Inspect local operation history");

history
  .command("list")
  .description("List local SkillOps audit/history events")
  .option("--limit <number>", "Maximum events", "100")
  .option("--json", "Print JSON output")
  .action(async (options: { limit: string; json?: boolean }) => {
    const entries = await listHistory(Number.parseInt(options.limit, 10));
    if (options.json) console.log(JSON.stringify({ entries }, null, 2));
    else for (const entry of entries) console.log(`${entry.at} ${entry.action} ${entry.subject}`);
  });

const db = program.command("db").description("Maintain the local SkillOps inventory library");

db
  .command("snapshot")
  .description("Persist a local SQLite inventory snapshot")
  .option("--root <path>", "Project root to inspect", process.cwd())
  .option("--json", "Print JSON output")
  .action(async (options: { root: string; json?: boolean }) => {
    const result = await snapshotLocalLibrary(options.root);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`Saved ${result.inventoryCount} inventory rows via ${result.backend}: ${result.dbPath}`);
  });

const feedback = program.command("feedback").description("Record local skill feedback");

feedback
  .command("add")
  .description("Add a rating/comment for a skill, MCP server, or CLI item")
  .argument("<target-id>", "Installed item or market item id")
  .requiredOption("--rating <number>", "1-5 rating")
  .option("--comment <text>", "Feedback comment", "")
  .option("--json", "Print JSON output")
  .action(async (targetId: string, options: { rating: string; comment: string; json?: boolean }) => {
    const result = await addFeedback(targetId, Number.parseInt(options.rating, 10), options.comment);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`Recorded feedback ${result.rating}/5 for ${targetId}`);
  });

const compat = program.command("compat").description("Inspect agent compatibility");

compat
  .command("matrix")
  .description("Build a Codex/Claude/Cursor compatibility matrix")
  .option("--root <path>", "Project root to inspect", process.cwd())
  .option("--json", "Print JSON output")
  .action(async (options: { root: string; json?: boolean }) => {
    const matrix = await buildCompatibilityMatrix(options.root);
    if (options.json) console.log(JSON.stringify({ matrix }, null, 2));
    else for (const row of matrix) console.log(`${row.name}: codex=${row.codex} claude=${row.claude} cursor=${row.cursor}`);
  });

const create = program.command("create").description("Create local capability templates");

create
  .command("skill")
  .description("Create a new SKILL.md package skeleton")
  .argument("<name>", "Skill name")
  .option("--root <path>", "Target skills root", path.join(process.cwd(), "skills"))
  .option("--json", "Print JSON output")
  .action(async (name: string, options: { root: string; json?: boolean }) => {
    const result = await createSkillTemplate(name, options.root);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`Created skill template at ${result.path}`);
  });

const evalCommand = program.command("eval").description("Run local capability evals");

evalCommand
  .command("skill")
  .description("Run a sandboxed static eval for a skill")
  .argument("<skill-dir>", "Path to skill directory")
  .option("--json", "Print JSON output")
  .action(async (skillDir: string, options: { json?: boolean }) => {
    const result = await runSkillEval(skillDir);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`${result.passed ? "PASS" : "FAIL"} ${result.skillPath}`);
      for (const check of result.checks) console.log(`  ${check.passed ? "ok" : "fail"} ${check.name}: ${check.message}`);
    }
  });

program
  .command("watch")
  .description("Watch local skill and MCP config roots for changes")
  .option("--root <path>", "Project root to inspect", process.cwd())
  .action(async (options: { root: string }) => {
    const roots = await getWatchRoots(options.root);
    if (roots.length === 0) {
      console.log("No watchable SkillOps roots found.");
      return;
    }
    console.log("Watching:");
    for (const root of roots) {
      console.log(`- ${root}`);
      watch(root, { recursive: process.platform === "darwin" }, (_event, filename) => {
        console.log(`${new Date().toISOString()} changed ${path.join(root, String(filename ?? ""))}`);
      });
    }
    await new Promise(() => undefined);
  });

const review = program.command("review").description("Review skills with offline AI-style heuristics");

review
  .command("skill")
  .description("Generate an AI-assisted local review from lint and risk signals")
  .argument("<skill-dir>", "Path to skill directory")
  .option("--json", "Print JSON output")
  .action(async (skillDir: string, options: { json?: boolean }) => {
    const result = await reviewSkillOffline(skillDir);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`${result.verdict.toUpperCase()}: ${result.summary}`);
      for (const concern of result.concerns) console.log(`- ${concern}`);
    }
  });

const graph = program.command("graph").description("Build local dependency graphs");

graph
  .command("dependencies")
  .description("Create a local dependency graph for skills, MCP servers, and runtimes")
  .option("--root <path>", "Project root to inspect", process.cwd())
  .option("--json", "Print JSON output")
  .action(async (options: { root: string; json?: boolean }) => {
    const result = await buildDependencyGraph(options.root);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.mermaid);
  });

program
  .command("ui")
  .description("Start the local SkillOps web UI")
  .option("--port <port>", "Port to listen on", "18765")
  .option("--host <host>", "Host to listen on", "127.0.0.1")
  .option("--root <path>", "Project root to inspect", process.cwd())
  .option("--no-home", "Skip home-level skill/config scan")
  .option("--open", "Open the UI in the default browser")
  .action(
    async (options: {
      port: string;
      host: string;
      root: string;
      home: boolean;
      open?: boolean;
    }) => {
      const port = Number.parseInt(options.port, 10);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${options.port}`);
      }

      await startUiServer({
        port,
        host: options.host,
        root: options.root,
        includeHome: options.home,
        openBrowser: Boolean(options.open)
      });
    }
  );

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function printInstalledInventory(items: Array<{
  kind: string;
  name: string;
  description: string;
  usage: string;
  sourceName: string;
  path?: string;
  configPath?: string;
  installedPath?: string;
  command?: string;
  quickCommands: Array<{ command: string }>;
}>): void {
  for (const item of items.slice(0, 120)) {
    console.log(`${item.name} (${item.kind}, ${item.sourceName})`);
    console.log(`  ${item.description}`);
    console.log(`  Usage: ${item.usage}`);
    const location = item.path ?? item.configPath ?? item.installedPath ?? item.command;
    if (location) console.log(`  ${location}`);
    for (const command of item.quickCommands.slice(0, 3)) {
      console.log(`  ${command.command}`);
    }
  }
}

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}
