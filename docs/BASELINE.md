# equipDemo — Phase 1 Baseline

Repository: `keerthanarameshdasari-hub/equipment-demo-app` (private). Local VS Code folder: `hello-world`.
Inspected 2026-10-18 (IST). Deadline: Tue 2026-10-20 morning.

Phase 1 was extended at the owner's request: **Expo was removed** and the app migrated to a
bare React Native CLI project, on branch `chore/phase1-baseline`.

## 1. Where Version 1 lives

| Ref | Commit | Contents |
|---|---|---|
| `main` | `e064830` | Version 1, unchanged (Expo SDK 57) |
| `release/v1` | `e064830` | Frozen copy of Version 1 |
| tag `v1.0.0` | — | **Not created yet**: this session cannot push tags. Owner runs: `git fetch origin && git tag -a v1.0.0 origin/release/v1 -m "Version 1" && git push origin v1.0.0` |
| `chore/phase1-baseline` | head of branch | Bare React Native migration (same features, no Expo) |

Version 1 was proven to build before any change: Expo `prebuild` + `assembleRelease` succeeded in
GitHub Actions run **39149426936** (17m56s, APK 33.6 MB).

## 2. Project facts after migration

| Item | Before (V1, Expo) | After (bare RN) |
|---|---|---|
| Framework | Expo SDK 57 managed, native folders generated | React Native CLI; `android/` and `ios/` committed |
| React Native / React | 0.86.3 / 19.2.3 | unchanged |
| Entry point | `index.ts` → `registerRootComponent` | `index.js` → `AppRegistry.registerComponent('equipDemo')` |
| App name | `hello-world` | `equipDemo` |
| Android id | `com.equipmentdemo.app` | unchanged |
| iOS bundle id | none | `com.equipmentdemo.app` |
| Version | 1.0.0 | versionName **1.1.0**, versionCode **2** (in `android/app/build.gradle`) |
| TypeScript | ~6.0.3, `expo/tsconfig.base` | ^5.8.3, `@react-native/typescript-config` (version the RN template is tested with) |
| Jest preset | `jest-expo` | `@react-native/jest-preset` |
| Lint | not configured | ESLint 8 + `@react-native/eslint-config` (`npm run lint`) |
| Env inlining | Expo `EXPO_PUBLIC_*` | Babel `transform-inline-environment-variables`, **allow-list only** |
| Env names | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (`.env.example` added) |
| Removed | — | `expo`, `expo-status-bar` (unused), `jest-expo`, `react-native-web`, `react-dom`, `eas.json`, `index.ts` |
| Package manager | npm | npm; `package-lock.json` regenerated |
| Android toolchain | (generated) | Gradle 9.3.1 wrapper, compile/target SDK 36, min SDK 24, Kotlin 2.1.20, New Architecture + Hermes on |

App code (`App.tsx`, `lib/supabase.ts` apart from env names, tests) is unchanged.

## 3. Verification results (GitHub Actions, `ubuntu-24.04`)

| Check | Result |
|---|---|
| `npm install` (lockfile sync) | Pass; lockfile committed as `4e419f0` |
| Jest (3 tests) | Pass |
| `tsc --noEmit` | Pass |
| ESLint | Pass (no findings) |
| Android `assembleRelease` | Pending — run 39151024549 in progress |
| iOS | Not run: needs a macOS runner and CocoaPods (planned as an optional time-boxed job) |

Local workspace: no Android SDK, no macOS, npm registry blocked. GitHub Actions is the build environment.

## 4. Known gaps and risks

1. **Missing Supabase env crashes at launch.** `createClient` runs at import with `undefined` values.
   CI builds use no secrets, so the CI APK will not reach Supabase. Fixed in the data-layer phase
   (mock repository by default, lazy client).
2. **Data access coupled to UI**: `App.tsx` queries Supabase directly. Needs a repository interface.
3. **Tests duplicate validation logic** instead of importing it from app code.
4. **Release APK is signed with the public debug keystore.** Fine for internal demo only.
5. **App icon** reverted to the React Native default; Expo icon PNGs remain in `assets/` (unused).
6. **iOS project unvalidated** (no `pod install`/Xcode run yet).
7. **`LICENSE` is Expo's MIT license** (copyright "650 Industries, Inc. (aka Expo)"), inherited from
   the starter template. Owner should decide whether to replace it with the project's own licence.
8. Runner image: `ubuntu-latest` moves to Ubuntu 26 from 2026-10-19, so workflows pin `ubuntu-24.04`.
9. Android release build takes ~18 min uncached; CI now builds two ABIs (arm64-v8a, x86_64) and caches Gradle.
10. Actions secrets cannot be listed from this session. Owner to confirm whether
    `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` exist (rename from the old `EXPO_PUBLIC_*` names if so).

## 5. Branching structure

- `main`: always green; changes arrive via PR. **Merge `chore/phase1-baseline` into `main` via PR to adopt bare RN.**
- `release/v1` + tag `v1.0.0`: Version 1 (Expo), frozen.
- `feature/*`, `chore/*`: short-lived branches.
- Version 2: `feature/v2-*` → PR → merge → tag `v2.0.0` (versionName 2.0.0, versionCode 3).
- Release workflow (Phase 2) triggers on `v*` tags.

## 6. Implementation checklist (dependency and risk order)

1. [x] Preserve V1 (`release/v1`); [ ] owner pushes tag `v1.0.0`.
2. [x] Remove Expo; bare RN builds for Android in CI.
3. [ ] Owner reviews and merges the `chore/phase1-baseline` PR.
4. [ ] Data layer: `EquipmentRepository` interface, Supabase + mock implementations, lazy client.
5. [ ] Move validation to `src/domain/equipment.ts`; tests import it; repository tests.
6. [ ] Replace temporary `migration-verify.yml` with `ci.yml` (test, typecheck, lint) and Android build check.
7. [ ] `release.yml`: tag → build APK → artifact + checksum → mock publish adapter.
8. [ ] Mock publish adapter (`PUBLISH_TARGET=mock`), real adapters as stubs.
9. [ ] Optional: iOS unsigned simulator build on macOS runner (time-boxed).
10. [ ] Version 2 change → PR → tag `v2.0.0` → pipeline.
11. [ ] `aws/buildspec.yml` (CodeBuild comparison).
12. [ ] `AmplifyRepository` stub and migration note.
13. [ ] Demo runbook and comparison.

## 7. Open questions for the owner

1. What should Version 2 change? (Suggestion: search/filter, or an availability field.)
2. Is an AWS account available to actually run CodeBuild, or is a documented comparison enough?
3. Replace the Expo `LICENSE`?
