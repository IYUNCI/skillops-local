import { access, readFile, stat } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return path.join(homedir(), input.slice(2));
  return input;
}

export async function fileExists(input: string): Promise<boolean> {
  try {
    await access(input, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(input: string): Promise<boolean> {
  try {
    return (await stat(input)).isDirectory();
  } catch {
    return false;
  }
}

export async function readText(input: string): Promise<string> {
  return readFile(input, "utf8");
}

export function toPosixPath(input: string): string {
  return input.split(path.sep).join("/");
}

export function stableId(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(":").replace(/[^a-zA-Z0-9_.:-]+/g, "-");
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function pathExistsSync(input: string): boolean {
  return existsSync(input);
}

