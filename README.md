# equipDemo

A small React Native (TypeScript) app that lists hire equipment from Supabase and lets
users add items. It is a proof of concept for a mobile CI/CD pipeline built on GitHub Actions.

The repository is an **npm workspaces monorepo** of eight independently testable units. The
React Native app stays at the repository root as `customer-mobile`; the others live in `apps/`,
`packages/` and `infra/` ([docs/MONOREPO.md](docs/MONOREPO.md)):

| Unit | Path | What it is |
|---|---|---|
| customer-mobile | `.` | Bare React Native app (Supabase today) |
| workforce-mobile | `apps/workforce-mobile` | Workforce app logic and API access (native shell not created yet) |
| admin-web | `apps/admin-web` | React + Vite admin console |
| api | `apps/api` | Fastify 5 API on PostgreSQL (Knex), transactional outbox |
| worker | `apps/worker` | Delivers outbox events (retries, backoff, dead-letter) |
| contracts | `packages/contracts` | Shared API contract and typed client |
| config | `packages/config` | Validated environment configuration |
| infra | `infra` | Dockerfiles, local compose stack, AWS CloudFormation |

Frontends never import backend internals: they use `@equipdemo/contracts`. Boundaries are enforced by
`npm run check:boundaries`, ESLint and tests.

- **App:** bare React Native 0.86 (no Expo), React Navigation, Supabase
- **Backend:** Supabase table `equipment`, protected by row-level security ([docs/SUPABASE.md](docs/SUPABASE.md))
- **CI:** GitHub Actions: lint, typecheck, tests, Android debug APK ([docs/CI.md](docs/CI.md))
- **Releases:** versioned release candidates with manifests and checksums, promoted without rebuilding ([docs/RELEASES.md](docs/RELEASES.md))
- **Stages:** DEV → SIT → QA → UAT → PRE-PROD → PROD with GitHub Environment approvals ([docs/STAGES.md](docs/STAGES.md))
- **Publishing:** replaceable store adapter; the default mock is SIMULATED and contacts no store ([docs/PUBLISHING.md](docs/PUBLISHING.md))
- **Backend seam:** UI depends only on a repository interface; AWS Amplify adapter contract documented ([docs/AWS_MIGRATION.md](docs/AWS_MIGRATION.md))
- **Monorepo:** units, dependency boundaries, validated config, path-aware CI (`units.yml`) ([docs/MONOREPO.md](docs/MONOREPO.md))
- **Secrets:** GitHub environment secrets; AWS via OIDC, no stored keys ([docs/SECRETS.md](docs/SECRETS.md))
- **Operations:** CI monitoring report, failure drills, rollback runbook ([docs/OPERATIONS.md](docs/OPERATIONS.md), [docs/DRILLS.md](docs/DRILLS.md), [docs/RUNBOOK-ROLLBACK.md](docs/RUNBOOK-ROLLBACK.md))
- **Distribution:** internal only; no app store is used
- **Presentation:** status of every capability and a 10-minute demo script ([docs/PRESENTATION.md](docs/PRESENTATION.md), [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md))

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 22.12 or newer | everything |
| npm | comes with Node | installing dependencies |
| JDK | 17 | Android builds |
| Android Studio + SDK 36 | latest | running on an emulator/device |
| macOS + Xcode + CocoaPods | latest | iOS only |
| Docker (with Compose) | recent | optional: local PostgreSQL, api and worker containers |

On Windows PowerShell, type `npm.cmd` instead of `npm` if scripts are blocked. Keep the
project in a short path outside OneDrive (for example `C:\dev\equipdemo`).

## Set up

```bash
git clone https://github.com/keerthanarameshdasari-hub/equipment-demo-app.git
cd equipment-demo-app
npm ci                      # installs exactly what package-lock.json lists
cp .env.example .env        # Windows: copy .env.example .env
```

Edit `.env` with your Supabase project URL and **publishable** key (never the service-role key).
Without `.env` the app runs on built-in demo data.

## Whole monorepo

| Command | What it does |
|---|---|
| `npm run verify` | Lint, boundary check, typecheck, tests and builds for every unit (run before a PR) |
| `npm run check:boundaries` | Dependency-boundary gate |
| `npm run typecheck:all` / `npm run test:all` | Every unit |
| `npm run build` | Every workspace build + customer-mobile production JS bundle |
| `npm run <script> -w @equipdemo/<unit>` | One unit, e.g. `npm test -w @equipdemo/api` |

**Backend locally** (PostgreSQL 17, migrations, api on `127.0.0.1:3000`, worker):

```bash
cp infra/.env.example infra/.env       # choose a local POSTGRES_PASSWORD
docker compose -f infra/compose.yaml up --build
curl http://127.0.0.1:3000/v1/equipment
npm run dev -w @equipdemo/admin-web    # http://127.0.0.1:5173
```

Integration tests need a disposable database whose name ends in `_test`:
`DATABASE_URL=postgres://...:5432/equipdemo_test npm run test:integration:backend`.

## customer-mobile commands (the same checks CI runs)

| Command | What it does |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no output files |
| `npm test` | Unit and UI tests (no backend needed) |
| `npm test -- --coverage` | Tests with a coverage report in `coverage/` |
| `npm run test:integration` | Live checks against Supabase (needs `.env`) |
| `npm run version:check` | Confirm package.json, Android and iOS versions agree |
| `npm run version:set 1.2.0` | Change the app version everywhere |
| `npm run release:verify -- <folder>` | Verify a downloaded release candidate |
| `npm start` | Metro dev server (`-- --reset-cache` after editing `.env`) |
| `npm run android` | Build and run on an Android emulator/device |
| `cd android && ./gradlew assembleDebug -PbundleJsInDebug` | Standalone debug APK, as built in CI (Windows: `gradlew.bat`) |

## Project layout

```
App.tsx, index.js       customer-mobile: navigation + data-source wiring
src/                    customer-mobile: domain, data (repository + Supabase/mock), screens
__tests__/              customer-mobile tests + monorepo boundary/CI tests
__integration__/        live Supabase tests
android/, ios/          customer-mobile native projects
supabase/               schema.sql (table, constraints, RLS) and seed.sql
apps/api/               Fastify API, migrations, unit + PostgreSQL integration tests
apps/worker/            outbox worker
apps/admin-web/         React + Vite admin console
apps/workforce-mobile/  workforce app logic
packages/contracts/     shared API contract and client
packages/config/        validated env configuration
infra/                  docker/, compose.yaml, aws/ (CloudFormation), policy tests
scripts/                release, publish, ops, boundaries, ci tooling
.github/workflows/      ci.yml (customer-mobile), units.yml (other units), release/promotion
docs/                   project documentation
```

## Versions

| Tag | Contents |
|---|---|
| `v1.0.0` | Original Expo app (pre-migration baseline), also on branch `release/v1` |
| `v1.1.0` | Version 1: bare React Native app with Supabase fetch and submit |
| `v1.1.1-rc.N` → `v1.1.1` | Version 1 release candidates and the approved release, built by the release pipeline ([docs/RELEASES.md](docs/RELEASES.md)) |
| `v1.1.2-rc.N` → `v1.1.2` | Version 1 promoted through all six stages ([docs/STAGES.md](docs/STAGES.md)) |
| `v2.0.0-rc.N` → `v2.0.0` | **Version 2**: search with result count ([docs/VERSION2.md](docs/VERSION2.md)) |
