# infra

| Path | What |
|---|---|
| `docker/api.Dockerfile`, `docker/worker.Dockerfile` | Multi-stage images built from the repo root; production deps only, non-root `node` user, no secrets baked in |
| `compose.yaml` | Local stack: PostgreSQL 17, one-shot migrations, api, worker (ports on 127.0.0.1 only) |
| `aws/` | CloudFormation: CodeBuild comparison pipeline, GitHub OIDC secrets demo (see docs/SECRETS.md) |
| `test/` | Policy tests: loopback ports, no literal credentials, non-root images, OIDC trust scope, no IAM access keys |

```bash
cp .env.example .env                       # set POSTGRES_PASSWORD (local only, git-ignored)
docker compose -f compose.yaml up --build
```

Production: pin base images by digest (`--build-arg NODE_IMAGE=node:22-bookworm-slim@sha256:...`).
