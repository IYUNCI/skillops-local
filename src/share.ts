import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Capability } from "./types.js";
import { lintSkill } from "./skill-lint.js";

export type ShareOptions = {
  outDir: string;
  includeSource?: boolean;
};

export type ShareResult = {
  capability: Capability;
  outputPath: string;
  files: string[];
};

export async function createSharePack(inputPath: string, options: ShareOptions): Promise<ShareResult> {
  const capability = await lintSkill(inputPath);
  const safeName = capability.name.replace(/[^a-zA-Z0-9_.-]+/g, "-").toLowerCase();
  const outputPath = path.resolve(options.outDir, safeName);

  await mkdir(path.join(outputPath, "examples"), { recursive: true });

  const files = [
    "skillops.manifest.json",
    "README.generated.md",
    "INSTALL.md",
    "SECURITY_REPORT.md",
    "examples/tasks.md"
  ];

  await writeFile(
    path.join(outputPath, "skillops.manifest.json"),
    `${JSON.stringify(buildManifest(capability, options.includeSource ?? false), null, 2)}\n`,
    "utf8"
  );
  await writeFile(path.join(outputPath, "README.generated.md"), buildReadme(capability), "utf8");
  await writeFile(path.join(outputPath, "INSTALL.md"), buildInstall(capability, options.includeSource ?? false), "utf8");
  await writeFile(path.join(outputPath, "SECURITY_REPORT.md"), buildSecurityReport(capability), "utf8");
  await writeFile(path.join(outputPath, "examples", "tasks.md"), buildExamples(capability), "utf8");

  if (options.includeSource && capability.path) {
    const sourceTarget = path.join(outputPath, "source");
    await cp(capability.path, sourceTarget, {
      recursive: true,
      filter: (source) => !source.includes("node_modules") && !source.includes(`${path.sep}.git${path.sep}`)
    });
    files.push("source/");
  }

  return { capability, outputPath, files };
}

function buildManifest(capability: Capability, includeSource: boolean): Record<string, unknown> {
  return {
    schemaVersion: "skillops.v0",
    name: capability.name,
    type: capability.type,
    description: capability.description,
    languages: capability.language,
    platforms: ["Codex", "Claude Code", "Cursor-compatible agents"],
    permissions: capability.permissions,
    risk: capability.risk,
    health: capability.health,
    sourceIncluded: includeSource,
    entrypoints: includeSource ? { skill: "source/SKILL.md" } : { skill: capability.path },
    install: {
      codex: `~/.codex/skills/${capability.name}`,
      claude: `~/.claude/skills/${capability.name}`
    }
  };
}

function buildReadme(capability: Capability): string {
  return `# ${capability.name}

${capability.description || "No description provided."}

## Summary

- Type: ${capability.type}
- Health: ${capability.health}
- Risk: ${capability.risk}
- Languages: ${capability.language.join(", ") || "Unknown"}
- Permissions: ${capability.permissions.join(", ") || "None detected"}

## Best For

- Tasks that match the skill description.
- Repeatable workflows where shared instructions, scripts, templates, or references improve consistency.

## Not Best For

- Tasks outside the description.
- High-risk operations without explicit user confirmation.

## Source

${capability.path ?? capability.configPath ?? "Unknown"}
`;
}

function buildInstall(capability: Capability, includeSource: boolean): string {
  const sourcePath = includeSource ? "source" : capability.path ?? "<source-skill-dir>";
  return `# Install ${capability.name}

## Codex

Copy or symlink the skill directory:

\`\`\`bash
mkdir -p ~/.codex/skills
cp -R ${sourcePath} ~/.codex/skills/${capability.name}
\`\`\`

## Claude Code

\`\`\`bash
mkdir -p ~/.claude/skills
cp -R ${sourcePath} ~/.claude/skills/${capability.name}
\`\`\`

## Verify

\`\`\`bash
skillops lint ~/.codex/skills/${capability.name}
\`\`\`
`;
}

function buildSecurityReport(capability: Capability): string {
  const issueText =
    capability.issues.length === 0
      ? "No issues detected.\n"
      : capability.issues
          .map((issue) => {
            const lines = [`- ${issue.severity} ${issue.code}: ${issue.title}`];
            if (issue.evidence) lines.push(`  Evidence: ${issue.evidence}`);
            if (issue.suggestion) lines.push(`  Suggestion: ${issue.suggestion}`);
            return lines.join("\n");
          })
          .join("\n\n");

  return `# Security Report

Capability: ${capability.name}
Health: ${capability.health}
Risk: ${capability.risk}

## Permissions

${capability.permissions.length > 0 ? capability.permissions.map((item) => `- ${item}`).join("\n") : "- None detected"}

## Issues

${issueText}
`;
}

function buildExamples(capability: Capability): string {
  return `# Example Tasks

- Use ${capability.name} for a task that matches: "${capability.description || capability.name}".
- Review the generated security report before installing this capability for a team.
- After installation, run \`skillops lint\` to verify the local copy.
`;
}

