# Version 2: a controlled update

**Version 1** = `v1.1.2`, build 1041, promoted through all six stages (commit `21ee51e`).
**Version 2** = `2.0.0`: Version 1 plus **search with a result count** on the home screen.

## 1. Comparison before any change

Compared `v1.1.2` with `main` at the start of this work (`cf266c8`):

| Area | Changed since Version 1? |
|---|---|
| App code (`App.tsx`, `src/`, `index.js`) | **No** |
| Native projects (`android/`, `ios/`), Babel, Metro | **No** |
| Dependencies (`package.json`, `package-lock.json`) | **No** |
| Tooling | Yes: publishing adapter (`scripts/publish`, `publish.yml`), added after Version 1 was released |

So Version 2's app changes contain only the new feature.

## 2. What changed in Version 2

### Functional differences

| | Version 1 | Version 2 |
|---|---|---|
| Home screen list | All fetched equipment, newest first | Same |
| **Search** | None | Search box above the list; filters **by name**, case-insensitive; every word must match, in any order; **Clear** button |
| **Result count** | None | "5 items" / "Showing 2 of 5" |
| No search matches | n/a | "No equipment matches “…”." |
| Empty table | "No equipment yet. Add the first one." | Same (no search box or count shown) |
| Loading, error, retry, refresh, pull-to-refresh | as built | Same; search stays applied after a refresh |
| Add equipment form, validation, success message | as built | Same |
| Supabase requests | `select id, name, price_per_hour … order id desc limit 50`; insert `{name, price_per_hour}` | **Same.** Search runs on the phone over the loaded list and makes no extra request |
| Database schema / RLS | `supabase/schema.sql` | Same; no migration needed |

Search covers the up-to-50 newest records the app already loads (the same limit as Version 1).

### Code differences (app)

| File | Change |
|---|---|
| `src/domain/equipment.ts` | Added `filterEquipment()` and `describeCount()` (pure functions) |
| `src/screens/HomeScreen.tsx` | Added search input, Clear button, count line, no-match message |
| Everything else in `src/`, `App.tsx` | Unchanged |

### Dependency differences

**None.** `package.json` and `package-lock.json` differ from Version 1 only in the `version` field
(`1.1.2` → `2.0.0`). No package was added, removed or upgraded. Check with:
`git diff v1.1.2 v2.0.0-rc.1 -- package.json package-lock.json`

### Version and build numbers (per docs/RELEASES.md)

| | Version 1 | Version 2 |
|---|---|---|
| App version (`package.json`, Android versionName, iOS MARKETING_VERSION) | 1.1.2 | **2.0.0** (set with `npm run version:set 2.0.0`) |
| Build number (Android versionCode, iOS CFBundleVersion) | 1041 | **assigned by `release.yml`**: `1000 + run×10 + attempt`, guaranteed higher than 1041 |

Strict semantic versioning would call this a minor update (1.2.0), because nothing breaks. **2.0.0** was
chosen deliberately to match the project's "Version 1 / Version 2" milestones (planned in BASELINE.md).
The tests below are what show compatibility; the version number doesn't.

## 3. Evidence of compatibility (tests, not claims)

| Claim | Evidence (CI job / file) |
|---|---|
| Version 1 still passes its original tests | CI job **Version 1 compatibility**, step 1: checks out `v1.1.2` and runs its own test suite unchanged |
| Version 2 is backward compatible with Version 1's behaviour | Same job, step 2: **Version 1's original test files** run against the Version 2 code |
| Fetch and submit still work exactly as before | `__tests__/regression.v1.test.tsx`: identical Supabase query and insert payload; full list with no search; submit saves the record and returns to Home; success message |
| The new feature works | `__tests__/search.test.tsx`: filtering rules, count text, no-match and Clear, search kept after refresh, empty state unchanged |
| Live Supabase read/write still works | Release gates **SIT** and **PRE-PROD** run the live integration tests at the Version 2 commit |

The **Version 1 compatibility** job is part of `ci.yml`, so it runs on every pull request, on `main`,
and inside every release build (`release.yml` calls `ci.yml`).

## 4. Same pipeline, no new workflows

Version 2 uses the existing workflows unchanged: `ci.yml` → `release.yml` (tag `v2.0.0-rc.1`) →
`promote.yml` (SIT → QA → UAT → PRE-PROD → PROD) → optionally `publish.yml` (mock).

## 5. Version 1 vs Version 2 release records

Generated with `node scripts/release/cli.js compare-records <v1 record> <v2 record>` once Version 2 reaches PROD.

RECORD_COMPARISON
