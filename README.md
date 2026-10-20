# equipDemo

A small React Native (TypeScript) app that lists hire equipment from Supabase and lets
users add items. It is a proof of concept for a mobile CI/CD pipeline built on GitHub Actions.

- **App:** bare React Native 0.86 (no Expo), React Navigation, Supabase
- **Backend:** Supabase table `equipment`, protected by row-level security ([docs/SUPABASE.md](docs/SUPABASE.md))
- **CI:** GitHub Actions: lint, typecheck, tests, Android debug APK ([docs/CI.md](docs/CI.md))
- **Releases:** versioned release candidates with manifests and checksums, promoted without rebuilding ([docs/RELEASES.md](docs/RELEASES.md))
- **Stages:** DEV → SIT → QA → UAT → PRE-PROD → PROD with GitHub Environment approvals ([docs/STAGES.md](docs/STAGES.md))
- **Publishing:** replaceable store adapter; the default mock is SIMULATED and contacts no store ([docs/PUBLISHING.md](docs/PUBLISHING.md))
- **Distribution:** internal only; no app store is used

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 22.11 or newer | everything |
| npm | comes with Node | installing dependencies |
| JDK | 17 | Android builds |
| Android Studio + SDK 36 | latest | running on an emulator/device |
| macOS + Xcode + CocoaPods | latest | iOS only |

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

## Local commands (the same checks CI runs)

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
App.tsx                 navigation + data-source wiring
src/domain/             Equipment type and validation rules
src/data/               data access: repository interface, Supabase + mock implementations
src/screens/            Home, Add equipment, Details
__tests__/              unit and UI tests (mock data source)
__integration__/        live Supabase tests
supabase/               schema.sql (table, constraints, RLS) and seed.sql
android/, ios/          native projects
.github/workflows/      CI pipeline
docs/                   baseline, Supabase and CI documentation
```

## Versions

| Tag | Contents |
|---|---|
| `v1.0.0` | Original Expo app (pre-migration baseline), also on branch `release/v1` |
| `v1.1.0` | Version 1: bare React Native app with Supabase fetch and submit |
| `v1.1.1-rc.N` → `v1.1.1` | Version 1 release candidates and the approved release, built by the release pipeline ([docs/RELEASES.md](docs/RELEASES.md)) |
| `v1.1.2-rc.N` → `v1.1.2` | Version 1 promoted through all six stages ([docs/STAGES.md](docs/STAGES.md)) |
