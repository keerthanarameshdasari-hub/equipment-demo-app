import { defineConfig } from 'vitest/config';

// No framework plugin needed: Vite compiles TSX with the automatic JSX runtime.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: { outDir: 'dist', sourcemap: true },
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'node' },
});
