# SkillOps Local

![SkillOps Local logo](./assets/skilloips.svg)

[![Release](https://img.shields.io/github/v/release/IYUNCI/skillops-local)](https://github.com/IYUNCI/skillops-local/releases)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

## Project Intro / 项目介绍

中文：SkillOps Local 是一个本地优先的 AI Agent 能力工作台，用来集中管理本机、项目目录和常用 Agent 工具中的 Skills、MCP 服务与 CLI 工具。它帮助开发者快速看清每个能力来自哪里、是否健康、是否存在权限或安全风险，并提供安装、移除、审查、预览和本地运行入口。

English: SkillOps Local is a local-first workbench for AI agent capabilities. It brings local Skills, MCP servers, and CLI tools into one desktop and CLI experience, so developers can scan capability sources, review health and risk signals, manage installed skills, and run agent workflows with clearer local control.

## Screenshots / 界面截图

![SkillOps capability inventory](./assets/screenshots/page-capabilities.png)

![SkillOps installed skills](./assets/screenshots/page-installed.png)

![SkillOps CLI tools](./assets/screenshots/page-cli-tools.png)

## Core Features / 核心功能

- 中文：扫描本机和项目级 Skills、MCP 服务、CLI 工具，生成统一的能力清单。
- English: Scan local and project-level Skills, MCP servers, and CLI tools into one capability inventory.
- 中文：检查 `SKILL.md` 元信息、运行环境、权限声明和常见风险模式。
- English: Review `SKILL.md` metadata, runtime requirements, permissions, and common risk patterns.
- 中文：管理已安装 Skills，支持本地移除、回收站恢复和永久删除流程。
- English: Manage installed Skills with local remove, trash recovery, and permanent delete flows.
- 中文：支持从内置市场或 GitHub 来源安装 Skills。
- English: Install Skills from the bundled market or GitHub sources.
- 中文：提供本地 Web UI，用于能力总览、风险审查、MCP 检查、CLI 工具管理、历史记录和回收站。
- English: Open a local Web UI for inventory, risk review, MCP inspection, CLI tool management, history, and recycle bin workflows.
- 中文：默认本地优先，CLI 与桌面客户端基于本地文件和本地配置运行。
- English: Keep data local by default; the CLI and desktop client work against local files and local configuration.

## Release Channels / 发布渠道

- 中文：`npm` CLI 包，适合终端优先的开发者工作流。
- English: `npm` CLI package for terminal-first developer workflows.
- 中文：macOS M 系列桌面客户端，基于 Wails 与 Go 构建。
- English: macOS M-series desktop client built with Wails and Go.
- 中文：Windows 桌面客户端，基于 Wails 与 Go 构建。
- English: Windows desktop client built with Wails and Go.
- 中文：GitHub Releases 提供版本化桌面安装包和校验信息。
- English: GitHub Releases provide versioned desktop packages and checksum-friendly artifacts.

## Quick Start

Run the local UI with npm:

```bash
npx skillops-local ui --open
```

If installed globally:

```bash
skillops ui --open
```

Default local address:

```text
http://localhost:18765/
```

## Desktop Client

Start the desktop app in development mode:

```bash
npm run desktop
```

Build macOS M-series and Windows clients:

```bash
npm run desktop:pack:all
```

Build one platform at a time:

```bash
npm run desktop:pack:mac-m4
npm run desktop:pack:win
```

Open the local macOS build:

```bash
open "$HOME/.skillops/builds/wails/mac-arm64/SkillOps Local.app"
```

## Development

Install dependencies and build the CLI:

```bash
npm install
npm run build
node dist/cli.js scan
```

Common development commands:

```bash
npm run dev -- scan
npm run dev -- lint ~/.codex/skills/some-skill
npm run dev -- doctor mcp github
npm run dev -- share ~/.codex/skills/some-skill --include-source
npm run dev -- ui --open
```

## CLI Commands

```bash
skillops scan [--json] [--root <path>]
skillops lint <skill-dir> [--json]
skillops doctor mcp <name-or-config-path> [--json]
skillops share <skill-dir> [--out <path>] [--include-source] [--json]
skillops updates check [--json]
skillops updates upgrade <skill-dir> --yes
skillops preview skill <local-or-github-source> [--json]
skillops mcp tools [name-or-config-path] [--json]
skillops mcp install <name> --command <cmd> [--arg <arg>] --yes
skillops risk audit <skill-dir> [--json]
skillops profile export [--out <path>] [--json]
skillops profile import <profile-path> [--json]
skillops history list [--json]
skillops db snapshot [--json]
skillops feedback add <target-id> --rating <1-5> [--comment <text>]
skillops compat matrix [--json]
skillops create skill <name> [--root <skills-root>]
skillops eval skill <skill-dir> [--json]
skillops review skill <skill-dir> [--json]
skillops graph dependencies [--json]
skillops watch
skillops ui [--port <port>] [--host <host>] [--root <path>] [--open]
```

## Open Source

SkillOps Local is released under the MIT License. See [LICENSE](./LICENSE).

Contributions are welcome through issues and pull requests. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contributor guide.

## Version

- Version: `0.1.6`
- Author: `yunpai`
- Copyright: `Copyright © 2026 yunpai / 云磁数字`
