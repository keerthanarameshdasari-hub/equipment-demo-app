equipDemo is an **npm workspaces monorepo**. The repository root is the `customer-mobile` unit, a
**bare React Native** app (React Native CLI, no Expo) with TypeScript and a Supabase backend. Other
units: `apps/api` (Fastify + PostgreSQL), `apps/worker`, `apps/admin-web`, `apps/workforce-mobile`,
`packages/contracts`, `packages/config`, `infra`. See `docs/MONOREPO.md`.

## Monorepo rules

- Unit list and allowed dependencies: `scripts/boundaries/units.js`. Run `npm run check:boundaries`.
- Frontends (customer-mobile, workforce-mobile, admin-web) must not import backend internals
  (`@equipdemo/api`, `@equipdemo/worker`, `apps/api/**`, `apps/worker/**`) or server libraries
  (`fastify`, `knex`, `pg`). They use `@equipdemo/contracts`.
- api and worker never import each other; they communicate through the outbox contract.
- `packages/*` have no runtime dependencies and import no other unit.
- Import other units by package name only; no deep imports, no `../../` across unit folders.
- Every workspace defines `lint`, `typecheck`, `test` and `build`. Validate env vars with
  `@equipdemo/config` (mark secrets `secret: true`; frontends use `loadPublicConfig`).
- Do not move the React Native app out of the root without a dedicated, CI-verified change.
- Before declaring a task done: `npm run verify` (and `npm run test:integration:backend` when api or worker changed).

## Project rules

- `android/` and `ios/` are committed source code. Edit them directly; nothing regenerates them.
- Do not add Expo packages (`expo`, `expo-*`, `jest-expo`) or EAS configuration.
- Navigation uses React Navigation (native-stack).
- Package manager: **npm**. Commit `package-lock.json` with every dependency change.
- Keep React Native-related package versions aligned with `react-native` (currently 0.86.3).

## Commands

```bash
npm install            # install dependencies
npm start              # Metro dev server (add -- --reset-cache after changing .env)
npm run android        # build and run on an Android device/emulator
npm run ios            # build and run on iOS (macOS only; run `cd ios && pod install` first)
npm test               # Jest
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint
cd android && ./gradlew assembleRelease   # release APK (signed with the debug key; demo only)
npm run version:set X.Y.Z  # change the app version (package.json, lockfile, iOS) - never edit by hand
npm run verify         # every unit: lint, boundaries, typecheck, tests, builds
npm run test -w @equipdemo/api   # one workspace unit
```

## Versions and releases

- App version lives in `package.json`; build numbers are assigned by CI. See `docs/RELEASES.md`.
- Release binaries are built only by `.github/workflows/release.yml` from an RC tag, and promoted by
  `promote.yml` without rebuilding.
- Store publishing goes only through the adapter interface in `scripts/publish` (`publish.yml`).
  The mock must never claim a real upload or release; real adapters must refuse unless enabled.

Run tests and typecheck before declaring any task done.

## Configuration and secrets

- Runtime config is read from `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (see `.env.example`).
- `babel.config.js` inlines ONLY allow-listed variables into the bundle. Never add server-side
  secrets (service-role keys, AWS credentials) to that list or to the app.
- `.env` files, keystores and signing certificates are git-ignored and must stay out of the repo.
  Each unit documents its variables in its own `.env.example` (placeholders only).

## Data layer

- UI code (screens, ui, navigation, domain, App.tsx) must not import backend SDKs or backend-specific
  modules; ESLint enforces this. New backends implement `EquipmentRepository` and must pass
  `__tests__/repositoryContract.test.ts`. See `docs/AWS_MIGRATION.md`.
- AWS access from CI uses GitHub OIDC only; never add long-lived AWS keys. See `docs/SECRETS.md`.
