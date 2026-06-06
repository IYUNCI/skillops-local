# SkillOps Local Deployment

SkillOps has two very different deployment surfaces:

1. Local agent: scans and manages a user's Mac/Windows skill folders.
2. Cloud catalog: lets people discover public skills and copy install commands.

Do not deploy the current local UI as a normal public SaaS and expect it to scan every visitor's machine. A cloud server cannot read a user's `~/.codex/skills` or `~/.claude/skills`. The local scan/management piece must run on the user's computer, or as a container with explicit volume mounts.

## Recommended Launch Path

### Phase 1: npm CLI Distribution

This is the best first launch path because the product is local-first.

Users install:

```bash
npm install -g skillops-local
skillops ui --open
```

Or use without global install:

```bash
npx skillops-local ui --open
```

If publishing under an organization scope:

```bash
npm publish --access public
npx @your-scope/skillops ui --open
```

Before publishing:

```bash
npm run check
npm run build
npm test
npm pack --dry-run
```

Publish:

```bash
npm login
npm publish --access public
```

Notes:

- Choose a package name before launch. `skillops-local` may or may not be available.
- Keep `files` in `package.json` narrow so `node_modules`, local share packs, and private files are not published.
- Add npm provenance / trusted publishing once the GitHub repo is created.

### Phase 2: GitHub Releases

Create a public GitHub repo and release source plus packaged artifacts.

Suggested repo layout:

```text
skillops-local/
├── src/
├── dist/
├── README.md
├── DEPLOYMENT.md
├── Dockerfile
├── package.json
└── package-lock.json
```

Useful release assets:

- npm package tarball from `npm pack`
- source zip
- screenshots
- checksums

### Phase 3: Docker Self-Hosted Mode

Docker is useful for teams, demos, or controlled environments. It is less ergonomic for personal Mac/Windows use because host skill folders must be mounted explicitly.

Build:

```bash
docker build -t skillops-local .
```

Run read-only scan mode:

```bash
docker run --rm -p 18765:18765 \
  -v "$HOME/.codex:/root/.codex:ro" \
  -v "$HOME/.claude:/root/.claude:ro" \
  -v "$PWD:/workspace:ro" \
  skillops-local \
  node dist/cli.js ui --host 0.0.0.0 --port 18765 --root /workspace
```

Run management mode:

```bash
docker run --rm -p 18765:18765 \
  -v "$HOME/.codex:/root/.codex:rw" \
  -v "$HOME/.claude:/root/.claude:rw" \
  -v "$HOME/.skillops:/root/.skillops:rw" \
  -v "$PWD:/workspace:rw" \
  skillops-local \
  node dist/cli.js ui --host 0.0.0.0 --port 18765 --root /workspace
```

Security note: management mode can install and remove local skills. Prefer read-only mode for demos.

### Phase 4: Homebrew for macOS/Linux

After npm works, create a Homebrew tap so users can install with:

```bash
brew tap your-org/skillops
brew install skillops
skillops ui --open
```

This is especially useful for developers who dislike global npm installs.

### Phase 5: Desktop App

For mainstream users, wrap the local server in a Wails + Go desktop shell.

Current implementation:

- Wails v2 + Go shell
- Starts the local SkillOps HTTP service from an embedded backend bundle
- Opens the local UI in a native WebView window
- Reuses the same local-first install/remove permission gates as the CLI UI
- Writes runtime diagnostics to `/tmp/skillops-wails.log`

Run:

```bash
npm run desktop
```

Build a local macOS Apple Silicon app:

```bash
npm run desktop:pack:mac-m4
open "$HOME/.skillops/builds/wails/mac-arm64/SkillOps Local.app"
```

Build a Windows app, best run on Windows or GitHub Actions `windows-latest`:

```bash
npm run desktop:pack:win
```

Release builds use the same Wails pipeline:

```bash
npm run desktop:dist:mac-m4
npm run desktop:dist:win
```

Package strategy:

- Keep npm CLI as the default open-source distribution: `npx skillops-local ui --open` gives users the same local UI without a desktop runtime.
- Use Wails desktop for users who need a one-click native app and no terminal.
- Keep the desktop shell in Go/Wails so the native layer can grow into menus, auto-start, updates, filesystem permissions, and platform signing.
- On macOS, build in a temporary staging directory and install the signed app under `~/.skillops/builds/wails/...` to avoid `Documents` extended-attribute signing failures.

Outputs:

- macOS `.app` from Wails
- Windows `.exe` from Wails

This is the right path when the user is not comfortable with terminals.

### Phase 6: Cloud Catalog

The cloud product should not manage local files directly. It should be a public catalog and documentation site:

- Search public skills.
- Show `SKILL.md` preview.
- Show risk score from server-side linting.
- Provide install command: `npx skillops install <source>`.
- Let maintainers submit skills.
- Host public metadata, not user secrets.

Suggested stack:

- Next.js or Astro
- Vercel / Cloudflare Pages
- SQLite/Postgres for indexed skill metadata
- GitHub API crawler for `SKILL.md`

Cloud catalog plus local agent is the durable architecture:

```text
Public website: discover skills
Local SkillOps: inspect, install, remove, run health checks
Team self-host: private catalog and policies
```

## Security Rules

- Treat third-party skills as untrusted code.
- Always lint before install.
- Never execute scripts during market preview.
- Do not print secrets.
- Move removed skills to trash instead of deleting.
- For cloud catalog, store only public metadata unless a team has explicit private registry auth.

## Practical Launch Checklist

1. Create GitHub repo.
2. Add screenshots and a short demo GIF.
3. Rename package if needed.
4. Run `npm pack --dry-run`.
5. Publish npm package.
6. Add `npx skillops-local ui --open` to README.
7. Create Product Hunt / Hacker News / X launch post.
8. Collect skill sources and improve market indexing.
9. Add Homebrew tap.
10. Build and sign Wails desktop app when CLI usage proves demand.

### Phase 7: Apple App Store (macOS) 上架

目标是让 macOS 客户端通过 App Store Connect 提交审核。仓库已将 macOS Bundle ID 配置为 `cn.iyunci.skillops`，并提供了 App Store 签名入口脚本：

```bash
MACOS_SIGNING_IDENTITY="3rd Party Mac Developer Application: Your Name (TEAMID)" \
MACOS_APP_NAME="SkillOps Local.app" \
npm run desktop:pack:mac:mas
```

如果脚本仍找不到构建产物，可手工指定：

```bash
MACOS_APP_PATH="$HOME/.skillops/builds/wails/mac-arm64/SkillOps Local.app" \
MACOS_SIGNING_IDENTITY="3rd Party Mac Developer Application: Your Name (TEAMID)" \
npm run desktop:pack:mac:mas
```

继续打包成 `.pkg` 便于提交（需安装证书）：

```bash
MACOS_INSTALLER_SIGNING_IDENTITY="3rd Party Mac Developer Installer: Your Name (TEAMID)" \
APP_PATH="$HOME/.skillops/builds/wails/mac-arm64/SkillOps Local.app" \
MACOS_MAS_PKG_PATH="$HOME/.skillops/builds/wails/mac-arm64/SkillOpsLocal.pkg" \
xcrun pkgbuild --identifier cn.iyunci.skillops \
  --version 0.1.1 \
  --component "$APP_PATH" /Applications "$MACOS_MAS_PKG_PATH" \
  --sign "$MACOS_INSTALLER_SIGNING_IDENTITY"
```

提交到 App Store Connect：

```bash
xcrun altool --upload-app \
  -f "$MACOS_MAS_PKG_PATH" \
  -t macos \
  --apiKey YOUR_API_KEY_ID \
  --apiIssuer YOUR_API_ISSUER_ID
```

说明：

- `security find-identity -v -p codesigning` 看到的 `3rd Party Mac Developer Application` / `3rd Party Mac Developer Installer` 才能做提交级签名。
- `wails/build/darwin/entitlements.mas.plist` 已开启 App Store 常用能力：App Sandbox、网络访问、用户选中文件读写、app-scope bookmark。
- `scripts/sign-mas.cjs` 会自动解析签名目标应用，不再依赖固定 `SkillOpsLocal.app` 路径。
