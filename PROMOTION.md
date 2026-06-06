# SkillOps Local 开源发布文案 / Open Source Launch Copy

## 中文（朋友圈 / 群 / 社区可直接用）

### 标题
SkillOps Local 开源了：你本地的 AI + MCP 技能总管，一次安装，统一管理 Skill 生态

### 简介
SkillOps Local 是一款“本地优先”的 Skill / MCP / Agent 能力管理器，目标是把杂乱的本地能力统一起来：
- 自动扫描本地和项目中的 SKILL.md / MCP 配置
- 一键安装/移除
- 风险检测与提示（脚本、密钥、危险命令）
- 实时图谱：看清 Skill、MCP、项目之间的依赖关系
- 本地 UI + CLI 双通道操作，数据默认保存在本地

### 你能做什么
- 在终端里快速扫描本地能力：`npx skillops-local ui --open`
- 本地离线管理技能，不把你的仓库和隐私直接上传到云端
- 通过权限闸门减少误删、误装和高风险脚本风险
- 生成可复现的分享包，方便团队共享可复用的 skill 说明与安装材料

### 亮点
- 本地 first 的安全理念
- 支持 Codex / Claude / Cursor MCP 配置兼容
- 支持图形化面板和命令行双入口
- 开源、可贡献、可二次开发

### 开源仓库
GitHub: https://github.com/your-org/skillops-local

### 标签
#OpenSource #MCP #Codex #Agent #TypeScript #Go #Wails #Productivity

---

## English (GitHub/LinkedIn/Twitter ready)

### Title
SkillOps Local is now open source: local-first Skill + MCP + agent operations in one place.

### Description
SkillOps Local is a local-first manager for Skill, MCP, and agent workflows. It helps you discover, install, audit, and remove local skills with confidence.

### What it does
- Scans SKILL.md and MCP configs in local folders and projects
- Installs and removes skills with safe guardrails
- Performs risk checks for risky scripts, credentials, and dangerous commands
- Builds dependency graphs for skills, MCP servers, and runtime links
- Offers both CLI and local UI workflows
- Keeps your data local-first by default

### Why it matters
Most agent tooling requires manual wiring and trust-heavy setup. SkillOps Local adds visibility and control: what to run, why it runs, and where it comes from.

### Highlights
- Local-first architecture
- Multi-client compatibility (Codex / Claude / Cursor)
- CLI + UI workflows
- Open-source and contribution-friendly

### Repository
GitHub: https://github.com/your-org/skillops-local

### Hashtags
#OpenSource #AI #MCP #TypeScript #Go #Wails #LocalFirst #DeveloperTools

## 发布说明模板（中英可直接替换）

### 中文
今天很开心分享一个新开源项目：SkillOps Local。
它支持本地扫描、可视化与治理你的 Skill/MCP 生态，强调本地优先与可控权限，适合想把 AI 工具链管理起来的个人与团队。
仓库地址：
https://github.com/your-org/skillops-local

### English
Excited to open source SkillOps Local.
A local-first toolkit for managing Skills and MCP integrations with safety checks and a unified workflow (CLI + UI). Great for teams and individuals who want a cleaner, auditable agent toolchain.
Repo: https://github.com/your-org/skillops-local

## App Store 商品页文案（中文 / English）

### 中文简介（直接复制到 App Store）
SkillOps Local 是本地优先的 Skill 与 MCP 工作台。

它把本地技能、MCP 配置、扫描与风险治理放到一个桌面客户端里，支持界面化审计、可视化依赖关系和一键管理，减少误装、误删、误执行的风险。

- 本地服务自启动与状态监控
- 扫描与风险页，聚合本机能力与项目配置
- MCP 管理页，统一查看并维护服务入口
- 更新中心，检查新版本
- 签名与安装器，辅助 macOS 原生分发

### English Product Description（App Store）
SkillOps Local is a local-first Skill and MCP desktop workbench.

Manage your local skill ecosystem, MCP configurations, scanning, risk checks, and install/remove workflows in one app.

- Local service launcher and health status
- Dedicated scan and risk page
- MCP management workspace
- Update center for release checks
- Signing and installer support for macOS packaging workflows

## 版本说明（不含 AI 提示内容）

### 中文
本次更新仅发布用户可见功能与发布文案，不包含 AI 提示词、模型实验指令或内部工程流程。可直接用于 README、Release Note、App Store 描述。

### English
This release includes only user-facing features and release copy. It intentionally excludes any AI prompt text, model-training notes, or internal dev-only prompts.

## 页面截图清单（用于发布）
- `assets/screenshots/page-home.png`
- `assets/screenshots/page-workbench.png`
- `assets/skilloips-ui.png`
- `assets/skilloips-ui@2x.png`

请在本地 `release/screenshots/` 目录放置 App Store 大小标准截图（说明文件在仓库内 `release-notes/screenshots-guide.md`），命名：
- `workbench-dashboard-mac-1.png`
- `workbench-scanner-mac-2.png`
- `workbench-mcp-mac-3.png`
- `workbench-update-mac-4.png`
- `workbench-installer-mac-5.png`
