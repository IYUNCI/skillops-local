import pc from "picocolors";
import type { Capability, McpDoctorResult } from "./types.js";
import type { ShareResult } from "./share.js";

export function printScanReport(capabilities: Capability[]): void {
  const byType = countBy(capabilities, (capability) => capability.type);
  const byHealth = countBy(capabilities, (capability) => capability.health);
  const byRisk = countBy(capabilities, (capability) => capability.risk);
  const issues = capabilities.flatMap((capability) =>
    capability.issues.map((issue) => ({ capability, issue }))
  );

  console.log(pc.bold("SkillOps Scan"));
  console.log("");
  console.log(pc.bold("Found:"));
  printCount("Skills", byType.skill ?? 0);
  printCount("MCP servers", byType.mcp_server ?? 0);
  printCount("Plugins", byType.plugin ?? 0);
  printCount("Commands", byType.command ?? 0);
  printCount("Hooks", byType.hook ?? 0);
  console.log("");
  console.log(pc.bold("Health:"));
  printCount("OK", byHealth.ok ?? 0, pc.green);
  printCount("Warning", byHealth.warning ?? 0, pc.yellow);
  printCount("Broken", byHealth.broken ?? 0, pc.red);
  printCount("Unknown", byHealth.unknown ?? 0, pc.dim);
  console.log("");
  console.log(pc.bold("Risk:"));
  printCount("Low", byRisk.low ?? 0, pc.green);
  printCount("Medium", byRisk.medium ?? 0, pc.yellow);
  printCount("High", byRisk.high ?? 0, pc.red);
  printCount("Critical", byRisk.critical ?? 0, pc.bgRed);

  if (issues.length > 0) {
    console.log("");
    console.log(pc.bold("Top issues:"));
    for (const { capability, issue } of issues.slice(0, 12)) {
      console.log(`  ${formatSeverity(issue.severity)} ${capability.name}: ${issue.title}`);
      if (issue.evidence) console.log(pc.dim(`      ${issue.evidence}`));
    }
  }
}

export function printCapability(capability: Capability): void {
  console.log(pc.bold(capability.name));
  console.log(`Type:        ${capability.type}`);
  console.log(`Source:      ${capability.source}`);
  console.log(`Health:      ${capability.health}`);
  console.log(`Risk:        ${capability.risk}`);
  if (capability.path) console.log(`Path:        ${capability.path}`);
  if (capability.configPath) console.log(`Config:      ${capability.configPath}`);
  if (capability.description) console.log(`Description: ${capability.description}`);
  if (capability.language.length > 0) console.log(`Language:    ${capability.language.join(", ")}`);
  if (capability.permissions.length > 0) console.log(`Permissions: ${capability.permissions.join(", ")}`);

  if (capability.issues.length > 0) {
    console.log("");
    console.log(pc.bold("Issues:"));
    for (const issue of capability.issues) {
      console.log(`  ${formatSeverity(issue.severity)} ${issue.title}`);
      if (issue.evidence) console.log(pc.dim(`      ${issue.evidence}`));
      if (issue.suggestion) console.log(pc.dim(`      ${issue.suggestion}`));
    }
  }
}

export function printMcpDoctor(result: McpDoctorResult): void {
  console.log(pc.bold(`MCP Doctor: ${result.server.name}`));
  console.log(`Transport: ${result.server.transport}`);
  console.log(`Health:    ${result.health}`);
  console.log(`Risk:      ${result.risk}`);
  console.log(`Config:    ${result.server.configPath}`);
  if (result.server.command) console.log(`Command:   ${result.server.command} ${result.server.args.join(" ")}`.trim());
  if (result.server.url) console.log(`URL:       ${result.server.url}`);

  console.log("");
  console.log(pc.bold(`Tools (${result.tools.length}):`));
  for (const tool of result.tools.slice(0, 30)) {
    console.log(`  - ${tool.name} (${tool.risk})`);
    if (tool.description) console.log(pc.dim(`    ${tool.description}`));
  }

  if (result.issues.length > 0) {
    console.log("");
    console.log(pc.bold("Issues:"));
    for (const issue of result.issues) {
      console.log(`  ${formatSeverity(issue.severity)} ${issue.title}`);
      if (issue.evidence) console.log(pc.dim(`      ${issue.evidence}`));
      if (issue.suggestion) console.log(pc.dim(`      ${issue.suggestion}`));
    }
  }
}

export function printShareResult(result: ShareResult): void {
  console.log(pc.bold(`Share pack created: ${result.capability.name}`));
  console.log(`Output: ${result.outputPath}`);
  console.log("");
  console.log(pc.bold("Files:"));
  for (const file of result.files) {
    console.log(`  - ${file}`);
  }
}

function printCount(label: string, count: number, color: (value: string) => string = (value) => value): void {
  console.log(`  ${label.padEnd(12)} ${color(String(count))}`);
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function formatSeverity(severity: string): string {
  if (severity === "P0") return pc.bgRed("P0");
  if (severity === "P1") return pc.red("P1");
  if (severity === "P2") return pc.yellow("P2");
  return pc.dim("P3");
}
