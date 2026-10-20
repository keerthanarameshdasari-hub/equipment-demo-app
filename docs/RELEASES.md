# Versioning, release candidates and artifact integrity

## 1. Version conventions

| Identifier | Who sees it | Format | Source of truth | Changes when |
|---|---|---|---|---|
| **App version** | Users (About screen, store listing) | `MAJOR.MINOR.PATCH`, e.g. `1.1.1` | `version` in `package.json` | A human decides to release new behaviour |
| **Build number** | Platforms only | Positive integer, e.g. `1031` | Assigned by CI per build | Every build that could be uploaded |
| Android `versionName` | Users | = app version | read from `package.json` by `android/app/build.gradle` | with app version |
| Android `versionCode` | Play / device | = build number | Gradle property `-PappVersionCode` | every build |
| iOS `CFBundleShortVersionString` | Users | = app version | `MARKETING_VERSION` in the Xcode project | with app version |
| iOS `CFBundleVersion` | App Store Connect | = build number | `CURRENT_PROJECT_VERSION`, set at build time | every build |

The app version and build number are deliberately separate: many builds (candidates,
re-runs) can share one app version, but no two uploadable builds ever share a build number.

**Changing the app version:** `npm run version:set 1.2.0`. This updates `package.json`,
`package-lock.json` and the iOS project together. CI runs `npm run version:check` on every
build and fails if they disagree.

## 2. Three build channels, separate numbering

| Channel | Built by | Android app ID | App name on device | versionName | versionCode (build number) |
|---|---|---|---|---|---|
| Local | `npm run android` / Gradle | `…app.dev` (debug) | equipDemo Dev | `1.1.1-dev` | `1` |
| Development | CI on every PR / push to `main` | `com.equipmentdemo.app.dev` | equipDemo Dev | `1.1.1-dev.<run>` | CI run number |
| Release candidate | `release.yml` on an RC tag | `com.equipmentdemo.app` | equipDemo | `1.1.1` | `1000 + run × 10 + attempt` |
| Approved release | `promote.yml` (no build) | same binary as the candidate | equipDemo | same | same |

- Development builds use a **different application ID** (`.dev`), so their numbers can never collide
  with release numbers and both apps can be installed side by side.
- **Release build numbers** come from the release workflow's run number, which GitHub never reuses,
  plus the re-run attempt (1–9). Every release build attempt therefore gets a unique, increasing number,
  all above 1000. As an extra guard, the workflow reads the build numbers of all existing GitHub Releases
  and refuses to build if the new number is not higher, which catches e.g. a renamed workflow restarting its counter.
- Build numbers may have gaps (failed or rehearsal runs). Stores only require "unique and increasing".
- **iOS** is not built in CI yet. The manifest records the values an iOS build of the candidate must use
  (`CFBundleVersion` = the same build number), so that build can be set with
  `xcodebuild … MARKETING_VERSION=<version> CURRENT_PROJECT_VERSION=<build number>`.

## 3. Release flow

```
version:set 1.1.1 → PR → merge to main
        │
        ▼
git tag v1.1.1-rc.1 && git push origin v1.1.1-rc.1
        │
        ▼  release.yml  (the ONLY place a release binary is built)
checks (same as CI) → assembleRelease with build number N
→ read versionName/versionCode back out of the APK (aapt2)
→ release-manifest.json + SHA256SUMS.txt + release-record.json
→ verify → CI artifact "equipdemo-v1.1.1-rc.1-buildN" (90 days)
→ download it again (digest-checked) → verify → GitHub pre-release "v1.1.1-rc.1"
        │
        ▼  promote.yml  stage = qa         (no build)
download pre-release → verify SHA-256, manifest, tag→commit,
cross-check CI artifact copy → append "qa" to release-record.json
        │
        ▼  promote.yml  stage = approved   (no build)
same verification → append "approved" → create tag v1.1.1 on the SAME commit
→ GitHub Release "v1.1.1" with the SAME files (identical SHA-256)
```

A fixed bug means a new candidate (`v1.1.1-rc.2`), never a rebuilt `rc.1`. Once `v1.1.1` is approved,
further candidates need a new app version (the release workflow refuses `v1.1.1-rc.*` when `v1.1.1` exists).

**Rehearsal:** Actions → *Release candidate* → *Run workflow* on a branch builds and verifies a
candidate (artifact name prefixed `rehearsal-`) without creating a GitHub Release.

## 4. Files

**`release-manifest.json`** is written once by the build and never changed. It contains:
app version; build number; RC tag; Android app ID, versionName and versionCode as read from the APK;
iOS values; repository and full commit SHA; build timestamp (UTC); workflow run ID, number, attempt and
URL; toolchain (Node, Java, React Native, runner image); artifact file name, size and SHA-256;
CI artifact name and retention.

**`SHA256SUMS.txt`** is standard `sha256sum` format, so it can be checked with no project tools.

**`release-record.json`** is the append-only stage history: one entry per stage with stage, time,
who, workflow run URL, the SHA-256 verified at that stage, and optional notes. Promotion refuses to
skip a stage, repeat a stage, or record a different SHA-256 from the candidate's.

## 5. Storage and retention

| Store | What | Retention |
|---|---|---|
| CI artifact `equipdemo-v<ver>-rc.<n>-build<N>` | APK, manifest, SHA256SUMS, initial record | 90 days (`RETENTION_DAYS` in `release.yml`) |
| CI artifact `release-record-<rc>-<stage>` | Record after each promotion | 90 days |
| GitHub pre-release `v<ver>-rc.<n>` | Same files; record updated per stage | Until deleted (permanent) |
| GitHub Release `v<ver>` | Approved files, identical binary | Until deleted (permanent) |
| CI development builds | Dev APK + build-info | 30 days |
| Test reports | ESLint, tsc, Jest, coverage | 14 days |

90 days is the maximum artifact retention for this repository's plan. The GitHub Releases are the
long-term record. The two copies are compared at every promotion while the CI copy still exists.

## 6. Verifying an artifact yourself

Download the candidate (GitHub → **Releases** → `v1.1.1-rc.1` → assets, or the CI artifact zip) into a folder:

```bash
# With the project checked out (any OS with Node.js):
npm run release:verify -- path/to/folder
# Optional: also assert the source commit and version
node scripts/release/cli.js verify path/to/folder --commit <sha> --version 1.1.1

# Without any project tools:
sha256sum -c SHA256SUMS.txt                       # Linux / Git Bash
shasum -a 256 -c SHA256SUMS.txt                   # macOS
Get-FileHash .\equipdemo-*.apk -Algorithm SHA256   # Windows PowerShell; compare with SHA256SUMS.txt
```

Then confirm the commit: `git show <commit from manifest>` exists, and `git rev-parse v1.1.1-rc.1^{commit}` equals it.

## 7. Limits of this demo

- Release APKs are signed with the Android **debug key** (internal testing only). Production would
  use an upload key stored as an encrypted CI secret, and Play App Signing.
- Records live in GitHub Releases, editable by repository admins. Signed provenance (GitHub artifact
  attestations / Sigstore) would make them tamper-evident, but it needs a public repository or GitHub Enterprise.
- Required approvals before a stage (GitHub Environments with reviewers) need a paid plan for private
  repositories. Here, promotion is a deliberate manual workflow run, and the actor is recorded.
