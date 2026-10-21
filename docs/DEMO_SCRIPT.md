# 10-minute presentation and demo script

Speak the plain text; *italic lines* are what to show. Every number is from [PRESENTATION.md](PRESENTATION.md).
Open these tabs before starting (repository: `github.com/keerthanarameshdasari-hub/equipment-demo-app`):

1. Repository home (README)
2. **Actions** → CI → run 39623473206 (latest green `main`)
3. **Releases** → `v2.0.0`
4. **Actions** → run 39587402651 (failing drill) and 39593348460 (checksum drill)
5. **Actions** → Publish run 39593535094 (rejected)
6. `docs/PLATFORM_COMPARISON.md`
7. The app on a phone or emulator (APK from the `v2.0.0` release), optional

Backup if the network fails: `docs/PRESENTATION.md` has every table and run number.

---

### 0:00–1:00: What this is (1 min)

*Show: README.*

"equipDemo is a small React Native app that lists hire equipment from Supabase and lets you add items.
The app is deliberately simple. The point is the pipeline around it: how a change gets from a pull request
to an approved release, with evidence at every step and without any app-store accounts.
I'll label everything as implemented, simulated, documented, or not completed. Nothing here is production-ready, and I'll say where."

### 1:00–2:00: Architecture (1 min)

*Show: PRESENTATION.md §1 diagram.*

"The screens only talk to a repository interface. Today that's Supabase, protected by row-level security:
anyone with the app can read and add, nobody can change or delete. A lint rule stops the UI importing any backend SDK,
and one contract test suite runs against every adapter. That seam is implemented. An AWS Amplify adapter is documented, not built.
Publishing goes through a separate adapter too. The default is a mock store, which is simulated and never contacts a store."

### 2:00–3:30: The pipeline (1.5 min)

*Show: CI run 39623473206, then the Version 1 compatibility job.*

"Every pull request runs a secret-file guard, a version consistency check, lint, TypeScript, 119 tests, and an Android build.
One job is worth pointing out: Version 1 compatibility. It checks out the Version 1 release and runs its original tests,
then runs those same Version 1 tests against today's code. 53 pass both ways.
A release candidate is built only from a tag. The workflow reads the version and build number back out of the APK,
writes a manifest and a SHA-256 checksum, verifies them, and publishes a pre-release."

### 3:30–5:00: Versions, stages and the release record (1.5 min)

*Show: Releases → v2.0.0 → open `release-record.json`.*

"Version 1, 1.1.2, is build 1041. Version 2, 2.0.0, adds search and is build 1052.
Build numbers are 1000 plus run times ten plus attempt, so they only go up. Development builds use a separate app ID.
Each release went through six stages: DEV, SIT, QA, UAT, PRE-PROD, PROD. Here's the record: one entry per stage,
who approved, and the same SHA-256 every time. The binary was never rebuilt.
To be clear about what's real: DEV and PROD are actual. SIT and PRE-PROD run real integration checks against Supabase,
but they share one Supabase project, so those environments are simulated. QA and UAT approvals are real GitHub approvals,
but I fill every role myself, so they show the mechanism, not separation of duties."

### 5:00–6:30: Failure and recovery (1.5 min)

*Show: run 39587402651 (red), then 39593348460 (checksum drill).*

"We broke things on purpose. A failing test made CI red, and the release build stopped before any APK existed,
so there was nothing to promote. The fix turned it green. An off-by-one bug was caught by four tests.
Here, a release APK with one extra byte added was rejected by verification and by the publishing adapter.
And here, a production publish request was rejected by the reviewer. The job never started."

*Show: publish run 39593535094 (0 steps).*

"Rollback: you can't really downgrade a mobile app, so app rollback means rolling forward, rebuilding known-good source
as a higher version through the same gates. The drill recovered source from the v2.0.0 tag and CI went green.
It also taught us something: restoring a folder from a tag undid later good changes, so the runbook now prefers git revert.
Store rollout halting and backend rollback are documented, not exercised."

### 6:30–8:30: Three CI/CD platforms (2 min)

*Show: PLATFORM_COMPARISON.md §3 and §7.4; optionally the EAS run page (expo.dev → equipdemo → Workflows → 01a15f00).*

"We ran the same pipeline on AWS CodeBuild, on the same two commits.
Both platforms passed the good commit with 119 of 119 tests, and both stopped the bad commit at the same test.
GitHub's release build took about 8 minutes of work, plus 5 minutes queued. CodeBuild took about 9 and a half.
I am not claiming either is faster: one sample each, different memory, caches and region.
CodeBuild's first build failed after building the APK with exit code 141. That was our own script: a pipe that had been passing
on GitHub by luck. A second platform found a latent flaky step, and we fixed it everywhere.
CodeBuild needed more setup, a CloudFormation stack and a manual start per build, and it has no approval step on its own.
Third, EAS Workflows from Expo, on a separate trial branch so main stays free of Expo.
The first build failed because EAS wants the Android package name in its own config for a non-Expo app; after adding it,
the full run succeeded: checks, an EAS-built APK with build number 6001, the checksum and mock publishing gate, and an approval step.
The run page records who approved and when, which is a nice audit trail.
The Gradle build took about 6 minutes and the active work about 7 and a half. But the whole run took 2 hours 33 minutes,
because on the free plan each job waited over half an hour in a low-priority queue. That's a plan limit, not build speed.
We haven't run the failing commit on EAS yet, so that part is not completed."

"Decision: GitHub Actions stays primary, because it already carries our approvals and release records and costs nothing here."

### 8:30–9:15: Secrets and AWS (0.75 min)

*Show: PRESENTATION.md §7.*

"Only the Supabase publishable key is used, never the service-role key, and a test fails if anything else could be compiled
into the app. Fork pull requests never get secrets. For AWS we designed short-lived OIDC credentials,
but an AWS Organizations policy blocks creating the identity provider. We documented that and did not fall back to stored access keys.
Load balancing and autoscaling are a documented test plan only. Supabase is the live backend, so nothing on AWS scaling has been tested."

### 9:15–10:00: Limits and next steps (0.75 min)

*Show: PRESENTATION.md §11.*

"The main limits: one shared Supabase project, debug-key signing, one person in every approver role, no iOS build,
and no crash reporting in the app. Next: run the failing commit on EAS, separate backends per stage, a real signing key,
iOS, then the Amplify migration through the adapter seam we already have. Thank you."

---

## Optional live demo (if there are 3 spare minutes)

1. Install the `v2.0.0` APK from Releases; search for "roller": the count shows "Showing 1 of 5". The release APK uses built-in demo data (it is built without backend configuration), so the badge says demo data.
2. Or run **Actions → Failure drill → scenario `checksum`** live (about 20 seconds); it must pass by *rejecting* the tampered copy.

Avoid running anything that publishes or promotes during the talk.
