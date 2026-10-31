// Monorepo structure: dependency boundaries, path-aware CI scoping and lint rules.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, expect, test, beforeAll, afterAll } = require('@jest/globals');
const { ESLint } = require('eslint');
const { checkRepo } = require('../scripts/boundaries/check');
const { UNITS } = require('../scripts/boundaries/units');
const { affectedUnits, dependencyGraph, summarize } = require('../scripts/ci/changed-units');

const ROOT = path.resolve(__dirname, '..');

describe('dependency boundaries (scripts/boundaries/check.js)', () => {
  test('the repository respects every boundary', () => {
    expect(checkRepo(ROOT)).toEqual([]);
  });

  describe('detects violations', () => {
    let dir;
    const write = (rel, content) => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), typeof content === 'string' ? content : JSON.stringify(content));
    };

    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boundaries-'));
      for (const unit of UNITS) {
        write(path.join(unit.dir, 'package.json'), { name: unit.pkg });
      }
      // Frontend declaring a backend unit and a server library.
      write('apps/admin-web/package.json', { name: '@equipdemo/admin-web', dependencies: { '@equipdemo/api': '*', knex: '3' } });
      write('apps/admin-web/src/a.ts', "import { buildApp } from '@equipdemo/api';\nimport knex from 'knex';");
      // Relative path into another unit, and a deep import.
      write('apps/workforce-mobile/src/b.ts', "import { x } from '../../api/src/app';\nimport { y } from '@equipdemo/contracts/src/client';");
      // Undeclared (but allowed) dependency, and Node built-in in a frontend.
      write('src/c.ts', "import { createApiClient } from '@equipdemo/contracts';\nimport fs from 'fs';");
      // Shared package depending on another unit and on an npm package.
      write('packages/contracts/package.json', { name: '@equipdemo/contracts', dependencies: { zod: '3' } });
      write('packages/contracts/src/d.ts', "import { url } from '@equipdemo/config';");
      // Worker importing api code.
      write('apps/worker/src/e.ts', "import { createKnexStore } from '@equipdemo/api';");
      // Comments must not count as imports; tests may use Node built-ins.
      write('apps/api/src/f.ts', "// import x from 'react';\nimport { randomUUID } from 'node:crypto';");
      write('apps/admin-web/src/g.test.ts', "import fs from 'node:fs';");
    });

    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    test('reports each kind of violation once, and nothing else', () => {
      const violations = checkRepo(dir).map(v => v.replace(/\\/g, '/'));
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^admin-web: package.json depends on api/),
          expect.stringMatching(/^admin-web: package.json depends on "knex"/),
          expect.stringMatching(/^apps\/admin-web\/src\/a.ts: imports api/),
          expect.stringMatching(/^apps\/admin-web\/src\/a.ts: imports "knex"/),
          expect.stringMatching(/^apps\/workforce-mobile\/src\/b.ts: relative import "..\/..\/api\/src\/app" leaves/),
          expect.stringMatching(/^apps\/workforce-mobile\/src\/b.ts: deep import "@equipdemo\/contracts\/src\/client"/),
          expect.stringMatching(/^src\/c.ts: imports @equipdemo\/contracts but customer-mobile's package.json does not declare it/),
          expect.stringMatching(/^src\/c.ts: imports Node built-in "fs"/),
          expect.stringMatching(/^contracts: shared packages must have no runtime dependencies/),
          expect.stringMatching(/^packages\/contracts\/src\/d.ts: imports config/),
          expect.stringMatching(/^apps\/worker\/src\/e.ts: imports api/),
        ]),
      );
      expect(violations.some(v => v.includes('f.ts') || v.includes('g.test.ts'))).toBe(false);
    });
  });
});

describe('path-aware CI (scripts/ci/changed-units.js)', () => {
  const graph = dependencyGraph(ROOT);
  const affected = files => affectedUnits(files, graph);

  test('the dependency graph matches the architecture', () => {
    expect(graph).toEqual({
      'customer-mobile': ['contracts'],
      'workforce-mobile': ['config', 'contracts'],
      'admin-web': ['config', 'contracts'],
      api: ['config', 'contracts'],
      worker: ['config', 'contracts'],
      contracts: [],
      config: [],
      infra: [],
    });
  });

  test.each([
    [['apps/api/src/app.ts'], ['api']],
    [['apps/worker/src/runner.ts'], ['worker']],
    [['apps/admin-web/src/App.tsx'], ['admin-web']],
    [['src/screens/HomeScreen.tsx'], ['customer-mobile']],
    [['android/app/build.gradle'], ['customer-mobile']],
    [['infra/compose.yaml'], ['infra']],
    [['docs/CI.md', 'apps/api/README.md'], []],
    [['packages/config/src/index.ts'], ['workforce-mobile', 'admin-web', 'api', 'worker', 'config']],
    [['packages/contracts/src/client.ts'], ['customer-mobile', 'workforce-mobile', 'admin-web', 'api', 'worker', 'contracts']],
    [['package-lock.json'], UNITS.map(u => u.name)],
    [['.github/workflows/units.yml'], UNITS.map(u => u.name)],
  ])('%j affects %j', (files, expected) => {
    expect(affected(files)).toEqual(expected);
  });

  test('summary drives the CI jobs', () => {
    expect(summarize(affected(['apps/api/src/app.ts']))).toEqual({
      units: ['api'],
      matrix: { include: [{ unit: 'api', workspace: '@equipdemo/api', dir: 'apps/api' }] },
      customerMobile: false,
      backend: true,
      images: ['api'],
    });
    const infra = summarize(affected(['infra/docker/worker.Dockerfile']));
    expect([infra.backend, infra.images]).toEqual([false, ['api', 'worker']]);
  });
});

describe('lint rules mirror the boundaries', () => {
  const eslint = new ESLint({ cwd: ROOT });
  const restricted = async (code, filePath) => {
    const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, filePath) });
    return result.messages.filter(m => m.ruleId === 'no-restricted-imports').map(m => m.message).join(' ');
  };

  test.each([
    ["import { buildApp } from '@equipdemo/api';", 'apps/admin-web/src/Bad.tsx', /must not import backend internals/],
    ["import knex from 'knex';", 'apps/workforce-mobile/src/bad.ts', /Server-side libraries/],
    // ESLint matches the import text; the boundary checker also resolves paths like '../../api/src'.
    ["import { buildApp } from '../../apps/api/src/app';", 'src/data/bad.ts', /another unit by relative path/],
    ["import { createKnexStore } from '@equipdemo/api';", 'apps/worker/src/bad.ts', /outbox contract/],
    ["import React from 'react';", 'apps/api/src/bad.ts', /must not depend on frontend/],
    ["import { url } from '@equipdemo/config';", 'packages/contracts/src/bad.ts', /Shared packages must not depend/],
    ["import { client } from '@equipdemo/contracts/src/client';", 'apps/admin-web/src/bad.ts', /package entry/],
    ["import { buildApp } from '@equipdemo/api';", 'src/data/bad.ts', /must not import backend internals/],
    ["import { createClient } from '@supabase/supabase-js';", 'src/screens/Bad.tsx', /EquipmentRepository interface/],
  ])('rejects %s in %s', async (code, file, message) => {
    expect(await restricted(code, file)).toMatch(message);
  }, 30000);

  test('allows the shared contract and config where permitted', async () => {
    expect(await restricted("import { createApiClient } from '@equipdemo/contracts';", 'apps/admin-web/src/Ok.tsx')).toBe('');
    expect(await restricted("import { loadConfig } from '@equipdemo/config';", 'apps/api/src/ok.ts')).toBe('');
    expect(await restricted("import type { Equipment } from '@equipdemo/contracts';", 'src/domain/ok.ts')).toBe('');
  }, 30000);
});
