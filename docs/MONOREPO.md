# Monorepo: units, boundaries and commands

The repository holds eight independently testable units in one npm workspace. The existing React
Native app was **not moved**: the repository root *is* the `customer-mobile` unit, so its Android/iOS
projects, Gradle and Metro paths, release pipeline and Version 1 compatibility job are untouched.

```
.                         customer-mobile   bare React Native app (package "equipdemo")      frontend
apps/workforce-mobile     workforce-mobile  workforce app: domain logic + API access          frontend
apps/admin-web            admin-web         React + Vite admin console                        frontend
apps/api                  api               Fastify 5 HTTP API, PostgreSQL via Knex           backend
apps/worker               worker            outbox worker (at-least-once delivery)            backend
packages/contracts        contracts         shared HTTP contract + typed fetch client         shared
packages/config           config            validated environment configuration               shared
infra                     infra             Dockerfiles, compose stack, AWS CloudFormation    infra
```

## Why the root app was not moved (yet)

Moving the React Native app into `apps/customer-mobile` changes Gradle `settings.gradle` plugin paths,
Metro's watch folders, the Podfile, `release.yml`, `promote.yml`, the CodeBuild template and the V1
compatibility job, and the Android build can only be verified in CI. That is a rewrite with real
risk and no benefit for this step. Keeping it at the root was verified to be a no-op for the app:

| Check (31 Oct 2026) | Result |
|---|---|
| Lockfile: the 936 pre-existing package entries | 0 changed, 0 removed |
| `react-native config` (native autolinking input to Gradle/CocoaPods) | identical before/after |
| Production Android JS bundle (`npm run bundle:customer-mobile`) | **byte-identical** (same SHA-256) |
| customer-mobile Jest suite | 119/119 tests still pass (plus 25 new monorepo tests) |

Move it in a dedicated PR later if a second native app needs a shared native toolchain.

## Dependency boundaries

| Unit kind | May depend on | Must not use |
|---|---|---|
| frontend (customer-mobile, workforce-mobile, admin-web) | contracts, config | api, worker, `fastify`, `@fastify/*`, `knex`, `pg`, `@aws-sdk/*`; Node built-ins (outside tests) |
| backend (api, worker) | contracts, config | frontends, `react`, `react-dom`, `react-native*`, `@react-navigation/*`; **each other** |
| shared (contracts, config) | nothing | any other unit, any runtime npm dependency, Node built-ins |
| infra | nothing | other units' code |

Also, for every unit: other units are imported by **package name and public entry only**
(`@equipdemo/contracts`, never `@equipdemo/contracts/src/...` or `../../packages/...`).

- **api ↔ worker** communicate only through the outbox contract (`packages/contracts/src/events.ts`):
  the api writes `outbox_events` rows in the same transaction as the business write; the worker claims
  and delivers them. The api owns the schema (its migrations); the worker depends on the column contract.
- **customer-mobile** imports `Equipment` / `NewEquipment` from the contract **as types only**, so
  nothing new enters its bundle. It still talks to Supabase through `EquipmentRepository`; an api
  adapter can be added behind that interface (it must pass `__tests__/repositoryContract.test.ts`).

**Enforcement**

| Where | What | Notes |
|---|---|---|
| `scripts/boundaries/units.js` | The unit list and rules (single source of truth) | Edit here when adding a unit |
| `npm run check:boundaries` (`scripts/boundaries/check.js`) | `package.json` dependencies and every import, resolving relative paths | CI gate in `units.yml`; no dependencies, runs before `npm ci` |
| `.eslintrc.js` | Same rules as `no-restricted-imports`, for editor feedback | Matches import text, so it cannot see through `../../x` paths: the checker can |
| TypeScript `exports` | Packages expose only `.` | Deep imports also fail type resolution |
| `__tests__/monorepo.test.js` | Proves the checker, ESLint rules and CI scoping catch violations | |

## Configuration and secrets

`@equipdemo/config` validates every variable at start-up and reports **all** problems in one error that
names variables but never echoes values. `secret: true` fields are redacted in `describeConfig()`
(used in start-up logs), and `loadPublicConfig()` refuses any spec containing a secret, which is how the
frontends (whose bundles are public) read configuration.

| Unit | Variables | Template |
|---|---|---|
| api | `DATABASE_URL` (secret), `HOST` (127.0.0.1), `PORT` (3000), `RATE_LIMIT_MAX`, `CORS_ORIGINS`, `LOG_LEVEL`, `NODE_ENV` | `apps/api/.env.example` |
| worker | `DATABASE_URL` (secret), `POLL_INTERVAL_MS`, `BATCH_SIZE`, `LEASE_MS`, `MAX_ATTEMPTS` | `apps/worker/.env.example` |
| admin-web | `VITE_API_BASE_URL` (public) | `apps/admin-web/.env.example` |
| workforce-mobile | `WORKFORCE_API_BASE_URL` (public) | — |
| customer-mobile | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (public, Babel allow-list) | `.env.example` |
| infra (compose) | `POSTGRES_PASSWORD` (local only; compose refuses to start without it) | `infra/.env.example` |

No real values are committed: `.env*` is git-ignored (except `*.env.example`), the CI secret-file guard
fails on tracked env/key files, `.dockerignore` keeps env files out of image builds, images take secrets
only at runtime, and CI integration tests use a passwordless, job-scoped Postgres service.

## Commands

Root (all units):

| Command | What it does |
|---|---|
| `npm ci` | Installs every unit from the one lockfile |
| `npm run lint` | ESLint over the whole repo |
| `npm run check:boundaries` | Dependency-boundary gate |
| `npm run typecheck:all` | customer-mobile `tsc` + every workspace |
| `npm run test:all` | customer-mobile Jest + every workspace's Vitest suite |
| `npm run build` | Every workspace build + customer-mobile production JS bundle (Android/iOS binaries: Gradle/Xcode as before) |
| `npm run verify` | All of the above, in order (what to run before a PR) |
| `npm run test:integration:backend` | Migrate + api and worker tests against PostgreSQL (needs `DATABASE_URL` to a `*_test` database) |
| `npm run units:changed -- --files <paths>` | Which units a change would trigger in CI |

`npm test`, `npm run typecheck` and `npm run lint` keep their old meaning for customer-mobile, so the
existing CI, release, promotion and CodeBuild pipelines are unchanged.

Per unit: `npm run <lint|typecheck|test|build> --workspace=@equipdemo/<unit>` (or `-w`). Units also
have `dev`/`start` (api, worker, admin-web) and `test:integration` (api, worker).

## CI

| Workflow | Runs | Path-aware |
|---|---|---|
| `ci.yml` (customer-mobile) | secret guard, actionlint, version check, lint (whole repo), typecheck, Jest; V1 compatibility; Android APK | `checks` always runs. `v1-compat` and `android` are skipped on PRs that don't affect customer-mobile. Pushes, manual runs and `release.yml` always run everything |
| `units.yml` (workspaces) | boundary gate; per affected unit lint/typecheck/test/build; api+worker integration on Postgres 17; api/worker image builds; one `Units result` status | PRs run only affected units; push/manual run all |

A unit is affected when its files change, when a unit it depends on changes (from the `package.json`
graph, so a contract change re-tests every consumer), or when a global file changes (lockfile, root
`package.json`, `tsconfig.base.json`, ESLint config, `.github/`, `scripts/boundaries`, `scripts/ci`).
Documentation-only changes run nothing. Skipped jobs count as passed, so required checks never hang.

**Branch protection (owner action):** add `Units result` as a required check next to the existing CI checks.

## Deployability

| Unit | Artifact | Verified here |
|---|---|---|
| customer-mobile | APK via `release.yml` → `promote.yml` (unchanged) | JS bundle identical; Gradle not runnable in this workspace |
| api | `infra/docker/api.Dockerfile` → image; migrations: `node dist/migrate.js` as a separate step | image built, compose stack run end to end |
| worker | `infra/docker/worker.Dockerfile` → image | image built, delivered an event in the compose stack |
| admin-web | static files in `apps/admin-web/dist` (any static host/CDN) | `vite build` |
| workforce-mobile | library build only; **no native shell yet** | `tsc` build |
| contracts, config | consumed from source by the other units (bundled into images and apps) | `tsc` emits declarations |
| infra | templates deployed as-is | compose config validated; templates parsed and policy-tested |

Nothing here deploys anywhere. Hosting for the api/worker/admin-web, image registry, and a production
database are later decisions (see the phased plan in the repository audit).

## Adding a unit

1. Create `apps/<name>` or `packages/<name>` with a `package.json` (`@equipdemo/<name>`) defining
   `lint`, `typecheck`, `test`, `build`, and a `tsconfig.json` extending `../../tsconfig.base.json`.
2. Add it to `UNITS` in `scripts/boundaries/units.js` (and an ESLint override in `.eslintrc.js` if its kind needs one).
3. `npm install` (updates the lockfile), then `npm run verify`.
