# CI pipeline (GitHub Actions)

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

```
pull request to main ─┐
push to main ─────────┼─► checks ────────────────────────────► android
manual run ───────────┘   guard: no .env / key files          (only if checks pass)
                          npm ci (lockfile)                     npm ci
                          lint                                  gradlew assembleDebug
                          typecheck                             name + checksum + build info
                          tests + coverage                      upload APK artifact
                          upload test reports (always)
```

## Triggers

| Event | Why |
|---|---|
| Pull request into `main` | Every change is checked before it is merged |
| Push to `main` | Confirms the integration branch after each merge and produces the APK for it |
| Manual (**Actions → CI → Run workflow**) | Re-run on demand, e.g. for a demo |

`main` is the integration branch. Work happens on short-lived branches merged through pull requests.

## Jobs

**checks** (about 1 minute). If any step fails, the job and the workflow fail, and `android` does not run.

1. *Secret file guard*: fails if a `.env` file (other than `.env.example`) or a key/certificate file is committed.
2. `npm ci`: installs exactly the versions in `package-lock.json`; fails if it is out of sync with `package.json`.
3. ESLint, then `tsc --noEmit`, then Jest (unit, repository and UI tests, against the mock data source).
4. A summary table of test results is added to the run page.

**android** (about 10–15 minutes uncached). Builds `assembleDebug` with `-PbundleJsInDebug`, so the
debug APK contains the JavaScript and runs without a dev server. It builds two CPU architectures:
`arm64-v8a` (phones) and `x86_64` (emulators).

## Artifacts

| Artifact name | Contents | Kept for |
|---|---|---|
| `equipdemo-v<version>-dev.<run>-<commit>` | `equipdemo-v<version>-dev.<run>-<commit>.apk`, `SHA256SUMS.txt`, `build-info.json` | 30 days |
| `test-reports-run<n>-attempt<m>` | `reports/` (ESLint, tsc and Jest output, `jest-results.json`) and `coverage/lcov-report/` (HTML) | 14 days |

`<commit>` is the first 7 characters of the commit SHA, so every APK can be traced to exact source.
Development APKs install as a separate app, **equipDemo Dev** (`com.equipmentdemo.app.dev`), with
versionCode = CI run number. Release candidates are built by a separate workflow; see [RELEASES.md](RELEASES.md).
`build-info.json` records version, commit, branch, run link and build time.
Test reports are uploaded even when tests fail.

**Download:** repository → **Actions** → pick a run → scroll to **Artifacts** → click the name.
GitHub delivers it as a `.zip`. Unzip it, then compare the checksum: `sha256sum -c SHA256SUMS.txt`
(Windows PowerShell: `Get-FileHash <file>.apk -Algorithm SHA256`).

**Install on an Android device or emulator:** enable installing from unknown sources, then open
the APK, or run `adb install equipdemo-v...-debug-....apk`. CI builds contain no Supabase
configuration, so the app shows **"Demo data (no backend configured)"**. That is by design: CI uses no secrets.

## Caching (only where it pays off)

| Cache | Via | Why |
|---|---|---|
| npm download cache (`~/.npm`) | `setup-node` `cache: npm`, keyed on `package-lock.json` | Faster `npm ci`. `node_modules` itself is not cached, so installs stay clean and reproducible |
| Gradle dependencies and wrapper | `setup-java` `cache: gradle`, keyed on Gradle files | Saves downloading several hundred MB per Android build |

No build outputs are cached, so every APK is built from source.

## Security

- `permissions: contents: read`: the workflow token can only read the repository.
- `persist-credentials: false`: the token is not left in `.git/config`, so it cannot leak into artifacts.
- No secrets are used, so none can be printed. The APK and test reports contain no keys.
- Every action is pinned to a full commit SHA of a reviewed release (version in the comment).
  Dependabot ([`.github/dependabot.yml`](../.github/dependabot.yml)) proposes updates weekly as pull requests.
- Runner image pinned to `ubuntu-24.04` (not `ubuntu-latest`) so it cannot change unexpectedly.
- No app store is contacted.

## Repository setup

1. **Settings → Actions → General**
   - *Actions permissions*: "Allow all actions" works. For tighter control, choose "Allow
     keerthanarameshdasari-hub, and select non-…" and allow actions created by GitHub.
   - *Workflow permissions*: **Read repository contents and packages permissions** (the workflow
     also requests only `contents: read`).
2. **Settings → Secrets and variables → Actions**: nothing is required for CI.
3. **Required checks (branch protection).** To make a failing check block merging, add a rule
   for `main` requiring the checks *Lint, typecheck and test* and *Android debug APK*.
   GitHub only offers this on private repositories with a paid plan, or on public repositories.
   On the current free private plan, the checks still run and show red/green on every pull request,
   but merging is not blocked automatically.

## Reproducing CI locally

```bash
npm ci
npm run lint
npm run typecheck
npm test -- --coverage
cd android && ./gradlew assembleDebug -PbundleJsInDebug -PreactNativeArchitectures=arm64-v8a,x86_64
```

## Evidence

| Check | Run |
|---|---|
| Successful run (checks + APK) | [39160037754](https://github.com/keerthanarameshdasari-hub/equipment-demo-app/actions/runs/39160037754): 40/40 tests; artifact `equipdemo-v1.1.0-debug-a0bb8e8` (28.8 MB zip); checks 40 s, APK 9 min |
| Failing check fails the workflow | [39159571609](https://github.com/keerthanarameshdasari-hub/equipment-demo-app/actions/runs/39159571609): deliberately failing test (commit `4675924`) → tests step failed, workflow failed, Android job skipped, test reports still uploaded. Reverted in `a0bb8e8` |
