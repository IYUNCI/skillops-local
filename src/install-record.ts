import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

export const SKILL_INSTALL_RECORD = ".skillops-install.json";

export type SkillInstallRecord = {
  schemaVersion: "skillops.install.v1";
  sourceType: "github" | "market" | "manual";
  sourceUrl: string;
  repoUrl?: string;
  sourceSubdir?: string;
  branch?: string;
  installedCommit?: string;
  installedAt: string;
  installedBy: "skillops";
};

export type SkillUpdateStatus = {
  path: string;
  record?: SkillInstallRecord;
  status: "unknown" | "current" | "update-available" | "check-failed";
  installedCommit?: string;
  remoteCommit?: string;
  message?: string;
};

export async function writeSkillInstallRecord(skillPath: string, record: SkillInstallRecord): Promise<void> {
  await writeFile(path.join(skillPath, SKILL_INSTALL_RECORD), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export async function readSkillInstallRecord(skillPath: string): Promise<SkillInstallRecord | undefined> {
  const recordPath = path.join(skillPath, SKILL_INSTALL_RECORD);
  if (!existsSync(recordPath)) return undefined;
  const parsed = JSON.parse(await readFile(recordPath, "utf8")) as Partial<SkillInstallRecord>;
  if (parsed.schemaVersion !== "skillops.install.v1" || typeof parsed.sourceUrl !== "string") return undefined;
  return {
    schemaVersion: "skillops.install.v1",
    sourceType: parsed.sourceType ?? "manual",
    sourceUrl: parsed.sourceUrl,
    repoUrl: parsed.repoUrl,
    sourceSubdir: parsed.sourceSubdir,
    branch: parsed.branch,
    installedCommit: parsed.installedCommit,
    installedAt: parsed.installedAt ?? "",
    installedBy: "skillops"
  };
}

export async function checkSkillUpdate(skillPath: string): Promise<SkillUpdateStatus> {
  const record = await readSkillInstallRecord(skillPath);
  if (!record?.repoUrl) {
    return {
      path: skillPath,
      record,
      status: "unknown",
      installedCommit: record?.installedCommit,
      message: "No SkillOps install record with a git source was found."
    };
  }

  try {
    const remoteCommit = await gitOutput(["ls-remote", record.repoUrl, record.branch || "HEAD"]);
    const hash = remoteCommit.split(/\s+/)[0];
    if (!hash) throw new Error("git ls-remote returned no commit hash.");
    return {
      path: skillPath,
      record,
      status: record.installedCommit && hash !== record.installedCommit ? "update-available" : "current",
      installedCommit: record.installedCommit,
      remoteCommit: hash
    };
  } catch (error) {
    return {
      path: skillPath,
      record,
      status: "check-failed",
      installedCommit: record.installedCommit,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function currentGitCommit(repoPath: string): Promise<string | undefined> {
  try {
    return await gitOutput(["-C", repoPath, "rev-parse", "HEAD"]);
  } catch {
    return undefined;
  }
}

export async function gitOutput(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `git ${args.join(" ")} failed with code ${code}`));
    });
  });
}
