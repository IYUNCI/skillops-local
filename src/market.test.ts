import { describe, expect, it } from "vitest";
import { parseGitHubSource } from "./market.js";

describe("parseGitHubSource", () => {
  it("parses owner/repo shorthand", () => {
    const result = parseGitHubSource("anthropics/skills");
    expect(result.repoUrl).toBe("https://github.com/anthropics/skills.git");
    expect(result.subdir).toBeUndefined();
    expect(result.branch).toBeUndefined();
  });

  it("parses owner/repo with dots and hyphens", () => {
    const result = parseGitHubSource("my-org/my.repo");
    expect(result.repoUrl).toBe("https://github.com/my-org/my.repo.git");
  });

  it("parses full GitHub URL without tree", () => {
    const result = parseGitHubSource("https://github.com/anthropics/skills");
    expect(result.repoUrl).toBe("https://github.com/anthropics/skills.git");
    expect(result.subdir).toBeUndefined();
    expect(result.branch).toBeUndefined();
  });

  it("parses full GitHub URL with tree and branch", () => {
    const result = parseGitHubSource("https://github.com/anthropics/skills/tree/main/skills/pdf");
    expect(result.repoUrl).toBe("https://github.com/anthropics/skills.git");
    expect(result.branch).toBe("main");
    expect(result.subdir).toBe("skills/pdf");
  });

  it("parses GitHub URL with multi-level subdir", () => {
    const result = parseGitHubSource("https://github.com/owner/repo/tree/develop/path/to/deep/skill");
    expect(result.repoUrl).toBe("https://github.com/owner/repo.git");
    expect(result.branch).toBe("develop");
    expect(result.subdir).toBe("path/to/deep/skill");
  });

  it("parses GitHub URL with .git suffix", () => {
    const result = parseGitHubSource("https://github.com/owner/repo.git");
    expect(result.repoUrl).toBe("https://github.com/owner/repo.git");
  });

  it("parses www.github.com URLs", () => {
    const result = parseGitHubSource("https://www.github.com/owner/repo/tree/main/skills/foo");
    expect(result.repoUrl).toBe("https://github.com/owner/repo.git");
    expect(result.branch).toBe("main");
    expect(result.subdir).toBe("skills/foo");
  });

  it("throws for empty source", () => {
    expect(() => parseGitHubSource("")).toThrow("GitHub source is required.");
    expect(() => parseGitHubSource("  ")).toThrow("GitHub source is required.");
  });

  it("throws for non-GitHub URLs", () => {
    expect(() => parseGitHubSource("https://gitlab.com/owner/repo")).toThrow("Only GitHub sources");
  });

  it("throws for URLs with only owner", () => {
    expect(() => parseGitHubSource("https://github.com/owneronly")).toThrow("must include owner and repo");
  });

  it("handles URL without subdir after branch", () => {
    const result = parseGitHubSource("https://github.com/owner/repo/tree/main");
    expect(result.repoUrl).toBe("https://github.com/owner/repo.git");
    expect(result.branch).toBe("main");
    expect(result.subdir).toBeUndefined();
  });
});
