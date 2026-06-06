# SkillOps Local

![SkillOps Local logo](./assets/skilloips.svg)

[![Release](https://img.shields.io/github/v/release/IYUNCI/skillops-local)](https://github.com/IYUNCI/skillops-local/releases)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

## 应用截图（可替换为真实页面截图）

![SkillOps Home（示意图）](./assets/screenshots/page-home.png)
![SkillOps 工作台（示意图）](./assets/screenshots/page-workbench.png)

本地优先的 Skill / MCP / Agent 能力管理工具。

SkillOps Local 准备以 MIT 协议开源。它不是另一个云端目录站，而是一个跑在用户电脑上的 Agent 能力控制台：发现本机 skills、MCP servers、CLI 工具，显示简介和使用方法，并把安装、移除、风险检查留在本地完成。

V0 先解决三件事：

- 扫描本机和项目里的 `SKILL.md`、MCP 配置、commands、hooks。
- 检查 skill 结构、触发描述、危险脚本、密钥和 prompt injection 风险。
- 检查 MCP server 配置、环境变量、启动命令，并尝试 `initialize` + `tools/list`。

## 快速开始

面向普通使用者：

```bash
npx skillops-local ui --open
```

如果已全局安装：

```bash
skillops ui --open
```

本地访问：

```text
http://localhost:18765/
```

桌面客户端：

```bash
npm run desktop
```

生成 Wails/Go 原生 macOS 客户端：

```bash
npm run desktop:pack:mac-m4
open "$HOME/.skillops/builds/wails/mac-arm64/SkillOps Local.app"
```

更快的开发打包：

```bash
npm run desktop:pack:mac-m4
npm run desktop:pack:win
```

发布包同样走 Wails/Go：

```bash
npm run desktop:dist:mac-m4
npm run desktop:dist:win
```

更新桌面图标：

```bash
npm run icons:generate -- /path/to/icon.svg
```

该命令会生成 Wails 使用的 `wails/build/appicon.png`（1024x1024）、macOS `.icns`，以及 Windows 多尺寸 `.ico`（16/24/32/48/64/128/256）。

说明：macOS 可能会给 `Documents` 下的 `.app` 自动加扩展属性，导致 Wails 自签名失败。打包脚本会在临时目录完成签名，并把可运行 app 放到 `~/.skillops/builds/wails/mac-arm64/SkillOps Local.app`；`wails/build/bin/SkillOps Local.app` 是指向它的本地链接。

说明：桌面客户端现在采用 Wails + Go。Go shell 负责启动本地 SkillOps 服务，Wails WebView 展示同一套本地 UI；不再维护其他桌面框架路线。

部署和发布方案见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

商业化和定价方案见 [BUSINESS_MODEL.md](./BUSINESS_MODEL.md)。

面向开发者：

```bash
npm install
npm run build
node dist/cli.js scan
```

开发模式：

```bash
npm run dev -- scan
npm run dev -- lint ~/.codex/skills/some-skill
npm run dev -- doctor mcp github
npm run dev -- share ~/.codex/skills/some-skill --include-source
npm run dev -- ui --open
```

## 命令

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

## 当前状态

这是 MVP 项目骨架，不是最终产品。已经实现：

- Codex / Claude / project skill 扫描。
- 常见 MCP JSON/TOML 配置解析。
- `SKILL.md` frontmatter 检查。
- 高风险文本、脚本、secret 模式检测。
- MCP stdio 基础连通性测试。
- 生成本地 share pack：manifest、README、INSTALL、SECURITY_REPORT、examples。
- 本地 Web UI：`skillops ui --open`，默认监听 `http://127.0.0.1:18765`。
- Skill 市场：搜索内置市场条目、查看简介和使用方法、安装到 Codex / Claude / 当前项目。
- Skill 管理：从 UI 中移除已安装 skill，默认移动到 `~/.skillops/trash`，不直接永久删除。
- GitHub 安装：支持从 `owner/repo` 或 `https://github.com/owner/repo/tree/main/path/to/skill` 安装单个 `SKILL.md` 包。
- Skill 更新检测与升级：SkillOps 安装的 skill 会记录 `.skillops-install.json`，可通过 `updates check` 对比远程 git hash，并用 `updates upgrade --yes` 替换到最新版本。
- 安装前预览：`preview skill` 会完整读取并渲染本地或 GitHub `SKILL.md`，同时输出 lint 风险。
- MCP 实时工具浏览器：`mcp tools` 会启动 stdio MCP server 并展示 `tools/list`、风险和健康状态。
- 风险评分增强：`lint` / `risk audit` 会额外检查 npm 生命周期脚本、npm/pip 远程或未固定依赖、二进制文件和 WASM。
- Profile 导入导出：`profile export/import` 可保存本机 inventory、MCP 配置元数据和最近操作历史，为多机同步做准备。
- 操作历史日志：安装、移除、恢复、升级、profile、feedback、db snapshot 等会写入 `~/.skillops/history.jsonl`。
- SQLite 本地库：`db snapshot` 会把 inventory 和 feedback 写入 `~/.skillops/skillops.db`，不支持 `node:sqlite` 的环境会降级为 JSON snapshot。
- Skill 评分与反馈：`feedback add` 本地记录评分与评论，并进入 SQLite snapshot。
- 多 Agent 兼容性矩阵：`compat matrix` 输出 Codex / Claude / Cursor 的 native、compatible、manual 状态。
- Skill 创建向导：`create skill` 生成带 frontmatter、workflow 和 examples 目录的 `SKILL.md` 骨架。
- MCP Server 一键安装：`mcp install` 可写入项目级 `.mcp.json`，也支持 Cursor / Claude JSON 配置目标。
- Eval Runner 沙箱测试：`eval skill` 对 skill 做静态沙箱检查，验证 entrypoint、lint health、风险阈值和文件完整性。
- 实时文件监控：`watch` 监听本机 skill 目录和 MCP 配置变化。
- AI 辅助 Skill 审查：`review skill` 用本地启发式根据 lint、风险和权限生成 approve/review/block 结论。
- 本地依赖图谱可视化：`graph dependencies` 输出 Mermaid 与 JSON 图谱，连接 skills、MCP、runtime 和依赖。
- 桌面客户端：Wails/Go 壳会启动本地 SkillOps 服务，并在原生 WebView 中展示本地 UI。
- 首次启动引导：解释本地扫描、市场预览、安装、移除权限；安装/移除默认关闭。
- 终端摘要和 JSON 输出。
- mac M 系列和 Windows Wails/Go 打包脚本。
- GitHub Actions 工作流：手动触发或打 tag 后构建 mac arm64 和 Windows x64 客户端。

下一步：

- 把增强能力拆成更细的 UI 工作台页面。
- 加强 Wails 原生能力：菜单栏、更新、签名和安装器。

## 开源协作

- License: MIT，见 [LICENSE](./LICENSE)。
- 贡献流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。
- 推荐先发布 npm CLI，再发布桌面包；桌面包可通过 GitHub Actions 生成。
- 提交新 skill 来源时，请优先提供公开 GitHub URL、简介、使用方法和风险说明。

## 开源发布文案（中文 / English）

- 已整理可直接发的文案： [PROMOTION.md](/Users/jiang/Documents/Codex/2026-06-04/skill-skill-skill-skill-mcp/skillops-local/PROMOTION.md)
- 发布前检查清单： [OPEN_SOURCE_CHECKLIST.md](/Users/jiang/Documents/Codex/2026-06-04/skill-skill-skill-skill-mcp/skillops-local/OPEN_SOURCE_CHECKLIST.md)

仓库默认文案链接示例：
- `https://github.com/IYUNCI/skillops-local`

如使用其他仓库名，请把 README 与文案中的链接替换为你的正式地址。
