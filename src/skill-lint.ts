import path from "node:path";
import matter from "gray-matter";
import fg from "fast-glob";
import type { Capability, Issue } from "./types.js";
import { detectTextIssues, inferLanguageFromFiles, inferPermissions } from "./detect.js";
import { healthFromIssues, mergeRisk } from "./risk.js";
import { fileExists, isDirectory, readText, stableId, toPosixPath, unique } from "./utils.js";

export type SkillLintResult = Capability;

const broadDescriptionPatterns = [
  /\b(always|all tasks|any task|everything|whenever possible)\b/i,
  /任何(任务|情况|时候).*使用/,
  /总是.*使用/
];

export async function lintSkill(skillDir: string, source: Capability["source"] = "unknown"): Promise<SkillLintResult> {
  const absoluteDir = path.resolve(skillDir);
  const skillMd = path.join(absoluteDir, "SKILL.md");
  const issues: Issue[] = [];
  let name = path.basename(absoluteDir);
  let description = "";
  let skillText = "";

  if (!(await isDirectory(absoluteDir))) {
    issues.push({
      severity: "P1",
      code: "skill.not-directory",
      title: "Skill path is not a directory",
      evidence: absoluteDir
    });
  }

  if (!(await fileExists(skillMd))) {
    issues.push({
      severity: "P1",
      code: "skill.missing-entrypoint",
      title: "Missing SKILL.md entrypoint",
      evidence: skillMd,
      suggestion: "Create SKILL.md with name and description frontmatter."
    });
  } else {
    skillText = await readText(skillMd);
    const parsed = matter(skillText);
    name = typeof parsed.data.name === "string" ? parsed.data.name : name;
    description = typeof parsed.data.description === "string" ? parsed.data.description.trim() : "";

    if (!parsed.data.name) {
      issues.push({
        severity: "P2",
        code: "skill.name-missing",
        title: "Missing frontmatter name",
        evidence: skillMd,
        suggestion: "Add a stable name to SKILL.md frontmatter."
      });
    }

    if (!description) {
      issues.push({
        severity: "P2",
        code: "skill.description-missing",
        title: "Missing frontmatter description",
        evidence: skillMd,
        suggestion: "Add a description that explains when the skill should activate."
      });
    } else {
      for (const pattern of broadDescriptionPatterns) {
        if (pattern.test(description)) {
          issues.push({
            severity: "P2",
            code: "skill.description-too-broad",
            title: "Skill description may trigger too broadly",
            evidence: description,
            suggestion: "Narrow the description to concrete tasks, file types, or domain signals."
          });
          break;
        }
      }
    }

    issues.push(...detectTextIssues(skillText, skillMd));
  }

  const files = await fg(["**/*"], {
    cwd: absoluteDir,
    onlyFiles: true,
    dot: true,
    ignore: ["node_modules/**", ".git/**", "dist/**", "build/**"]
  });
  issues.push(...await detectDependencyAndBinaryIssues(absoluteDir, files));

  const referencedPaths = extractReferencedPaths(skillText);
  for (const rel of referencedPaths) {
    if (!(await fileExists(path.join(absoluteDir, rel)))) {
      issues.push({
        severity: "P3",
        code: "skill.reference-missing",
        title: "Referenced supporting file is missing",
        evidence: rel,
        suggestion: "Update SKILL.md or add the missing supporting file."
      });
    }
  }

  for (const rel of files) {
    if (rel === "SKILL.md") continue;
    const fullPath = path.join(absoluteDir, rel);
    const ext = path.extname(rel).toLowerCase();
    if (![".md", ".txt", ".json", ".yaml", ".yml", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".sh", ".bash", ".zsh"].includes(ext)) {
      continue;
    }

    try {
      const text = await readText(fullPath);
      issues.push(...detectTextIssues(text, rel));
    } catch {
      issues.push({
        severity: "P3",
        code: "skill.file-unreadable",
        title: "Could not read supporting file",
        evidence: rel
      });
    }
  }

  const allText = [skillText, ...files.map((file) => file)].join("\n");
  const permissions = unique(inferPermissions(allText));

  return {
    id: stableId(["skill", source, absoluteDir]),
    type: "skill",
    name,
    description,
    source,
    path: absoluteDir,
    language: inferLanguageFromFiles(files),
    permissions,
    health: healthFromIssues(issues),
    risk: mergeRisk(permissions, issues),
    issues
  };
}

function extractReferencedPaths(text: string): string[] {
  const matches = text.matchAll(/\b((?:scripts|references|templates|assets|examples)\/[^\s)`'"]+)/g);
  return unique([...matches].map((match) => toPosixPath(match[1].replace(/[.,;:]+$/, ""))));
}

async function detectDependencyAndBinaryIssues(skillDir: string, files: string[]): Promise<Issue[]> {
  const issues: Issue[] = [];
  const binaryExtensions = new Set([".exe", ".dll", ".dylib", ".so", ".node", ".bin", ".wasm"]);

  for (const rel of files) {
    const ext = path.extname(rel).toLowerCase();
    if (binaryExtensions.has(ext)) {
      issues.push({
        severity: ext === ".wasm" ? "P2" : "P1",
        code: "dependency.binary-file",
        title: "Binary artifact included in skill package",
        evidence: rel,
        suggestion: "Review binary provenance and prefer source builds or documented checksums."
      });
    }
  }

  const packageJson = path.join(skillDir, "package.json");
  if (await fileExists(packageJson)) {
    try {
      const parsed = JSON.parse(await readText(packageJson)) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      for (const name of ["preinstall", "install", "postinstall", "prepare"]) {
        if (parsed.scripts?.[name]) {
          issues.push({
            severity: "P1",
            code: "dependency.npm-lifecycle-script",
            title: "npm lifecycle script can execute during install",
            evidence: `package.json scripts.${name}`,
            suggestion: "Audit this script before installing dependencies."
          });
        }
      }
      for (const [name, version] of Object.entries({
        ...parsed.dependencies,
        ...parsed.devDependencies,
        ...parsed.optionalDependencies
      })) {
        if (/^(?:git\+|https?:|file:)|\*/i.test(String(version))) {
          issues.push({
            severity: "P2",
            code: "dependency.npm-unpinned-or-remote",
            title: "npm dependency uses a remote, local, or broad version specifier",
            evidence: `${name}@${version}`,
            suggestion: "Pin dependency versions and review remote sources before execution."
          });
        }
      }
    } catch (error) {
      issues.push({
        severity: "P2",
        code: "dependency.package-json-unreadable",
        title: "package.json could not be parsed for dependency audit",
        evidence: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const requirements = path.join(skillDir, "requirements.txt");
  if (await fileExists(requirements)) {
    const raw = await readText(requirements);
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (/^(?:git\+|https?:)|\s+-e\s+/i.test(trimmed) || !/[=<>~!]=?/.test(trimmed)) {
        issues.push({
          severity: "P2",
          code: "dependency.pip-unpinned-or-remote",
          title: "Python dependency is remote, editable, or unpinned",
          evidence: trimmed.slice(0, 180),
          suggestion: "Pin Python dependencies and review remote package sources."
        });
      }
    }
  }

  const pyproject = path.join(skillDir, "pyproject.toml");
  if (await fileExists(pyproject)) {
    const raw = await readText(pyproject);
    if (/dependencies\s*=/.test(raw) && /(?:git\+|https?:|\*)/i.test(raw)) {
      issues.push({
        severity: "P2",
        code: "dependency.pyproject-remote",
        title: "pyproject dependency section references broad or remote sources",
        evidence: "pyproject.toml",
        suggestion: "Review Python dependency sources before installing."
      });
    }
  }

  return issues;
}
