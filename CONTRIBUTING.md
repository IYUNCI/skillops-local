# Contributing to SkillOps Local

Thanks for helping improve SkillOps Local.

## Local Setup

```bash
npm install
npm run check
npm run build
npm test
```

Run the local UI:

```bash
npm run dev -- ui --open
```

Run the desktop shell:

```bash
npm run desktop
```

## Desktop Packaging

Fast local smoke packages:

```bash
npm run desktop:pack:mac-m4
npm run desktop:pack:win
```

Release packages:

```bash
npm run desktop:dist:mac-m4
npm run desktop:dist:win
```

Desktop apps are built with Wails + Go. Prefer the npm CLI path for developer distribution and use Wails packages for users who need a one-click app.

## Pull Request Rules

- Keep local-first behavior intact.
- Do not execute third-party skill scripts during preview or marketplace search.
- Keep install and remove actions permission-gated.
- Add tests or manual verification notes for scanner, installer, remover, and desktop changes.
- Keep generated artifacts out of commits unless they are small source assets needed by the app.

## Adding Skill Sources

When proposing a new public skill source, include:

- Public GitHub URL
- Short description
- Usage examples
- Install command
- Known risks or required permissions
