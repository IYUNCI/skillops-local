import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type HistoryEntry = {
  id: string;
  at: string;
  action: string;
  subject: string;
  details: Record<string, unknown>;
};

const HISTORY_FILE = path.join(homedir(), ".skillops", "history.jsonl");

export async function recordHistory(
  action: string,
  subject: string,
  details: Record<string, unknown> = {}
): Promise<HistoryEntry> {
  const entry: HistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    at: new Date().toISOString(),
    action,
    subject,
    details
  };
  await mkdir(path.dirname(HISTORY_FILE), { recursive: true });
  await appendFile(HISTORY_FILE, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export async function listHistory(limit = 200): Promise<HistoryEntry[]> {
  if (!existsSync(HISTORY_FILE)) return [];
  const raw = await readFile(HISTORY_FILE, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HistoryEntry)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

export async function replaceHistoryForTests(entries: HistoryEntry[]): Promise<void> {
  await mkdir(path.dirname(HISTORY_FILE), { recursive: true });
  await writeFile(HISTORY_FILE, entries.map((entry) => JSON.stringify(entry)).join("\n"), "utf8");
}
