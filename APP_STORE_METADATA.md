# SkillOps Local - App Store Metadata

## App Store 本地化文案（可直接粘贴）

### 应用名称
SkillOps Local

发布者（公司/作者）：云磁数字 / yunpai

### 副标题（英文）
Local-first Skill and MCP Workbench for developers and AI agent teams

### 副标题（中文）
本地优先的 Skill 与 MCP 能力工作台（云磁数字）

### 关键词
SkillOps, Skills, MCP, Agent, Codex, Claude, 生产力, 本地优先, 安全, macOS, AI

### 分类
生产力 Productivity / Developer Tools

### 描述（中文）
SkillOps Local 是一款面向个人与团队的本地 AI/Agent 能力管理客户端。它聚合本地 Skill、MCP 与本机环境，提供扫描、风险审计、关系图谱、安装/更新和签名打包闭环，让桌面端成为可控、可审计、可协作的 AI 能力中心。

它运行在用户电脑上，不依赖云端保存你的本地技能配置。你可以：

- 扫描本地 `SKILL.md`、MCP 配置、命令与安全风险点
- 可视化管理 Skill/MCP 关系，快速排查来源、风险与配置
- 一键安装与移除 Skill，支持 Codex / Claude / Cursor 使用场景
- 在桌面端统一管理：仪表盘、扫描与风险、MCP 管理、更新中心、签名与安装器
- 具备原生菜单、更新检测与打包/签名能力（适配 macOS 分发）

当前版本支持 macOS 与 Windows。

说明：所有能力的使用说明与风险检测结果均有界面化入口，便于团队协作治理。

### Description (English)
SkillOps Local is a local-first desktop client for managing your Skill and MCP ecosystem on your own machine.
It helps you discover resources, visualize dependencies, perform risk checks, and complete install/update workflows while keeping control local-first.

It helps you scan local `SKILL.md`, MCP settings, command definitions, and risk signals, then manage discovery, install, and removal workflows in one place.

- Visualize dependencies across skills, MCP servers, and runtime context
- Run local audits with safety guidance before installing or executing risky operations
- Use one app for scan/risk, MCP management, updates, and packaging workflow
- Includes native app capabilities such as menu actions, update checks, and installer/signer helpers
- Supports macOS and Windows in the local-first model

No user code or credentials are required to be uploaded by default.

### 支持 URL（示例）
https://github.com/IYUNCI/skillops-local

### 隐私说明（可直接粘贴）
- SkillOps Local 默认在本地扫描和处理文件，相关日志与配置保存在本机。
- 本应用会在启动桌面服务时读取本地目录以提供扫描与管理功能。
- 不会上传你的本地私密技能配置或凭证到第三方服务。
- 仅在你主动触发安装/发布流程时，才会写入本地持久化状态文件（如 `.skillops` 目录）。

## 截图提交规则（App Store）

建议截图文件放在 `release/screenshots/` 目录，并按以下命名上传：

- `workbench-dashboard-mac-1.png`
- `workbench-scanner-mac-2.png`
- `workbench-mcp-mac-3.png`
- `workbench-update-mac-4.png`
- `workbench-installer-mac-5.png`

尺寸建议：
- Mac：1280x800 或按 App Store Connect 要求的分辨率
- 建议 3.0x 尺寸展示（例如 Retina）

不要在应用简介和版本说明中出现 AI 提示词、内部实验提示或模型推理内容。
