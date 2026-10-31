// Single source of truth for the deployable/testable units and their allowed dependencies.
// Used by: scripts/boundaries/check.js (CI gate), .eslintrc.js (editor feedback) and
// scripts/ci/changed-units.js (path-aware CI). Documented in docs/MONOREPO.md.

/** kind decides what a unit may depend on. */
const UNITS = [
  { name: 'customer-mobile', dir: '.', pkg: 'equipdemo', kind: 'frontend', sources: ['src', 'App.tsx', 'index.js', '__tests__', '__integration__'] },
  { name: 'workforce-mobile', dir: 'apps/workforce-mobile', pkg: '@equipdemo/workforce-mobile', kind: 'frontend' },
  { name: 'admin-web', dir: 'apps/admin-web', pkg: '@equipdemo/admin-web', kind: 'frontend' },
  { name: 'api', dir: 'apps/api', pkg: '@equipdemo/api', kind: 'backend' },
  { name: 'worker', dir: 'apps/worker', pkg: '@equipdemo/worker', kind: 'backend' },
  { name: 'contracts', dir: 'packages/contracts', pkg: '@equipdemo/contracts', kind: 'shared' },
  { name: 'config', dir: 'packages/config', pkg: '@equipdemo/config', kind: 'shared' },
  { name: 'infra', dir: 'infra', pkg: '@equipdemo/infra', kind: 'infra' },
];

/** Which units each kind may import. Everything else is forbidden. */
const ALLOWED_UNIT_DEPS = {
  frontend: ['contracts', 'config'],
  backend: ['contracts', 'config'],
  shared: [],
  infra: [],
};

/** npm packages a kind must never depend on or import (keeps server code out of apps and vice versa). */
const BANNED_PACKAGES = {
  frontend: ['fastify', /^@fastify\//, 'knex', 'pg', /^pg-/, /^@aws-sdk\//],
  backend: ['react', 'react-dom', 'react-native', /^react-native-/, /^@react-navigation\//, /^@react-native\//],
  shared: [/^(?!\.).*/], // shared packages are dependency-free: only relative and type-only imports
  infra: [],
};

/** Node built-ins are allowed in backend/infra code only (shared packages must run in apps too). */
const NODE_BUILTINS_ALLOWED = { frontend: false, backend: true, shared: false, infra: true };

/** Paths whose change affects every unit (dependency graph, shared tooling, CI). */
const GLOBAL_PATHS = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^tsconfig\.base\.json$/,
  /^\.eslintrc\.js$/,
  /^\.eslintignore$/,
  /^\.prettierrc\.js$/,
  /^\.github\//,
  /^scripts\/boundaries\//,
  /^scripts\/ci\//,
];

/** Documentation-only changes run nothing. */
const DOC_PATHS = [/^docs\//, /\.md$/i];

module.exports = { UNITS, ALLOWED_UNIT_DEPS, BANNED_PACKAGES, NODE_BUILTINS_ALLOWED, GLOBAL_PATHS, DOC_PATHS };
