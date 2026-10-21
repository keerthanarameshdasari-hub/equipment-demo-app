# Failure and recovery drills: evidence

Run on 21 Oct 2026 against the real repository. Run numbers link to
`https://github.com/keerthanarameshdasari-hub/equipment-demo-app/actions/runs/<run>`.

All drills are safe: code drills happened on a disposable branch (`drill/failing-test`, PR #15, closed
without merging); artifact drills only modify a downloaded copy inside a CI runner; nothing was published
to a store (publishing is SIMULATED).

## Summary

| # | Scenario | Expected | Observed | Evidence |
|---|---|---|---|---|
| 1 | Temporary failing test | CI fails | ✅ CI **failed**: 115 passed, **1 failed** | CI 39587402651 (`44ff925`) |
| 2 | Release from the failing code | Promotion blocked | ✅ Release run **failed at Checks**; *Build release candidate* and *Record candidate* **skipped**: no APK, no pre-release, so nothing exists that could be promoted | Release candidate 39587402672 |
| 3 | Fix and rerun | Green again | ✅ CI **green** (115/115, Version 1 compatibility 53/53 both ways, APK built); release rehearsal builds a candidate again (build 1071, rehearsal only) | CI 39587545196, Release 39587538049 (`ac323b7`) |
| 4 | Regression in app code (count off by one) | CI fails | ✅ CI **failed**: **4 tests** caught it (Version 2 count tests) | CI 39588864703 (`1688145`) |
| 5 | Recovery from known-good source revision | Green again | ✅ `git checkout v2.0.0 -- src` → CI **green** (115/115, V1 compat 53/53, APK built) | CI 39589023673 (`96d1c4f`) |
| 6 | Invalid artifact checksum | Rejected | ✅ Drill **passed**: original `v2.0.0` APK verified; a copy with one extra byte was **rejected by release verification and by the publishing adapter** | Failure drill (checksum) 39593348460 |
| 7 | Production publishing without approval | Nothing happens until approved; rejection publishes nothing | ✅ Request **rejected** by the PROD reviewer ("Drill: not approved") → job **never started** (0 steps), no publish log | Publish 39593535094 |
| 7b | …and with approval | Runs only after approval | ✅ Waited for PROD approval; ran after approval by the owner; all results SIMULATED | Publish 39593358889 (log `publish-log-mock-production-SIMULATED-run39593358889.json` on `v2.0.0-rc.1`) |
| 8 | Known-good releases available for recovery | Intact and traceable | ✅ Drill **passed** (table below) | Failure drill (recovery) 39593351937 |
| 9 | CI monitoring | Report of results, failures, durations, artifacts | ✅ Generated in CI and as a snapshot | CI monitoring report 39593355251; [evidence/ci-report-2026-10-21.md](evidence/ci-report-2026-10-21.md) |

Earlier evidence of the same safeguards: CI failure demo (run 39159571609, Prompt 3); promotion blocked
after a failed QA check (runs 39452948125 → 39453228222, Prompt 5); checksum and metadata rejections in
publishing (runs 39478731234, 39478567773, Prompt 6); PROD recovery after a refused tag (Prompt 7).

## Known-good revisions (recovery drill, scenario 8)

| Release | Build | Source commit | Tag → commit matches | Stages recorded |
|---|---|---|---|---|
| `v2.0.0` | 1052 | `af23b46` | ✅ | DEV → SIT → QA → UAT → PRE-PROD → PROD |
| `v1.1.2` | 1041 | `21ee51e` | ✅ | DEV → SIT → QA → UAT → PRE-PROD → PROD |
| `v1.1.1` | 1031 | `8551dd6` | ✅ | candidate → qa → approved (earlier two-stage scheme) |

Each binary verifies against its manifest and checksum, so any of them can serve as the recovery
source (RUNBOOK-ROLLBACK.md, Path A).

## Findings

1. **Gates held.** A failing check stopped CI *and* the release build before anything promotable existed.
2. **Restoring a folder from a tag is broad.** Scenario 5's `git checkout v2.0.0 -- src` also undid later
   *good* changes made after v2.0.0 (the Prompt 8 data-source labels), and CI stayed green. The runbook now
   prefers `git revert` of the specific bad commit and treats tag restores as a last resort that needs a diff review.
3. **Approval is per run.** Approving one production publish did not approve the next; the second request
   was rejected independently.
4. **Process slip during the drill:** switching branches with uncommitted work swept unrelated files into a
   drill commit (visible as 11 suites instead of 10). It was caught from the test count, and the drill commit
   was rebuilt with only the intended change (`1688145`) before evidence was taken. Lesson: commit or stash
   before switching branches.

## Re-running the drills

| Drill | How |
|---|---|
| Checksum | Actions → **Failure drill** → scenario `checksum` (optionally a release tag) |
| Recovery | Actions → **Failure drill** → scenario `recovery` |
| Approval | Actions → **Publish (store adapter)** → track `production`, target `mock` → **Reject** at Review deployments |
| Failing test / regression | Disposable branch + PR: add a failing test or a bug → CI red → fix or `git revert` → green → close PR without merging |
| Monitoring | Actions → **CI monitoring report** (also every Monday) |
