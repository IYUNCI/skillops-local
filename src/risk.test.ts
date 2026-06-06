import { describe, expect, it } from "vitest";
import {
  riskFromScore,
  scorePermissions,
  healthFromIssues,
  issueScore,
  mergeRisk
} from "./risk.js";
import type { Issue, PermissionHint } from "./types.js";

describe("riskFromScore", () => {
  it("returns low for score 0", () => {
    expect(riskFromScore(0)).toBe("low");
  });

  it("returns low for score 2", () => {
    expect(riskFromScore(2)).toBe("low");
  });

  it("returns medium for score 3", () => {
    expect(riskFromScore(3)).toBe("medium");
  });

  it("returns medium for score 6", () => {
    expect(riskFromScore(6)).toBe("medium");
  });

  it("returns high for score 7", () => {
    expect(riskFromScore(7)).toBe("high");
  });

  it("returns high for score 10", () => {
    expect(riskFromScore(10)).toBe("high");
  });

  it("returns critical for score 11", () => {
    expect(riskFromScore(11)).toBe("critical");
  });

  it("returns critical for score 20", () => {
    expect(riskFromScore(20)).toBe("critical");
  });
});

describe("scorePermissions", () => {
  it("returns 0 for empty permissions", () => {
    expect(scorePermissions([])).toBe(0);
  });

  it("scores local-files-read as 1", () => {
    expect(scorePermissions(["local-files-read"])).toBe(1);
  });

  it("scores shell as 5", () => {
    expect(scorePermissions(["shell"])).toBe(5);
  });

  it("adds up multiple permissions", () => {
    const permissions: PermissionHint[] = ["local-files-read", "local-files-write", "shell"];
    expect(scorePermissions(permissions)).toBe(1 + 3 + 5);
  });

  it("deduplicates permissions", () => {
    const permissions: PermissionHint[] = ["shell", "shell", "shell"];
    expect(scorePermissions(permissions)).toBe(5);
  });

  it("scores payment-or-trade as 6", () => {
    expect(scorePermissions(["payment-or-trade"])).toBe(6);
  });

  it("scores cloud-resource-write as 6", () => {
    expect(scorePermissions(["cloud-resource-write"])).toBe(6);
  });
});

describe("healthFromIssues", () => {
  it("returns ok for empty issues", () => {
    expect(healthFromIssues([])).toBe("ok");
  });

  it("returns broken for P0 issues", () => {
    const issues: Issue[] = [
      { severity: "P0", code: "secret.detected", title: "Test" }
    ];
    expect(healthFromIssues(issues)).toBe("broken");
  });

  it("returns broken for P1 issues", () => {
    const issues: Issue[] = [
      { severity: "P1", code: "prompt-injection", title: "Test" }
    ];
    expect(healthFromIssues(issues)).toBe("broken");
  });

  it("returns warning for P2 issues", () => {
    const issues: Issue[] = [
      { severity: "P2", code: "missing-metadata", title: "Test" }
    ];
    expect(healthFromIssues(issues)).toBe("warning");
  });

  it("returns warning for P3 issues", () => {
    const issues: Issue[] = [
      { severity: "P3", code: "missing-file", title: "Test" }
    ];
    expect(healthFromIssues(issues)).toBe("warning");
  });

  it("returns broken if any P0 exists among other issues", () => {
    const issues: Issue[] = [
      { severity: "P3", code: "a", title: "minor" },
      { severity: "P0", code: "b", title: "critical" }
    ];
    expect(healthFromIssues(issues)).toBe("broken");
  });
});

describe("issueScore", () => {
  it("returns 0 for empty issues", () => {
    expect(issueScore([])).toBe(0);
  });

  it("returns 11 for P0", () => {
    expect(issueScore([{ severity: "P0", code: "a", title: "a" }])).toBe(11);
  });

  it("returns 5 for P1", () => {
    expect(issueScore([{ severity: "P1", code: "a", title: "a" }])).toBe(5);
  });

  it("returns 2 for P2", () => {
    expect(issueScore([{ severity: "P2", code: "a", title: "a" }])).toBe(2);
  });

  it("returns 1 for P3", () => {
    expect(issueScore([{ severity: "P3", code: "a", title: "a" }])).toBe(1);
  });

  it("P0 takes precedence over P1", () => {
    expect(issueScore([
      { severity: "P1", code: "a", title: "a" },
      { severity: "P0", code: "b", title: "b" }
    ])).toBe(11);
  });
});

describe("mergeRisk", () => {
  it("returns low for no permissions and no issues", () => {
    expect(mergeRisk([], [])).toBe("low");
  });

  it("returns critical for shell + P0 issue", () => {
    expect(mergeRisk(["shell"], [{ severity: "P0", code: "a", title: "a" }])).toBe("critical");
  });

  it("caps permission score at 6 before adding issue score", () => {
    // payment-or-trade = 6, cloud-resource-write = 6 → capped at 6
    // P2 = 2 → total = 8 → high
    const permissions: PermissionHint[] = ["payment-or-trade", "cloud-resource-write"];
    const issues: Issue[] = [{ severity: "P2", code: "a", title: "a" }];
    expect(mergeRisk(permissions, issues)).toBe("high");
  });
});
