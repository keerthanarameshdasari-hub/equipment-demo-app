# Runbook: rollback and recovery

Use when a bad change reaches `main`, a release candidate, or users. Commands assume the project folder
(Windows PowerShell: use `npm.cmd`).

## 0. First 10 minutes

1. **Stop the spread.**
   - **Don't promote** the affected candidate further. Promotion is manual, so simply don't run the next stage.
   - If a store rollout were live (real adapter): **halt the staged rollout** (Play: "Halt rollout"; App Store: "Pause phased release"). *Not applicable today: publishing is SIMULATED.*
2. **Identify the bad build:** version, build number and SHA-256 from the release's `release-manifest.json` / `release-record.json`.
3. **Decide what broke** (section 1), then follow the matching path.
4. Record what you do (time, who, run links) in the incident notes.

## 1. Decide: app, backend, or both?

| Symptom | Likely layer | Path |
|---|---|---|
| Crash or wrong behaviour in the new app version only; older versions fine | App | A |
| All app versions failing the same way (fetch/submit errors), Supabase errors | Backend | B |
| New app needs a backend change that broke old apps | Both | B first (restore compatibility), then A |
| CI red on `main`, nothing released | Source only | C |

## Path A: app rollback (= roll forward from known-good source)

A mobile binary can't really be "un-released": a lower build number can't be installed over a higher one.

1. **Find the last known-good release:** **Actions → Failure drill → scenario `recovery`**. It lists approved
   releases with their commits and confirms each binary and record is intact. Typically the previous release
   (e.g. `v1.1.2` if `v2.0.0` is bad).
2. **Restore the source on a branch**, preferably by reverting the bad change:
   ```
   git checkout main && git pull
   git checkout -b fix/rollback-<version>
   git revert <bad-commit>            # or, to restore whole areas from a known-good tag:
   git checkout v1.1.2 -- src         #   restore app code exactly as released in v1.1.2
   npm run version:set 2.0.1          # NEW version number, always higher
   ```
3. **Open a PR.** CI must be green, including **Version 1 compatibility**, then merge.
4. **New candidate:** `git tag v2.0.1-rc.1 && git push origin v2.0.1-rc.1` → `release.yml` assigns a **higher build number**.
5. **Promote through the gates**: SIT → QA → UAT → PRE-PROD → PROD. Urgency doesn't skip gates; it shortens wait times.
6. **Distribute** v2.0.1. Internal: share the APK from the release. Stores (future): publish through `publish.yml` and resume the rollout.
7. **Verify:** `npm run release:verify -- <downloaded folder>`; compare records with
   `node scripts/release/cli.js compare-records <old record> <new record>`.

Emergency option for **internal testers only**: they may uninstall and install the previous APK from its GitHub Release
(e.g. `v1.1.2`). This loses local app data, and it is not possible through stores.

## Path B: backend rollback (Supabase today)

1. **Check compatibility first:** the backend you roll back to must still serve **every app version in use**
   (OPERATIONS.md §5). Never drop a column or policy that a live app version uses.
2. **Configuration / policy change** (RLS, constraint): re-apply the known-good definitions from `supabase/schema.sql`
   at the last good tag (`git show v2.0.0:supabase/schema.sql`) in the Supabase SQL editor. The script is idempotent.
3. **Bad migration:** run its written down-migration. If data was damaged, restore with Supabase **point-in-time
   recovery / backups** (dashboard → Database → Backups) to just before the change. Note: this loses later writes.
4. **Verify live:** `npm run test:integration` locally (read, write, RLS, constraints), or run **Promote → SIT**
   checks against the current candidate.
5. After migrating to AWS (DESIGN ONLY): redeploy the previous Amplify backend build or revert the commit on the
   backend branch; DynamoDB point-in-time recovery for data.

## Path C: bad commit on `main`, nothing released (source recovery)

1. `git revert <bad-commit>` on a branch → PR → CI green → merge. Or restore files from the last good tag:
   `git checkout <tag> -- <paths>`.
2. Confirm `main` is green again (Actions → CI on `main`).
3. Nothing to roll back in releases: a failing commit can't produce a candidate (release checks run first).

## After recovery

- Write down cause, timeline, impact and fix; add a test that would have caught it.
- Confirm the CI monitoring report shows the pipeline green again.
- If a gate missed the problem, improve that gate.

Practised in [DRILLS.md](DRILLS.md): failing test and fix (Path C), invalid checksum rejection, approval
gate, and recovery from a known-good tag (Path A step 2).
