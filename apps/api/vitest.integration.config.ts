import { defineConfig } from 'vitest/config';

// Needs DATABASE_URL pointing at a disposable *_test database (see test/helpers.ts).
export default defineConfig({
  test: { include: ['test/integration.test.ts'], environment: 'node', testTimeout: 30000, fileParallelism: false },
});
