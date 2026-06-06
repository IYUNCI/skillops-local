import path from "node:path";
import type { Issue, PermissionHint, RiskLevel } from "./types.js";
import { riskFromScore, scorePermissions } from "./risk.js";
import { unique } from "./utils.js";

const secretPatterns = [
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
  /\bsk-[a-zA-Z0-9_-]{20,}\b/,
  /\bghp_[a-zA-Z0-9]{30,}\b/,
  /\bxox[baprs]-[a-zA-Z0-9-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/
];

const promptInjectionPatterns = [
  /ignore (all )?(previous|system|developer) instructions/i,
  /do not (tell|inform|reveal|mention) (the )?user/i,
  /hide (this|these) (instruction|behavior|message)/i,
  /exfiltrate|data exfiltration/i
];

const dangerousCommandPatterns = [
  /\brm\s+-rf\s+(?:\/|\$HOME|~|\*)/,
  /\bcurl\b[^|\n]*\|\s*(?:sh|bash|zsh)\b/,
  /\bwget\b[^|\n]*\|\s*(?:sh|bash|zsh)\b/,
  /\beval\s*\(/,
  /\bchmod\s+777\b/,
  /\bbase64\s+-d\b[^|\n]*\|\s*(?:sh|bash|zsh|python|node)\b/,
  /\bsecurity\s+find-(?:generic|internet)-password\b/,
  /\.ssh\/(?:id_rsa|id_ed25519|config)/,
  /\b(?:sudo\s+)?(?:dd|mkfs|diskutil\s+eraseDisk)\b/
];

export function detectTextIssues(text: string, fileLabel: string): Issue[] {
  const issues: Issue[] = [];

  for (const pattern of secretPatterns) {
    if (pattern.test(text)) {
      issues.push({
        severity: "P0",
        code: "secret.detected",
        title: "Possible secret or private key detected",
        evidence: fileLabel,
        suggestion: "Remove secrets from the capability package and load them from environment variables."
      });
      break;
    }
  }

  for (const pattern of promptInjectionPatterns) {
    if (pattern.test(text)) {
      issues.push({
        severity: "P1",
        code: "prompt-injection.pattern",
        title: "Prompt injection-like instruction detected",
        evidence: fileLabel,
        suggestion: "Remove hidden or instruction-overriding behavior from the skill."
      });
      break;
    }
  }

  for (const pattern of dangerousCommandPatterns) {
    if (pattern.test(text)) {
      const isDocumentation = /\.(?:md|mdx|txt)$/i.test(fileLabel);
      issues.push({
        severity: isDocumentation ? "P2" : "P1",
        code: "dangerous-command.pattern",
        title: isDocumentation
          ? "Dangerous shell command pattern mentioned in documentation"
          : "Dangerous shell command pattern detected",
        evidence: fileLabel,
        suggestion: isDocumentation
          ? "Review whether this is an example or an executable instruction."
          : "Require explicit user approval and explain why this command is necessary."
      });
      break;
    }
  }

  return issues;
}

export function inferPermissions(text: string): PermissionHint[] {
  const lower = text.toLowerCase();
  const permissions: PermissionHint[] = [];

  if (/(readfile|read file|fs\.read|cat\s|open\(|download|读取|查看)/i.test(text)) {
    permissions.push("local-files-read");
  }
  if (/(writefile|write file|fs\.write|apply_patch|rm\s|mv\s|cp\s|delete|删除|写入|修改)/i.test(text)) {
    permissions.push("local-files-write");
  }
  if (/(exec|spawn|shell|bash|zsh|subprocess|child_process|运行命令|执行命令)/i.test(text)) {
    permissions.push("shell");
  }
  if (/(fetch|axios|http|https|curl|wget|webhook|api|network|联网|请求)/i.test(text)) {
    permissions.push("network");
  }
  if (/(process\.env|environment variable|env var|api key|token|secret|密钥|环境变量)/i.test(text)) {
    permissions.push("env-read");
  }
  if (/(send message|slack|feishu|lark|email|mail|im\.message|发消息|发送)/i.test(text)) {
    permissions.push("message-send");
  }
  if (/(insert|update|delete from|drop table|database write|sql|supabase|postgres|mysql|写数据库)/i.test(text)) {
    permissions.push("database-write");
  }
  if (/(aws|azure|gcloud|terraform|kubectl|docker|deploy|cloud resource|部署|云资源)/i.test(text)) {
    permissions.push("cloud-resource-write");
  }
  if (/(payment|stripe|checkout|trade|trading|crypto|buy|sell|支付|交易)/i.test(lower)) {
    permissions.push("payment-or-trade");
  }

  return unique(permissions);
}

export function inferLanguageFromFiles(files: string[]): string[] {
  const languages = new Set<string>();

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext === ".md" || ext === ".mdx") languages.add("Markdown");
    if (ext === ".ts" || ext === ".tsx") languages.add("TypeScript");
    if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") languages.add("JavaScript");
    if (ext === ".py") languages.add("Python");
    if (ext === ".sh" || ext === ".bash" || ext === ".zsh") languages.add("Shell");
    if (ext === ".go") languages.add("Go");
    if (ext === ".rs") languages.add("Rust");
    if (ext === ".java" || ext === ".kt") languages.add("JVM");
    if (ext === ".cs") languages.add("C#");
    if (ext === ".rb") languages.add("Ruby");
    if (ext === ".php") languages.add("PHP");
    if (ext === ".swift") languages.add("Swift");
  }

  return [...languages].sort();
}

export function toolRisk(name: string, description = ""): { risk: RiskLevel; permissions: PermissionHint[] } {
  const text = `${name}\n${description}`;
  const permissions = inferPermissions(text);
  return { permissions, risk: riskFromScore(scorePermissions(permissions)) };
}
