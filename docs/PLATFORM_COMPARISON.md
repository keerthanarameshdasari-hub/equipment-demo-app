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

RESULTS_PLACEHOLDER

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
- The AWS account belongs to an AWS Organization whose policies already blocked OIDC providers (docs/SECRETS.md).
  CodeBuild or IAM role creation could also be restricted; that would be recorded here.

## 6. Decision matrix

DECISION_PLACEHOLDER
