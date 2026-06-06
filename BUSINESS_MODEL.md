# SkillOps Business Model

## Positioning

SkillOps should not monetize by charging individual developers for a local scanner.

The monetizable pain is team governance:

- Which skills are installed across the team?
- Which skills can read files, execute shell, or call APIs?
- Which MCP servers are approved?
- Which third-party skills are risky?
- Who installed what, when, and from where?
- Can the company run a private skill marketplace?

The wedge is free local utility. The business is team control plane.

## Market Signal

Comparable products show that developer AI tools monetize through team and enterprise control:

- Cursor Teams is priced around $40/user/month and sells team-wide rules, skills, automations, marketplace, analytics, centralized billing, SSO, privacy mode, and admin controls.
- Glama monetizes MCP hosting, gateway, AI credits, and managed connector infrastructure while keeping open-source MCP hosting free.
- Claude / Claude Code monetizes through Pro, Max, Team, and Enterprise plans, with enterprise features around admin controls, usage limits, access controls, and analytics.

The lesson: charge for management, policy, visibility, team sharing, and compliance, not for the existence of a local file scanner.

## Pricing Ladder

### Free

Target: individual developers.

Price: $0

Includes:

- Local scan.
- Skill lint.
- MCP doctor.
- Local market search.
- Install from GitHub.
- Remove to trash.
- Basic risk report.

Goal:

- Distribution.
- Trust.
- Community skill indexing.
- Bottom-up adoption inside teams.

### Pro

Target: solo power users and consultants.

Price: $8-12/month or $79/year

Includes:

- Advanced global search across Mac/Windows paths.
- Saved profiles.
- Multi-agent compatibility matrix.
- Exportable audit reports.
- Skill version snapshots.
- Backup and restore.
- AI-assisted skill review.

Buy trigger:

- "I use Codex, Claude Code, Cursor, and Antigravity every day, and I need my setup organized."

### Team

Target: 3-100 person engineering/product teams.

Price: $12-20/user/month

Includes:

- Shared private skill catalog.
- Team-approved skill allowlist.
- Team MCP server registry.
- Install policy templates.
- Team-wide risk dashboard.
- Audit log.
- Role-based approval for high-risk skills.
- GitHub/Slack/Lark notifications.
- Centralized billing.

Buy trigger:

- "Our team is installing random skills and MCP servers, and nobody knows what can access company data."

### Enterprise

Target: regulated or security-sensitive organizations.

Price: custom, likely $15k-80k/year depending on seats and deployment.

Includes:

- SSO/SAML/OIDC.
- SCIM.
- Private deployment.
- Private registry mirror.
- Custom risk policies.
- Legal/security reports.
- MCP gateway policy enforcement.
- Data residency.
- Admin API.
- Priority support.

Buy trigger:

- "We want AI agents, but security needs visibility and controls before approving them."

## Marketplace Revenue

Do not start with marketplace take-rate. Start with trust.

Later revenue options:

1. Featured listings for skill authors.
2. Verified publisher badges.
3. Paid private catalogs.
4. Revenue share on paid skills.
5. Hosted MCP/skill gateway.

Possible take rate:

- 10-20% on paid skill sales.
- $99-499/month for verified publisher tooling.

The marketplace only works after SkillOps becomes the place people trust for risk scoring and installation.

## Highest-Probability First Revenue

The first paid product should be Team, not Pro.

Why:

- Individual developers resist paying for local utilities.
- Teams already pay for Cursor, GitHub, Linear, Sentry, 1Password, and security tooling.
- The problem gets worse with every additional agent, skill, and MCP server.
- Team admins need audit logs, allowlists, and policies.

First paid feature:

```text
Private Team Catalog + Approved Skill Policy
```

Minimum Team SKU:

- Upload or register internal skills.
- Mark public skills as approved/blocked.
- Generate install profile for Codex/Claude/Cursor/Antigravity.
- See team risk report.

## Go-To-Market

### Phase 1: Open Source Wedge

Ship the local CLI free and open.

Launch message:

```text
Find every SKILL.md and MCP server on your machine.
Audit what your AI agents can do before they do it.
```

Channels:

- GitHub
- Hacker News
- Product Hunt
- X / LinkedIn demos
- Reddit communities for Claude Code, Codex, Cursor, MCP
- Awesome skill directories

### Phase 2: Trust Layer

Publish public risk reports:

- "Top 100 public skills by risk level"
- "Common prompt injection patterns in SKILL.md"
- "MCP server permission taxonomy"

This builds credibility and SEO.

### Phase 3: Team Pilot

Offer 5-10 design partners:

- Free setup.
- Their internal skills indexed.
- Private allowlist.
- Weekly audit report.

Charge after value is proven:

- $500/month pilot
- then convert to $12-20/user/month or annual contract

## Product Packaging

Free local product:

```bash
npx skillops-local ui --open
```

Team product:

```text
skillops cloud login
skillops team sync
skillops policy apply
```

Enterprise product:

```text
Self-hosted control plane + local agents + private registry + MCP gateway
```

## What Not To Charge For

Do not charge for:

- Basic local scan.
- Basic lint.
- Basic remove/install.
- Viewing public skill listings.

These are distribution features.

Charge for:

- Team-wide visibility.
- Shared policies.
- Private catalogs.
- Audit logs.
- Approval workflows.
- Compliance exports.
- Hosted gateway.
- Support.

## Risks

### Risk 1: Platforms Build This Natively

Codex, Claude Code, Cursor, and Antigravity may add built-in skill managers.

Defense:

- Cross-platform neutrality.
- Better market search.
- Better risk scoring.
- Team policy layer across all agents.

### Risk 2: Marketplace Quality Is Low

Public skill directories may be noisy.

Defense:

- Risk scoring.
- Verified publishers.
- Usage examples.
- Install-time linting.
- Human-curated categories.

### Risk 3: Local Permissions Feel Scary

Users may hesitate to give a tool access to local skill folders.

Defense:

- Local-first.
- Open source scanner.
- Read-only mode.
- Trash instead of delete.
- Clear permission explanations.

## 12-Month Revenue Path

Month 1-2:

- Open source local CLI.
- Get 1,000+ GitHub stars or 2,000+ npm downloads.
- Add public skill catalog indexing.

Month 3-4:

- Launch Pro backup/reporting.
- Start design partner outreach.

Month 5-6:

- Launch Team private catalog.
- Close 3-5 pilots at $500/month.

Month 7-9:

- Add SSO, audit logs, policy templates.
- Convert pilots to $5k-20k/year.

Month 10-12:

- Add hosted MCP gateway / policy enforcement.
- Start enterprise pilots.

Target:

- $5k MRR by month 6.
- $20k MRR by month 12 if team governance pain is real.

