import type { Issue, PermissionHint, RiskLevel } from "./types.js";

export function riskFromScore(score: number): RiskLevel {
  if (score >= 11) return "critical";
  if (score >= 7) return "high";
  if (score >= 3) return "medium";
  return "low";
}

export function scorePermissions(permissions: PermissionHint[]): number {
  const scores: Record<PermissionHint, number> = {
    "local-files-read": 1,
    "local-files-write": 3,
    shell: 5,
    network: 2,
    "env-read": 4,
    "message-send": 4,
    "database-write": 5,
    "cloud-resource-write": 6,
    "payment-or-trade": 6,
    unknown: 1
  };

  return [...new Set(permissions)].reduce((sum, permission) => sum + scores[permission], 0);
}

export function healthFromIssues(issues: Issue[]): "ok" | "warning" | "broken" {
  if (issues.some((issue) => issue.severity === "P0" || issue.severity === "P1")) return "broken";
  if (issues.length > 0) return "warning";
  return "ok";
}

export function issueScore(issues: Issue[]): number {
  if (issues.some((issue) => issue.severity === "P0")) return 11;
  if (issues.some((issue) => issue.severity === "P1")) return 5;
  if (issues.some((issue) => issue.severity === "P2")) return 2;
  if (issues.some((issue) => issue.severity === "P3")) return 1;
  return 0;
}

export function mergeRisk(permissions: PermissionHint[], issues: Issue[]): RiskLevel {
  return riskFromScore(Math.min(scorePermissions(permissions), 6) + issueScore(issues));
}
