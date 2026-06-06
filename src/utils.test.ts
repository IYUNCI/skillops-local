import { describe, expect, it } from "vitest";
import { homedir } from "node:os";
import path from "node:path";
import { expandHome, stableId, unique, toPosixPath, pathExistsSync } from "./utils.js";

describe("expandHome", () => {
  it("expands ~ alone to homedir", () => {
    expect(expandHome("~")).toBe(homedir());
  });

  it("expands ~/path to homedir/path", () => {
    expect(expandHome("~/foo/bar")).toBe(path.join(homedir(), "foo/bar"));
  });

  it("returns non-tilde paths unchanged", () => {
    expect(expandHome("/usr/local")).toBe("/usr/local");
    expect(expandHome("relative")).toBe("relative");
  });

  it("does not expand tilde in middle of path", () => {
    expect(expandHome("/home/~user")).toBe("/home/~user");
  });
});

describe("stableId", () => {
  it("joins parts with colons", () => {
    expect(stableId(["a", "b", "c"])).toBe("a:b:c");
  });

  it("filters out undefined parts", () => {
    expect(stableId(["a", undefined, "c"])).toBe("a:c");
  });

  it("replaces special characters with hyphens", () => {
    expect(stableId(["hello world", "foo/bar"])).toBe("hello-world:foo-bar");
  });

  it("keeps allowed characters intact", () => {
    expect(stableId(["my.skill", "v1.0"])).toBe("my.skill:v1.0");
  });

  it("handles empty array", () => {
    expect(stableId([])).toBe("");
  });
});

describe("unique", () => {
  it("removes duplicates", () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it("preserves order", () => {
    expect(unique(["b", "a", "b", "c"])).toEqual(["b", "a", "c"]);
  });

  it("handles empty array", () => {
    expect(unique([])).toEqual([]);
  });

  it("works with strings", () => {
    expect(unique(["Markdown", "TypeScript", "Markdown"])).toEqual(["Markdown", "TypeScript"]);
  });
});

describe("toPosixPath", () => {
  it("converts path separators to forward slashes", () => {
    // On macOS/Linux this is a no-op since sep is already /
    const input = ["a", "b", "c"].join(path.sep);
    expect(toPosixPath(input)).toBe("a/b/c");
  });
});

describe("pathExistsSync", () => {
  it("returns true for existing paths", () => {
    expect(pathExistsSync(__filename)).toBe(true);
  });

  it("returns false for non-existing paths", () => {
    expect(pathExistsSync("/this/does/not/exist/at/all")).toBe(false);
  });
});
