# CI/CD platform comparison: GitHub Actions vs AWS CodeBuild

**Baseline:** GitHub Actions (everything in this repository).
**Second platform:** AWS CodeBuild. It was chosen because an AWS account already exists (no new account),
it is AWS's native build service (relevant to the planned Amplify migration), and it can run the same
steps from a public repository without a GitHub connection. CodePipeline, which would add multi-stage
orchestration and manual approvals, was **not built**: it needs an extra GitHub connection handshake, more
setup and cost, and the time is limited. Its capabilities are compared from documentation and labelled as such.

## 1. The representative workflow, on both platforms

| Step | GitHub Actions | AWS CodeBuild (`aws/codebuild-comparison.yaml`) |
|---|---|---|
| Source revision | Commit of the run (`actions/checkout`) | Exact commit via `SOURCE_COMMIT` (public `git fetch`, no credentials) |
| Dependency installation | `npm ci` (npm cache) | `npm ci` (no cache) |
| Secret-file guard, version check | ✅ | ✅ (same commands) |
| Lint, TypeScript | `npm run lint`, `npm run typecheck` | same |
| Automated tests | `npm test` (Jest, mock data source) | same tests, same inputs |
| Android build | `assembleRelease`, arm64 + x86_64 | same Gradle command and ABIs |
| Android SDK/NDK | Preinstalled on runner image; NDK installed with retries | **Not in the image**: cmdline-tools, platform 36, build-tools 36, NDK installed every build |
| Artifact + manifest | `release-manifest.json`, `SHA256SUMS.txt`, `release-record.json` (same script) | same script; `CI_PLATFORM=AWS CodeBuild` recorded in the manifest |
| Checksum verification | `cli.js verify` + digest-checked re-download | `cli.js verify` + `sha256sum -c` |
| Mock publishing gate | `publish.yml`: **human approval** in the PROD environment, then mock adapter | Mock adapter refuses production (no PROD stage, no approval). **No human approval step exists in CodeBuild alone** |
| Build numbers | Release: 1000 + run × 10 + attempt | 5000 + CodeBuild build number (comparison builds, never promoted) |

The application code, tests and acceptance criteria are identical. Only the platform glue differs.

## 2. Comparability: known differences

| Factor | GitHub Actions | AWS CodeBuild | Effect |
|---|---|---|---|
| Machine | `ubuntu-24.04` hosted runner (public repo: 4 vCPU, 16 GB) | `standard:8.0` (Ubuntu 24.04), `BUILD_GENERAL1_MEDIUM` (4 vCPU, 7 GB) | Same OS and CPU count; **less memory** on CodeBuild |
| JDK | Temurin 17 | Amazon Corretto 17 | Same Java version, different vendor |
| Caches | npm and Gradle caches warm after the first run | **No cache configured** (every build cold) | GitHub timings benefit from caches; not a like-for-like speed test |
| Android SDK | Preinstalled | Downloaded every build | Adds minutes to every CodeBuild run |
| Concurrency | Separate jobs (checks ∥ then Android) | One build, phases in sequence | Different structure |
| Region / location | GitHub-hosted (US) | `ap-southeast-2` (Sydney) | Network distance to npm, Google Maven, GitHub |
| Samples | Many runs over 10 days | A handful of runs | Too few for statistical claims |

**Consequence:** runtimes below describe *these* runs, not which platform is "faster". No speed or safety
claim is made without evidence.

## 3. Results

Measured on 21 Oct 2026. All app source came from the same commit; only the platform configuration differed.

### 3.1 Runs

| # | Platform | Source commit | Expected | Result | Evidence |
|---|---|---|---|---|---|
| G1 | GitHub Actions: Release candidate (rehearsal) | `63b549e` | pass | ✅ success, build 1081, artifact `rehearsal-equipdemo-v2.0.0-rc.1-build1081` (17.4 MB, digest `sha256:d7a55b70…`) | run 39596119673 |
| G2 | GitHub Actions: CI | `63b549e` | pass | ✅ success (checks, Version 1 compatibility, debug APK) | run 39595721296 |
| G3 | GitHub Actions: CI (failure drill) | `44ff925` | fail at tests | ✅ failed at `drill.test.ts`; Android jobs skipped | run 39587402651 |
| C1 | CodeBuild build 1 | `63b549e` | pass | ❌ **failed after the APK was built**: exit status 141 (pipeline configuration bug, see §3.4) | `equipdemo-comparison:6ada9a94-…` |
| C2 | CodeBuild build 2 (failure drill) | `44ff925` | fail at tests | ✅ failed at `drill.test.ts`: `TEST RESULTS: 115 passed, 1 failed, 116 total`; no Android build | `equipdemo-comparison:f716e14e-…` |
| C3 | CodeBuild build 3 (after fix #19) | `63b549e` | pass | ✅ success, build 5003, 6 files uploaded to S3 | `equipdemo-comparison:cc48287f-…` |

The tests and lint rules were the same on both platforms, and so were the outcomes:

- **Commit `63b549e`:** 119 of 119 tests passed on both platforms.
- **Commit `44ff925`:** both platforms failed on the same assertion: `Expected "6 items", Received "5 items"`.

### 3.2 Representative workflow, step by step (successful runs G1 and C3)

| Step | GitHub Actions (G1) | AWS CodeBuild (C3) |
|---|---|---|
| Queue / provisioning | Run created 11:59:52; first job started 12:04:50 (**~5 min waiting**, behind the CI run on the same commit) | ~53 s from container start to INSTALL (image, Node 22 and Corretto 17 runtime selection) |
| Android SDK / NDK | NDK install 41 s (SDK preinstalled) | Full SDK + NDK download **28 s** |
| `npm ci` | 10 s (npm cache) | 7 s (no cache) |
| Lint + typecheck + tests | checks job 47 s in total; tests 12 s | 20 s for version check, `npm ci`, lint, typecheck and tests |
| Version 1 compatibility | 47 s (separate job) | **not run** (not in the CodeBuild pipeline) |
| Gradle `assembleRelease` | **5 min 00 s** (Gradle cache configured) | **7 min 44 s** (no cache; 202 of 202 tasks executed) |
| Manifest, checksum, verify | 1 s | included in 466 s for "android+artifact+gate" |
| Mock publishing gate | not part of the release workflow (it lives in `publish.yml`, with human approval) | ✅ production refused: "requires the candidate to have passed PROD; it has reached DEV", "requires a PROD stage entry approved by a reviewer", "requires explicit approval of this publish run" |
| **Working time** | 8 min 04 s (first job start → end) | **~9 min 29 s** (12:49:13 → 12:58:42) |
| **Wall time incl. queue** | 13 min 02 s | ~9.5 min (CodeBuild queue time not measured separately) |

**Failure path:**

| | Time to fail |
|---|---|
| GitHub (G3) | 42 s run time (checks job 38 s) |
| CodeBuild (C2) | 49 s (SDK install 21 s + checks 20 s) |

Both platforms stopped **before** the Android build. No artifact was produced from the failing commit.

### 3.3 Artifacts and verification

| | GitHub Actions (G1) | AWS CodeBuild (C3) |
|---|---|---|
| APK identity (`aapt2`) | `com.equipmentdemo.app`, 2.0.0, versionCode 1081 | `com.equipmentdemo.app`, 2.0.0, versionCode 5003 |
| Files | APK, `release-manifest.json`, `SHA256SUMS.txt`, `release-record.json` (one zip artifact) | the same 4 files, plus `publish-metadata.json` and `publish-gate-log.json`: 6 files in S3, unzipped, under the build ID |
| Checksum | `cli.js verify`; the artifact digest is checked on download | `cli.js verify` and `sha256sum -c` (`OK`). APK SHA-256 `a3a87f68…e809e` |
| Manifest provenance | `runUrl` = GitHub run URL | `workflow` = `AWS CodeBuild: equipdemo-comparison`, `runUrl` = `codebuild:equipdemo-comparison:cc48287f-…` |
| Retention | 90 days for the artifact; permanent once recorded as a GitHub (pre-)release | 30-day S3 lifecycle rule (set in our template; adjustable) |

The two APKs have **different SHA-256 values**, as expected:

- **versionCode:** 1081 on GitHub and 5003 on CodeBuild.
- **JDK vendor:** Temurin on GitHub and Corretto on CodeBuild.
- **Signing:** each build is signed with its own debug key.

Each platform's binary is internally consistent: the manifest, the checksum file and the APK agree.

### 3.4 Failed runs and what they revealed

- **C1: exit status 141, a configuration bug that GitHub's runs had hidden.**
  - The command `aapt2 dump badging | head -1` runs under `set -o pipefail`. When `head` closes the pipe early, `aapt2` receives SIGPIPE, and pipefail turns that into a failure.
  - The same line was in `ci.yml`, `release.yml` and `promote.yml`. It had passed on GitHub runners by timing luck.
  - It was fixed everywhere in PR #19 (write the output to a file first). C3 then passed.
  - This is evidence of a **latent flake in our own scripts**, not of either platform being less reliable.
- **C2 and G3:** both are deliberate test failures, and both were caught at the same point.

### 3.5 Setup effort and manual steps

| | GitHub Actions | AWS CodeBuild |
|---|---|---|
| What was created | Nothing extra: the workflows are files in the repository | CloudFormation stack: S3 bucket, log group, IAM role, CodeBuild project |
| Manual steps for the first run | Push the workflow file; click **Run workflow** (or push a tag) | Download the template → CloudFormation **Create stack** → upload → acknowledge IAM → wait → CodeBuild **Start build with overrides** → set `SOURCE_COMMIT` |
| Manual steps for a template change | Merge the PR | Merge the PR, **then** CloudFormation **Update stack** with the new file (the buildspec is inline in the stack and is not read from the repository) |
| Triggering a build for a commit | Automatic on push or PR | Manual override per build (no webhook configured) |
| Reading results | Annotations, job summary, downloadable logs | Console log viewer; values found with Ctrl+F; S3 browser for artifacts |
| Operator setup time | n/a (incremental over 10 days) | Not timed precisely by the operator; the stack was created and three builds were run within one afternoon |

The account's AWS Organizations policy (SCP), which had blocked OIDC providers in Prompt 8, **did not block** the CodeBuild project, IAM service role or S3 bucket.

### 3.6 Cost (these runs)

| | GitHub Actions | AWS CodeBuild |
|---|---|---|
| Charged minutes | 0 (public repository: standard hosted runners are free) | 3 builds ≈ 9.7 + 0.8 + 9.5 ≈ **20 build-minutes** on `general1.medium`, rounded up per minute |
| Rate | none | Billed per build minute by compute type. The pricing page's example uses $0.005/min for `general1.small`; the `general1.medium` and Sydney rates are not on that page (check the AWS Pricing Calculator) |
| Free tier | n/a | 100 min/month, `general1.small` only. Not used, because medium was chosen for the Android build |
| Storage | Included | S3 (≈17 MB per build, expires after 30 days) and CloudWatch Logs (30 days): negligible |

Exact charges should be read from **AWS Billing → Bills** after the month closes. No amount is claimed here.

## 4. Capability comparison

| Dimension | GitHub Actions (evidence) | AWS CodeBuild (evidence / documentation) |
|---|---|---|
| **Setup effort** | Workflows are YAML files in the repo; nothing to provision | CloudFormation stack (project, IAM role, S3 bucket, log group), plus Android SDK installation in the buildspec |
| **Manual setup steps** | See §3 | See §3 |
| **Artifact handling** | Actions artifacts (30–90 days, per-run zip) + GitHub Releases (permanent); digest checked on download | S3 bucket you own (encryption, lifecycle, any retention, versioning possible); you manage access and cost |
| **Secrets / identity** | Repository and environment secrets; OIDC to clouds; per-environment scoping | IAM service role (no stored keys for AWS); Secrets Manager / Parameter Store for others. Native for AWS resources |
| **Approvals** | Environments with required reviewers (implemented; public repo on Free plan) | **None in CodeBuild alone.** CodePipeline has a Manual approval action (documented, not built) |
| **Audit** | Run history, approvals API (who approved, comment), release records | CloudTrail records API calls (who started a build, with which overrides); build history; CloudWatch logs (30-day retention here) |
| **Triggers** | PR, push, tag, manual, schedule | Manual / API here; webhooks need a GitHub connection; CodePipeline/EventBridge for orchestration |
| **Maintenance** | Pinned action SHAs + Dependabot; runner images updated by GitHub | Image versions, IAM policies, bucket lifecycle, SDK install script; image updates by AWS |
| **Required accounts** | GitHub only | GitHub (source) + AWS account with IAM/CloudFormation rights; may be restricted by AWS Organizations policies (§5) |
| **Cost** | Public repository: hosted runners free (private repos: included minutes, then per-minute) | Pay per build minute by compute type; free tier is 100 min/month on **small** only (too small here); plus S3 and CloudWatch storage (cents) |

## 5. Limitations

- One CodeBuild configuration, few runs, cold caches. Not a performance benchmark.
- CodePipeline (approvals, multi-stage promotion) not implemented; compared from documentation only.
- The AWS account belongs to an AWS Organization whose policies blocked OIDC providers (docs/SECRETS.md).
  The CodeBuild stack (IAM service role, S3, logs, project) **was allowed**.
- CodeBuild did not run the Version 1 compatibility job, so its working time covers slightly less work than GitHub's.
- The GitHub job logs could not be downloaded from the automation session, so whether the Gradle cache was restored in G1
  was not confirmed. Timings come from the Actions API.
- CodeBuild queue time before the container started was not recorded.
- The CodeBuild durations come from the operator's console screenshots and log export. The GitHub durations come
  from the Actions API.

## 6. Decision matrix

The scores apply **to this project only**: a public repository, one developer, mobile releases with human approvals, and Supabase as the backend today.

| Criterion | GitHub Actions | AWS CodeBuild (alone) | Evidence | Confidence |
|---|---|---|---|---|
| Reproduces the representative workflow | ✅ | ✅ (after fix #19) | G1, C3; same tests and the same gate result | High |
| Catches a failing commit before building | ✅ | ✅ | G3, C2 | High |
| Setup effort | **Lower**: files in the repository | Higher: stack, IAM role, bucket, SDK install script | §3.5 | High |
| Manual steps per build or change | **Fewer**: automatic triggers | More: manual start with overrides; stack update for each buildspec change | §3.5 | High |
| Runtime, these runs | 8 min working / 13 min wall (queued) | 9.5 min working | §3.2 | **Low**: different memory, caches, JDK vendor, region and job structure; 1 successful sample each |
| Artifact handling | Zip artifact plus GitHub Releases as permanent records | **Own S3 bucket**: encryption, lifecycle, any retention, IAM access control | §3.3 | Medium |
| Approvals | **Implemented**: Environments with required reviewers | None (needs CodePipeline; documented only) | §4 | High (GitHub) / documentation (AWS) |
| Audit | Run history and approvals API | Build history, CloudTrail, CloudWatch | §4 | Medium (CloudTrail not inspected) |
| Secrets and identity | Environment secrets; OIDC blocked by the SCP in this account | IAM service role; no stored keys needed for AWS | Prompt 8, §4 | Medium |
| Maintenance | Pinned SHAs and Dependabot | Template and image versions, IAM, SDK script | §4 | Medium |
| Cost, this project | Free (public repository) | Per minute (~20 min used); free tier too small for this build | §3.6 | High (structure) / exact amount pending bill |
| Accounts needed | GitHub | GitHub and AWS | | High |

**Decision: keep GitHub Actions as the primary CI/CD platform.** It already provides the approval gates, stage environments and release records that the mobile pipeline depends on. It had fewer manual steps, and it costs nothing for this public repository.

**Use AWS CodeBuild where AWS-native access matters.** The likely case is the future Amplify backend, where build and deploy steps need IAM roles rather than stored keys. The approach to evaluate is calling CodeBuild from GitHub Actions (or running CodeBuild-hosted GitHub runners); this was not tested here.

**What this comparison does not show.** It does not show that either platform is faster or safer:

- The runtime difference is within what cache state, memory (16 GB vs 7 GB), JDK vendor and region could explain.
- There was one successful sample per platform.

**To strengthen the comparison:**

- Add a CodeBuild cache (S3 or local) for `~/.gradle` and `~/.npm`.
- Run 5 or more builds per platform on the same commit, and compare medians.
- Prototype CodePipeline's manual approval action.
- Read the actual CodeBuild charge from AWS Billing.

**Cleanup:** to stop all AWS charges and storage for the comparison, delete the CloudFormation stack. Empty the S3 bucket first, because CloudFormation can't delete a bucket that still holds objects.
