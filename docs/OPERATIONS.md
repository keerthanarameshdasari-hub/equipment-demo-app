# Operations: monitoring, rollback and operational design

Every section is labelled:

- **IMPLEMENTED**: exists in this repository and has been run (evidence linked).
- **DESIGN ONLY**: how it would work; **not built or tested**.

While Supabase is the active backend, **nothing about AWS load balancing, autoscaling or production
monitoring has been tested**, and this document does not claim otherwise.

## 1. Three kinds of monitoring

| | CI/CD monitoring | Application monitoring | Backend monitoring |
|---|---|---|---|
| Question it answers | Is the *delivery pipeline* healthy? | Is the *app on users' phones* healthy? | Is the *server side* healthy? |
| Signals | Job results, failing steps, durations, artifacts, releases | Crashes, JS errors, ANRs, slow screens, failed requests (as seen by the app) | Request rate, errors, latency, database load, auth failures |
| Where it comes from | GitHub Actions API | SDK inside the app | Supabase dashboard today; CloudWatch after migration |
| Status here | **IMPLEMENTED** (`ci-report.yml`) | **DESIGN ONLY** (section 3) | Supabase built-in reports only; AWS **DESIGN ONLY** (section 7) |

A green CI report says nothing about whether users' apps are crashing or whether Supabase is up.
Those need separate signals.

## 2. CI/CD monitoring (IMPLEMENTED)

`.github/workflows/ci-report.yml` runs every Monday and on demand (**Actions → CI monitoring report**). It collects:

- every workflow run of the last 30 days: outcome, duration (median and p90 per workflow), success rate
- for each failed run: the **failing job and step**, commit and branch, with a link
- failures grouped by step (where the pipeline breaks most often)
- stored artifacts (count, size, APK names, expiry) and releases

The report appears on the run page and is kept as an artifact for 90 days (`scripts/ops/ci-report.js`,
tests in `__tests__/ops.test.js`). It contains no personal data: actor names are not collected.
A snapshot is in `docs/evidence/ci-report-2026-10-21.md`.

Built-in signals it complements: failed-run e-mail notifications from GitHub; step annotations
(`run-annotated.sh` puts the cause, e.g. Gradle's "What went wrong", on the run page); test reports
(14 days) and release manifests (90 days, plus permanent copies on GitHub Releases).

## 3. Application crash capture (DESIGN ONLY)

Today the app has **no crash reporting**. The app catches backend errors as `DataError` and shows
plain-language messages (never backend details), and it does not log submitted records.

In a real deployment:

| Item | Design |
|---|---|
| Tool | A crash SDK with React Native support (e.g. Sentry, Firebase Crashlytics, or AWS-native after migration). It captures native crashes, JS exceptions (global handler + React error boundary) and ANRs |
| Tie to the release | Tag every event with **app version + build number** (from `release-manifest.json`), so a crash maps to an exact binary and commit |
| Readable stack traces | `release.yml` uploads the Hermes/JS source maps and Android mapping files for that build number to the crash service. Symbols, not code, leave CI |
| Stage | Environment tag = release stage (`QA`, `UAT`, `PROD`), so test crashes don't mix with production |
| Alerting | Alert on a new crash type in PROD, or crash-free sessions below a threshold (e.g. 99.5%) after a release, which triggers the rollback runbook |
| Opt-in | Users can turn crash reporting off; the default follows the privacy policy |

### No personal data in crash reports and logs

| Rule | How |
|---|---|
| No user identifiers | No names, e-mails, phone numbers or device advertising IDs. If a user ID is ever needed, send a random installation ID |
| No user-entered content | Equipment names and prices typed by users are **not** attached to events (free text can contain personal data). Breadcrumbs record *actions* ("tapped Save"), never *values* |
| No secrets | No keys, tokens or full URLs with query strings; scrub `Authorization` headers and `apikey` parameters in a `beforeSend` hook |
| Minimal network detail | Record status code and endpoint *path* only, not request or response bodies |
| No IP storage | Disable IP address collection in the crash service |
| Retention | 30–90 days, then deleted |
| Same rules for logs | CI logs already follow this: secrets are masked, records are never logged, the CI report excludes actor names |

## 4. App rollback vs backend rollback

| | App (mobile binary) | Backend (Supabase / AWS) |
|---|---|---|
| What is rolled back | The APK/IPA people install | Server code, configuration, database schema, data |
| Can you "go back"? | **No real downgrade**: Android refuses a lower versionCode over a higher one (users would have to uninstall and lose local data), and stores don't allow re-publishing an old build | **Yes**, within limits: redeploy a previous version, revert configuration, run a down-migration, or restore a backup |
| How fast | Slow: users must update; staged rollouts can be halted, but installed copies stay | Fast: minutes, and affects everyone at once |
| Usual approach | **Roll forward**: rebuild the known-good *source* as a **new** version with a higher build number and send it through the gates. Meanwhile halt the staged rollout and use a server-side kill switch if available | **Roll back** the server first if it caused the problem, but only if the previous server version still serves every app version in the field |
| Constraint | Old app versions stay in use for weeks | The backend must stay **backward compatible with every supported app version** (at least N-1) |

The full procedure is in [RUNBOOK-ROLLBACK.md](RUNBOOK-ROLLBACK.md).

## 5. Backward-compatible API changes (design rules)

Old apps keep calling the backend long after a new release, so the API must accept both:

1. **Add, don't change.** New columns, fields and endpoints are additive and optional; old clients ignore them.
2. **Never rename or remove** a field in one step: add the new one, populate both, migrate clients, then remove the old one in a later release once no supported app uses it.
3. **Don't tighten validation** for existing clients without a transition (e.g. a stricter `price_per_hour` limit would make old apps' submissions fail with "rejected").
4. **Defaults for new required data** on the server, so old clients that don't send it still work.
5. **Contract tests** for every supported app version: CI already runs Version 1's tests against current code (`v1-compat`), and the repository contract suite pins the request shape.
6. **Version the API** only for breaking changes (e.g. `/v2/...`), with the old version kept until its apps are retired.

Example from this project: Version 2's search added no API change at all; it is client-side. That is
why Version 1 and Version 2 apps can share the same Supabase table safely (regression tests prove the
request shape is identical).

## 6. Safe database migrations (expand → migrate → contract)

| Phase | Do | Never in the same release |
|---|---|---|
| **Expand** | Add new nullable columns/tables; add new RLS policies alongside old ones; constraints as `NOT VALID` first (as `supabase/schema.sql` already does) | Drop or rename anything |
| **Migrate** | Backfill data in small batches; dual-write if needed; `VALIDATE CONSTRAINT` once data is clean | Lock big tables for long |
| **Contract** | After all supported apps use the new shape: drop old columns or policies | — |

Plus: every migration is a script in the repository, idempotent (`schema.sql` can be run repeatedly),
tested first in SIT/PRE-PROD (which should be separate Supabase projects in a real setup), preceded by
a backup / point-in-time-recovery check, and has a written **down** path or a restore plan.
Destructive steps (`DROP`) are separate, approved changes.

## 7. After migrating to AWS: testing load balancing and autoscaling (DESIGN ONLY, NOT TESTED)

> Supabase is the active backend. None of the following exists or has been run. It is a test plan for
> after the migration described in [AWS_MIGRATION.md](AWS_MIGRATION.md).

With Amplify Data (AppSync + DynamoDB), AWS manages scaling, and there is no load balancer to operate.
Load balancing and autoscaling become relevant if custom services are added (e.g. an API on ECS/Fargate
or EC2 behind an Application Load Balancer). The plan:

| Test | How | Pass criteria |
|---|---|---|
| Baseline | Load test (k6 or Artillery) from CI against **PRE-PROD only**, never PROD, with synthetic data | p95 latency and error rate recorded |
| Load balancing | Run ≥ 2 tasks/instances in ≥ 2 Availability Zones; check ALB target health; send load and confirm requests spread across targets (ALB `RequestCountPerTarget`) | No target > ~60% of traffic; no 5xx |
| Failover | Stop one task/instance (or one AZ's targets) during the load test | ALB marks it unhealthy within the health-check window; error rate stays under the SLO; capacity is replaced |
| Scale-out | Step load up to 3–5× baseline; target-tracking policy on CPU or `RequestCountPerTarget` | New capacity in service within the expected time; p95 latency recovers |
| Scale-in | Drop load | Capacity returns to the minimum after cooldown, with no failed requests (connection draining) |
| Limits | Check DynamoDB/AppSync throttling metrics and account quotas at peak | No throttling at the target load |
| Observability | CloudWatch dashboards and alarms (5xx rate, p95 latency, unhealthy hosts, throttles) and X-Ray traces | Alarms fire in the failover test |

CI access for these tests would use the OIDC role pattern from [SECRETS.md](SECRETS.md). It is currently
blocked in this AWS account by an organization policy.

## 8. Evidence

Failure, recovery and drill results: [DRILLS.md](DRILLS.md). Rollback procedure: [RUNBOOK-ROLLBACK.md](RUNBOOK-ROLLBACK.md).
