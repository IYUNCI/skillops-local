import { build } from 'esbuild';

await build({
  entryPoints: [
    'src/cli.ts',
    'src/ui.ts',
    'src/cli-market.ts',
    'src/detect.ts',
    'src/enhancements.ts',
    'src/history.ts',
    'src/install-record.ts',
    'src/installed.ts',
    'src/manage.ts',
    'src/market.ts',
    'src/mcp-config.ts',
    'src/mcp-doctor.ts',
    'src/report.ts',
    'src/risk.ts',
    'src/scan.ts',
    'src/share.ts',
    'src/skill-lint.ts',
    'src/types.ts',
    'src/utils.ts'
  ],
  outdir: 'dist',
  bundle: false,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
});
