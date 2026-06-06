import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Capability } from "./types.js";
import { recordHistory } from "./history.js";
import { removeMcpServerConfig } from "./mcp-config.js";
import { isDirectory } from "./utils.js";

export type RemoveResult = {
  mode: RemovalMode;
  name: string;
  originalPath: string;
  trashId?: string;
  trashPath?: string;
  deleted: boolean;
};

export type RemovalMode = "trash" | "delete";

export type TrashItem = {
  id: string;
  name: string;
  trashPath: string;
  originalPath?: string;
  trashedAt?: string;
  canRestore: boolean;
};

export type RemoveCapabilityResult = RemoveResult | {
  mode: "config";
  name: string;
  configPath: string;
  deleted: true;
};

const TRASH_META_FILE = ".skillops-trash.json";

export async function removeSkill(
  capabilityId: string,
  capabilities: Capability[],
  mode: RemovalMode = "trash"
): Promise<RemoveResult> {
  const capability = capabilities.find((item) => item.id === capabilityId);
  if (!capability) throw new Error(`Capability not found: ${capabilityId}`);
  if (capability.type !== "skill") throw new Error("Only skill capabilities can be removed.");
  if (!capability.path) throw new Error("This skill does not have a removable local path.");

  const skillPath = path.resolve(capability.path);
  if (!(await isDirectory(skillPath))) throw new Error(`Skill path is not a directory: ${skillPath}`);
  if (!isSafeSkillPath(skillPath)) {
    throw new Error(`Refusing to remove a skill outside supported skill directories: ${skillPath}`);
  }

  if (mode === "delete") {
    await rm(skillPath, { recursive: true, force: false });
    await recordHistory("skill.delete", capability.name, { originalPath: skillPath });
    return {
      mode,
      name: capability.name,
      originalPath: skillPath,
      deleted: true
    };
  }

  const trashRoot = path.join(homedir(), ".skillops", "trash");
  await mkdir(trashRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const trashId = `${stamp}-${path.basename(skillPath)}`;
  const trashPath = path.join(trashRoot, trashId);
  await rename(skillPath, trashPath);
  await writeFile(path.join(trashPath, TRASH_META_FILE), JSON.stringify({
    id: trashId,
    name: capability.name,
    originalPath: skillPath,
    trashedAt: new Date().toISOString()
  }, null, 2));
  await recordHistory("skill.trash", capability.name, { originalPath: skillPath, trashPath });

  return {
    mode,
    name: capability.name,
    originalPath: skillPath,
    trashId,
    trashPath,
    deleted: false
  };
}

export async function removeCapability(
  capabilityId: string,
  capabilities: Capability[],
  mode: RemovalMode = "trash"
): Promise<RemoveCapabilityResult> {
  const capability = capabilities.find((item) => item.id === capabilityId);
  if (!capability) throw new Error(`Capability not found: ${capabilityId}`);

  if (capability.type === "skill") {
    return removeSkill(capabilityId, capabilities, mode);
  }

  if (capability.type === "mcp_server") {
    if (!capability.configPath) throw new Error("This MCP server does not have a removable config path.");
    const result = await removeMcpServerConfig(capability.configPath, capability.name);
    await recordHistory("mcp.remove", capability.name, { configPath: result.configPath });
    return {
      mode: "config",
      name: capability.name,
      configPath: result.configPath,
      deleted: true
    };
  }

  throw new Error(`Unsupported removable capability type: ${capability.type}`);
}

export async function listTrashItems(): Promise<TrashItem[]> {
  const root = getTrashRoot();
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const items = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry): Promise<TrashItem> => {
      const trashPath = path.join(root, entry.name);
      const metadata = await readTrashMetadata(trashPath).catch(() => undefined);
      const fallbackName = entry.name.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/, "");
      const itemStat = await stat(trashPath);
      return {
        id: entry.name,
        name: metadata?.name || fallbackName,
        trashPath,
        originalPath: metadata?.originalPath,
        trashedAt: metadata?.trashedAt || itemStat.mtime.toISOString(),
        canRestore: Boolean(metadata?.originalPath)
      };
    }));

  return items.sort((a, b) => String(b.trashedAt ?? "").localeCompare(String(a.trashedAt ?? "")));
}

export async function restoreTrashItem(trashId: string): Promise<TrashItem> {
  const item = await getTrashItem(trashId);
  if (!item.originalPath) throw new Error("This trash item does not include its original path and cannot be restored automatically.");
  const originalPath = path.resolve(item.originalPath);
  if (!isSafeSkillPath(originalPath)) {
    throw new Error(`Refusing to restore a skill outside supported skill directories: ${originalPath}`);
  }
  if (existsSync(originalPath)) throw new Error(`Cannot restore because the target already exists: ${originalPath}`);
  await mkdir(path.dirname(originalPath), { recursive: true });
  await rm(path.join(item.trashPath, TRASH_META_FILE), { force: true });
  await rename(item.trashPath, originalPath);
  await recordHistory("skill.restore", item.name, { originalPath, trashPath: item.trashPath });
  return {
    ...item,
    trashPath: originalPath
  };
}

export async function deleteTrashItem(trashId: string): Promise<TrashItem> {
  const item = await getTrashItem(trashId);
  await rm(item.trashPath, { recursive: true, force: false });
  await recordHistory("trash.delete", item.name, { trashPath: item.trashPath, originalPath: item.originalPath });
  return item;
}

async function getTrashItem(trashId: string): Promise<TrashItem> {
  const trashPath = safeTrashPath(trashId);
  if (!(await isDirectory(trashPath))) throw new Error(`Trash item not found: ${trashId}`);
  const items = await listTrashItems();
  const item = items.find((candidate) => candidate.id === trashId);
  if (!item) throw new Error(`Trash item not found: ${trashId}`);
  return item;
}

async function readTrashMetadata(trashPath: string): Promise<Partial<TrashItem> | undefined> {
  const metadataPath = path.join(trashPath, TRASH_META_FILE);
  if (!existsSync(metadataPath)) return undefined;
  const parsed = JSON.parse(await readFile(metadataPath, "utf8"));
  return {
    name: typeof parsed.name === "string" ? parsed.name : undefined,
    originalPath: typeof parsed.originalPath === "string" ? parsed.originalPath : undefined,
    trashedAt: typeof parsed.trashedAt === "string" ? parsed.trashedAt : undefined
  };
}

function getTrashRoot(): string {
  return path.join(homedir(), ".skillops", "trash");
}

function safeTrashPath(trashId: string): string {
  const root = path.resolve(getTrashRoot());
  const candidate = path.resolve(root, trashId);
  if (!candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Refusing to access trash item outside SkillOps trash: ${trashId}`);
  }
  return candidate;
}

function isSafeSkillPath(skillPath: string): boolean {
  const safeRoots = [
    path.join(homedir(), ".codex", "skills"),
    path.join(homedir(), ".agents", "skills"),
    path.join(homedir(), ".claude", "skills")
  ].map((root) => `${path.resolve(root)}${path.sep}`);

  const resolved = path.resolve(skillPath);
  return safeRoots.some((root) => resolved.startsWith(root)) || /\/skills\/[^/]+$/.test(resolved);
}
