# Secrets management

## Where each secret lives

| Secret / config | Stored in | Used by | Ever in the app bundle? |
|---|---|---|---|
| Supabase publishable key | GitHub **environment** secrets on SIT, PRE-PROD, PROD | Stage checks (integration/readiness/smoke tests) | No. Release candidates are built without it (demo data). A local developer `.env` may inline it; it is public by design and protected by RLS |
| Supabase URL | GitHub environment **variables** | Same | Same as above |
| Supabase service-role key | **Nowhere** | — | Never |
| `DEMO_GITHUB_SECRET` (harmless) | GitHub repository secret | `secrets-demo.yml` baseline job | No |
| AWS access | **No keys stored.** GitHub OIDC token → short-lived role credentials (15 min) | `secrets-demo.yml` AWS job | No |
| AWS demo secret (harmless) | AWS Secrets Manager `equipdemo/ci-demo-secret` | `secrets-demo.yml` AWS job | No |
| Store credentials (future) | Environment secrets on PROD/QA, only passed when `REAL_PUBLISHING_ENABLED=true` | `publish.yml` | No |

**The bundle rule:** `babel.config.js` inlines only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
`__tests__/architecture.test.js` fails CI if that allow-list ever grows, so no server credential
(service-role key, AWS secret) can be compiled into the app.

## Safeguards

- **Never printed:** values are read into variables, never echoed. GitHub auto-masks its secrets; values
  fetched from AWS are registered with `::add-mask::` immediately and are not written to files,
  outputs, artifacts or the job environment. The AWS account ID is masked (`mask-aws-account-id: true`).
- **Forks:** `secrets-demo.yml`, `promote.yml` and `publish.yml` are manual (`workflow_dispatch`) only.
  `ci.yml` runs on `pull_request` but uses no secrets, and GitHub never gives secrets to workflows triggered
  by fork pull requests. No workflow uses `pull_request_target`.
- **Environments:** stage secrets are environment secrets, released only to jobs in that environment, after
  approval, from `main` (deployment branch rule).
- **AWS trust is narrow:** the role trusts only tokens with subject
  `repo:keerthanarameshdasari-hub/equipment-demo-app:environment:AWS-DEMO` and audience `sts.amazonaws.com`.
  It can call `secretsmanager:GetSecretValue` on one secret, nothing else. The workflow proves this by
  checking that `list-secrets` and `s3 list-buckets` are denied.
- **No long-lived AWS keys** exist in GitHub. There is nothing to rotate or leak.

## `secrets-demo.yml`

**Actions → Secrets demo (GitHub secrets + AWS OIDC) → Run workflow.**

| Job | Without setup | With setup |
|---|---|---|
| GitHub encrypted secret | Passes: "not configured", with instructions | Passes: "available (N characters), value never printed" |
| AWS Secrets Manager via OIDC | Passes: "skipped safely; nothing requested from AWS", listing missing prerequisites | Assumes role via OIDC → reads secret (masked) → verifies other actions are denied |

## Prerequisites

### Baseline (GitHub only)
1. Settings → Secrets and variables → Actions → **New repository secret** → `DEMO_GITHUB_SECRET`, any harmless text.

### AWS (only if an AWS account is available)

**Organization policy (checked first):** if the account belongs to an AWS Organization, its Service
Control Policies (SCPs) must not deny `iam:CreateOpenIDConnectProvider` (or the GitHub provider must
already exist), nor `sts:AssumeRoleWithWebIdentity` for the role. An SCP deny cannot be overridden from
inside the account, not even by an administrator.

**Account and IAM permissions needed by the person doing the setup:** an AWS account and permission to run
CloudFormation with IAM resources: `cloudformation:*` on the stack, `iam:CreateRole`, `iam:PutRolePolicy`,
`iam:CreateOpenIDConnectProvider` (unless the GitHub provider already exists), `iam:GetRole` and
`secretsmanager:CreateSecret`. The AWS-managed `AdministratorAccess` policy covers all of
these for a personal demo account. Cost: one Secrets Manager secret (about US$0.40/month) and negligible API calls.

**Steps:**
1. AWS Console → **CloudFormation** → **Create stack** → *Upload a template file* → `aws/secrets-demo-oidc.yaml`.
2. Stack name `equipdemo-secrets-demo`. Keep the defaults. Set **CreateOidcProvider = false** only if the
   account already has the `token.actions.githubusercontent.com` identity provider.
3. Tick *"I acknowledge that AWS CloudFormation might create IAM resources with custom names"* → **Submit**.
4. When `CREATE_COMPLETE`, open **Outputs**: `RoleArn`, `SecretName`, `Region`.
5. GitHub → Settings → **Environments** → **New environment** `AWS-DEMO` → *Deployment branches*:
   `main` only → add **environment variables** `AWS_ROLE_ARN`, `AWS_REGION`, `AWS_DEMO_SECRET_ID` with
   the three output values. These are identifiers, not secrets; no AWS keys are added anywhere.
6. Run the workflow.

## Result in this project (21 Oct 2026)

| Step | Outcome |
|---|---|
| Baseline GitHub encrypted secret | Works (see the workflow run) |
| CloudFormation stack, first run with `CreateOidcProvider=false` | Role and demo secret created, but no GitHub identity provider exists in the account |
| Workflow AWS job | Failed safely: `AssumeRoleWithWebIdentity` refused ("web identity token could not be validated") because the role trusts a provider that doesn't exist. No credentials were issued, no secret was read, nothing was printed |
| Stack update to `CreateOidcProvider=true` | **Blocked**: `iam:CreateOpenIDConnectProvider` has an *explicit deny in a service control policy* of the AWS Organization the account belongs to. CloudFormation rolled back cleanly |

**Conclusion:** OIDC federation can't be completed in this account until an organization administrator
either (a) creates the `token.actions.githubusercontent.com` provider (audience `sts.amazonaws.com`) in
this account, or (b) excludes this account from that SCP statement. Alternatively, use an AWS account that
is not under this SCP. Long-lived access keys were deliberately **not** used as a workaround.

**To finish once the provider exists:** update the stack with `CreateOidcProvider=false` (the provider now
exists), keep the `AWS-DEMO` variables, and re-run the workflow.

**Clean-up:** delete the CloudFormation stack (removes role, secret and provider if created by it).
Secrets Manager keeps a deleted secret recoverable for 7–30 days.
