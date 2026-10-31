// One ESLint config for the whole monorepo (`npm run lint` lints every unit; each
// workspace's own `npm run lint` resolves up to this file).
//
// Dependency boundaries are enforced twice: here (fast editor feedback) and by
// scripts/boundaries/check.js (CI gate, also checks package.json). Both read the
// unit definitions in scripts/boundaries/units.js. See docs/MONOREPO.md.

// customer-mobile: backend SDKs and backend-specific modules its UI must never import directly.
// The UI talks only to the EquipmentRepository interface (src/data/EquipmentRepository.ts),
// so the backend (Supabase today, the api or AWS Amplify later) can change without UI changes.
const MOBILE_UI_BACKEND_IMPORTS = [
  {
    group: ['@supabase/*', 'aws-amplify', 'aws-amplify/*', '@aws-amplify/*', '@aws-sdk/*'],
    message: 'UI code must not use a backend SDK. Use the EquipmentRepository interface (useEquipmentRepository).',
  },
  {
    group: ['**/data/supabase*', '**/data/amplify*', '**/config/env'],
    message: 'UI code must not depend on a specific backend. Use the EquipmentRepository interface.',
  },
];

// Every frontend (customer-mobile, workforce-mobile, admin-web): no backend internals or server libraries.
const FRONTEND_NO_BACKEND = [
  {
    group: ['@equipdemo/api', '@equipdemo/api/*', '@equipdemo/worker', '@equipdemo/worker/*', '**/apps/api/**', '**/apps/worker/**'],
    message: 'Frontends must not import backend internals. Use the shared contract (@equipdemo/contracts).',
  },
  {
    group: ['fastify', '@fastify/*', 'knex', 'pg', 'pg-*'],
    message: 'Server-side libraries do not belong in a frontend.',
  },
];

// Every unit: other units only through their public package entry, never by path or deep import.
const NO_CROSS_UNIT_PATHS = [
  {
    group: ['@equipdemo/*/*'],
    message: 'Import the package entry (e.g. @equipdemo/contracts), not its internals.',
  },
  {
    group: ['**/packages/*/**', '**/apps/*/**', '**/infra/**'],
    message: 'Do not reach into another unit by relative path; import its package by name.',
  },
];

const BACKEND_NO_FRONTEND = [
  {
    group: ['@equipdemo/admin-web', '@equipdemo/workforce-mobile', 'react', 'react-dom', 'react-native', 'react-native-*', '@react-navigation/*'],
    message: 'Backend units must not depend on frontend code or UI libraries.',
  },
];

const SHARED_ONLY_SELF = [
  {
    group: ['@equipdemo/*'],
    message: 'Shared packages must not depend on other units.',
  },
];

const restrict = (...groups) => ({ 'no-restricted-imports': ['error', { patterns: groups.flat() }] });

module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Node.js release tooling (CommonJS, prints to the console by design).
      files: ['scripts/**/*.js'],
      env: { node: true },
    },
    {
      // customer-mobile: whole app.
      files: ['src/**', 'App.tsx', 'index.js'],
      rules: restrict(FRONTEND_NO_BACKEND, NO_CROSS_UNIT_PATHS),
    },
    {
      // customer-mobile UI layer: also no backend SDKs (data adapters live in src/data).
      files: ['src/screens/**', 'src/ui/**', 'src/navigation/**', 'src/domain/**', 'App.tsx'],
      rules: restrict(MOBILE_UI_BACKEND_IMPORTS, FRONTEND_NO_BACKEND, NO_CROSS_UNIT_PATHS),
    },
    {
      // Workspaces are ES modules.
      files: ['apps/**', 'packages/**', 'infra/**'],
      parserOptions: { sourceType: 'module' },
    },
    {
      files: ['apps/admin-web/**', 'apps/workforce-mobile/**'],
      rules: restrict(FRONTEND_NO_BACKEND, NO_CROSS_UNIT_PATHS),
    },
    {
      files: ['apps/api/**'],
      rules: restrict(BACKEND_NO_FRONTEND, NO_CROSS_UNIT_PATHS, [
        { group: ['@equipdemo/worker', '@equipdemo/worker/*'], message: 'api and worker communicate through the outbox contract, not code.' },
      ]),
    },
    {
      files: ['apps/worker/**'],
      rules: restrict(BACKEND_NO_FRONTEND, NO_CROSS_UNIT_PATHS, [
        { group: ['@equipdemo/api', '@equipdemo/api/*'], message: 'api and worker communicate through the outbox contract, not code.' },
      ]),
    },
    {
      files: ['packages/**'],
      rules: restrict(SHARED_ONLY_SELF, NO_CROSS_UNIT_PATHS),
    },
  ],
};
