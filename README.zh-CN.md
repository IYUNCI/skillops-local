# SkillOps Local

**语言 / Language:** 简体中文 | [English](./README.en.md)

![SkillOps Local logo](./assets/skilloips.svg)

[![Release](https://img.shields.io/github/v/release/IYUNCI/skillops-local)](https://github.com/IYUNCI/skillops-local/releases)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

SkillOps Local 是一个本地优先的 AI Agent 能力工作台，用来集中管理本机、项目目录和常用 Agent 工具中的 Skills、MCP 服务与 CLI 工具。它帮助开发者快速看清每个能力来自哪里、是否健康、是否存在权限或安全风险，并提供安装、移除、审查、预览和本地运行入口。

## 界面截图

![SkillOps 能力总览](./assets/screenshots/page-capabilities.png)

![SkillOps 已安装清单](./assets/screenshots/page-installed.png)

![SkillOps CLI 工具](./assets/screenshots/page-cli-tools.png)

## 核心功能

- 扫描本机和项目级 Skills、MCP 服务、CLI 工具，生成统一的能力清单。
- 检查 `SKILL.md` 元信息、运行环境、权限声明和常见风险模式。
- 管理已安装 Skills，支持本地移除、回收站恢复和永久删除流程。
- 支持从内置市场或 GitHub 来源安装 Skills。
- 提供本地 Web UI，用于能力总览、风险审查、MCP 检查、CLI 工具管理、历史记录和回收站。
- 默认本地优先，CLI 与桌面客户端基于本地文件和本地配置运行。

## 发布渠道

- `npm` CLI 包，适合终端优先的开发者工作流。
- macOS M 系列桌面客户端，基于 Wails 与 Go 构建。
- Windows 桌面客户端，基于 Wails 与 Go 构建。
- GitHub Releases 提供版本化桌面安装包和校验信息。

## 快速开始

使用 npm 启动本地界面：

```bash
npx skillops-local ui --open
```

如果已经全局安装：

```bash
skillops ui --open
```

默认本地地址：

```text
http://localhost:18765/
```

## 桌面客户端

以开发模式启动桌面应用：

```bash
npm run desktop
```

构建 macOS M 系列与 Windows 客户端：

```bash
npm run desktop:pack:all
```

单独构建某个平台：

```bash
npm run desktop:pack:mac-m4
npm run desktop:pack:win
```

打开本地 macOS 构建：

```bash
open "$HOME/.skillops/builds/wails/mac-arm64/SkillOps Local.app"
```

## 开发

安装依赖并构建 CLI：

```bash
npm install
npm run build
node dist/cli.js scan
```

常用开发命令：

```bash
npm run dev -- scan
npm run dev -- lint ~/.codex/skills/some-skill
npm run dev -- doctor mcp github
npm run dev -- share ~/.codex/skills/some-skill --include-source
npm run dev -- ui --open
```

## CLI 命令

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

## 开源协议

SkillOps Local 基于 MIT 协议开源，详见 [LICENSE](./LICENSE)。

欢迎通过 issue 和 pull request 参与贡献，贡献说明见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 版本信息

- 版本：`0.1.6`
- 作者：`yunpai`
- 版权：`Copyright © 2026 yunpai / 云磁数字`
