// Bundles the API into dist/ for deployment. Workspace packages (@equipdemo/*) are
// inlined; npm dependencies stay external and are installed with `npm ci --omit=dev`.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/server.ts', 'src/migrate.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: Object.keys(pkg.dependencies),
  logLevel: 'info',
});
