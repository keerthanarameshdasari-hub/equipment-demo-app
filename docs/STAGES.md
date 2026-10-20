# Release stages: DEV → SIT → QA → UAT → PRE-PROD → PROD

Each release candidate moves through six stages as **one unchanged binary**. A stage is recorded only
after its checks pass (and, where required, after a reviewer approves). The next stage refuses to
start until the previous one is recorded.

```
 DEV            SIT            QA             UAT            PRE-PROD       PROD
 CI + RC build  integration    binary + tests acceptance     readiness      release
 (release.yml)  ───────────────────────── promote.yml, one run per stage ─────────────────────────
 automatic      automatic      approval       approval       approval       approval
 actual         simulated env  simulated dep. simulated      simulated env  actual (+ simulated store)
```

**Actual** means the checks and result are real. **Simulated** means there is no separate environment
for that stage in this demo, so the stage is a clearly labelled stand-in. Every simulated stage says
`SIMULATED` in the workflow run (a notice on the run page) and in its `release-record.json` entry
(`"kind": "simulated"` plus a `deployment` description). Checks run inside a simulated stage are
still real; it is the *environment* that is shared or absent.

## Stages at a glance

<!-- Generated from scripts/release/stages.js: edit that file, not this table. -->
| Stage | Kind | Purpose | Approver | Backend / configuration target |
|---|---|---|---|---|
| **DEV** | Actual | Integrate code changes continuously and produce the release candidate. | None (automatic) | None: tests use the in-memory mock data source; APKs use built-in demo data. |
| **SIT** | **Simulated** | System integration: prove the candidate's code works against a real backend. | None (automatic) | Supabase (SIT environment variables; shared demo project). |
| **QA** | **Simulated** | Functional quality: verify the exact binary and its behaviour before business review. | QA lead (demo: repository owner) | None for automated checks (mock data source); the APK uses built-in demo data. |
| **UAT** | **Simulated** | User acceptance: business owner confirms the release meets requirements. | Product owner (demo: repository owner) | None (acceptance is performed on the same binary). |
| **PRE-PROD** | **Simulated** | Production rehearsal: confirm the backend the release depends on is ready and locked down. | Release manager (demo: repository owner) | Supabase (PRE-PROD environment variables; shared demo project). |
| **PROD** | Actual | Release: mark the candidate as the approved production version. | Release manager + product owner (demo: repository owner) | Supabase (PROD environment variables; read-only smoke check, no writes). |

### DEV (actual)

- **Purpose:** Integrate code changes continuously and produce the release candidate.
- **What it is in this demo:** ACTUAL: CI on every pull request and push to main; the candidate is built by release.yml.
- **Required tests:**
  - Secret-file guard
  - Version consistency
  - ESLint
  - TypeScript
  - Unit and UI tests
  - APK build
- **Entry criteria:** A pull request to main, or an RC tag pushed for a version not yet released.
- **Exit criteria:** All CI checks green; RC built, identity read back from the APK, manifest and checksum stored.
- **Approver:** None (automatic)
- **Backend / configuration target:** None: tests use the in-memory mock data source; APKs use built-in demo data.
- **Release evidence:** CI run, test reports, release-manifest.json, SHA256SUMS.txt, GitHub pre-release.

### SIT (simulated)

- **Purpose:** System integration: prove the candidate's code works against a real backend.
- **What it is in this demo:** SIMULATED environment: no separate SIT backend exists, so the SIT environment points at the shared demo Supabase project. The integration checks themselves are ACTUAL.
- **Required tests:**
  - Artifact integrity (manifest, SHA256SUMS, CI copy, tagged commit)
  - Live Supabase integration tests at the candidate commit (read, write, RLS, constraints)
- **Entry criteria:** DEV recorded for this candidate.
- **Exit criteria:** All integration tests pass.
- **Approver:** None (automatic)
- **Backend / configuration target:** Supabase (SIT environment variables; shared demo project).
- **Release evidence:** Integration test report, release-record entry.

### QA (simulated)

- **Purpose:** Functional quality: verify the exact binary and its behaviour before business review.
- **What it is in this demo:** SIMULATED deployment: there is no QA device farm. The tester installs the APK from the GitHub pre-release. The automated binary and test checks are ACTUAL.
- **Required tests:**
  - Artifact integrity
  - Full unit and UI test suite at the candidate commit
  - APK inspection: app ID, versionName and versionCode match the manifest; JS bundle present
  - Manual QA test notes from the approver
- **Entry criteria:** SIT recorded.
- **Exit criteria:** Automated checks pass and a QA approver signs off with test notes.
- **Approver:** QA lead (demo: repository owner)
- **Backend / configuration target:** None for automated checks (mock data source); the APK uses built-in demo data.
- **Release evidence:** Test report, APK inspection output, approval with notes.

### UAT (simulated)

- **Purpose:** User acceptance: business owner confirms the release meets requirements.
- **What it is in this demo:** SIMULATED: no separate UAT environment or user group. Acceptance is recorded as the approver's notes.
- **Required tests:**
  - Artifact integrity
  - Acceptance notes from the approver
- **Entry criteria:** QA recorded.
- **Exit criteria:** Business approver accepts with notes.
- **Approver:** Product owner (demo: repository owner)
- **Backend / configuration target:** None (acceptance is performed on the same binary).
- **Release evidence:** Approval with acceptance notes.

### PRE-PROD (simulated)

- **Purpose:** Production rehearsal: confirm the backend the release depends on is ready and locked down.
- **What it is in this demo:** SIMULATED environment: points at the shared demo Supabase project (no separate pre-production database). The readiness checks are ACTUAL.
- **Required tests:**
  - Artifact integrity
  - Backend readiness at the candidate commit: read, write, RLS blocks update/delete, constraints reject bad data
- **Entry criteria:** UAT recorded.
- **Exit criteria:** Readiness checks pass and the release manager approves.
- **Approver:** Release manager (demo: repository owner)
- **Backend / configuration target:** Supabase (PRE-PROD environment variables; shared demo project).
- **Release evidence:** Readiness test report, approval.

### PROD (actual)

- **Purpose:** Release: mark the candidate as the approved production version.
- **What it is in this demo:** ACTUAL: final tag and GitHub Release with the identical binary. Store publishing is SIMULATED, disabled by default, and runs only when explicitly requested and enabled for PROD.
- **Required tests:**
  - Artifact integrity
  - Read-only production smoke check (no data written)
- **Entry criteria:** PRE-PROD recorded.
- **Exit criteria:** Approved; final tag and release created from the same files.
- **Approver:** Release manager + product owner (demo: repository owner)
- **Backend / configuration target:** Supabase (PROD environment variables; read-only smoke check, no writes).
- **Release evidence:** Final GitHub Release, complete release-record.json, (simulated) store submission receipt if requested.

## How a promotion runs (`.github/workflows/promote.yml`)

| Job | What happens | If it fails |
|---|---|---|
| **verify** | Downloads the candidate from its GitHub pre-release; verifies SHA-256 against the manifest and `SHA256SUMS.txt`; checks the tag still points to the recorded commit; cross-checks the copy in CI artifact storage; checks stage order; checks the stage's GitHub Environment has required reviewers | Run fails, nothing recorded |
| **checks** | Runs in the GitHub Environment named after the stage. **Waits for approval** (QA, UAT, PRE-PROD, PROD). Only then receives that environment's variables and secrets and runs the stage's checks | Run fails, nothing recorded |
| **record** | Appends the stage (checks, who ran it, who approved, notes, same SHA-256) to `release-record.json` on the pre-release. PROD: creates the final tag and GitHub Release from the same files | — |

**Failed checks block promotion:** if any check fails, `record` never runs, so the stage is missing
from the record and the next stage's *verify* job stops with
`QA requires SIT to be the last recorded stage`.

## GitHub Environments, variables and secrets

| Environment | Required reviewers | Deployment branches | Variables | Secrets |
|---|---|---|---|---|
| `SIT` | none (automatic) | `main` | `SUPABASE_URL` | `SUPABASE_PUBLISHABLE_KEY` |
| `QA` | yes | `main` | — | — |
| `UAT` | yes | `main` | — | — |
| `PRE-PROD` | yes | `main` | `SUPABASE_URL` | `SUPABASE_PUBLISHABLE_KEY` |
| `PROD` | yes | `main` | `SUPABASE_URL`, `PUBLISHING_ENABLED` (`false`) | `SUPABASE_PUBLISHABLE_KEY` |

- Each environment's secret is only given to a job that runs in that environment, and only after its
  approval. A SIT job cannot read PROD's secret.
- **Deployment branches = `main`** means only the reviewed workflow on `main` can use these environments.
  A modified workflow on another branch cannot.
- In this demo, SIT, PRE-PROD and PROD hold values for the **same** Supabase project, because only one
  exists. That is why SIT and PRE-PROD are labelled *simulated environments*. With separate projects,
  only these values would change.
- Only the **publishable** key is used anywhere. The service-role key is never stored in GitHub.
- The repository is public (GitHub's required reviewers need a public repository on the Free plan).
  Variables and secrets are not visible to the public, and workflows from forks never receive secrets.

**Demo approvals.** Every approver role is filled by the repository owner, so "Prevent self-review" is
off. A real team would list different people per environment and turn it on.

## Production publishing is off unless explicitly approved

Reaching PROD creates the final tag and GitHub Release (an internal release). A store submission
happens only if **all three** are true:

1. The PROD run was started with **publish_to_store** ticked.
2. The PROD environment variable `PUBLISHING_ENABLED` is `true` (default: `false`).
3. A PROD reviewer approved the run.

Even then, the submission is **SIMULATED**: a `store-submission-SIMULATED.json` receipt is attached to
the release and no store API is called.

## Configuration is fixed when the app is built

**Changing CI environment variables does not change an app that has already been built.**

- `babel.config.js` copies `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` into the JavaScript bundle
  **at build time**. After that, the APK is a sealed file; its SHA-256 proves nothing in it changed.
- Release candidates are built by `release.yml` **without** backend configuration, so the binary uses
  built-in demo data in every stage.
- The Supabase values in SIT, PRE-PROD and PROD are used by **the checks CI runs in that stage**
  (integration, readiness and smoke tests), not by the app on a phone.
- Editing a PROD variable today changes the next PROD *check* or the next *build*; it cannot reach an
  APK that is already built or installed.
- To make one binary talk to different backends per stage, the app would need **runtime
  configuration** (e.g. fetching settings at startup), or each stage would need its own build, which
  would break "same binary in every stage". This demo keeps one binary and documents the trade-off.

## Running a candidate through the stages

1. Merge to `main` with a new version (`npm run version:set X.Y.Z`), tag `vX.Y.Z-rc.1` and push the tag.
   `release.yml` builds and records **DEV**.
2. **Actions → Promote release candidate → Run workflow**, once per stage in order:
   `SIT` → `QA` (notes required) → `UAT` (notes required) → `PRE-PROD` → `PROD`.
3. For stages with approval, the run pauses with **Review deployments**. Approve it to continue.
4. After PROD: **Releases** shows `vX.Y.Z` (Latest) with `release-record.json` listing all six stages,
   each with the same SHA-256.
