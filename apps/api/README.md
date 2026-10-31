# api

Fastify 5 HTTP API on PostgreSQL (Knex 3, pg 8), following the Backend API Team Handbook:
`buildApp()` is separate from `server.ts` (tests use `inject()`), strict JSON Schema validation
(no coercion, extra fields rejected), one error envelope, rate limiting, 16 KB body limit,
loopback binding by default, header redaction in logs, graceful shutdown, and migrations run as a
separate step.

| Route | Result |
|---|---|
| `GET /health/live` | `{ ok: true }` |
| `GET /health/ready` | 200 when the database responds, 503 otherwise |
| `GET /v1/equipment` | `{ items: Equipment[] }`, newest first, at most 50 |
| `POST /v1/equipment` | 201 with the stored record; writes an `equipment.created` outbox event in the same transaction |

Shapes, rules and paths come from `@equipdemo/contracts`. Errors: `{ error: { code, message }, requestId }`.

```bash
export DATABASE_URL=postgres://...      # see .env.example; never commit real values
npm run migrate -w @equipdemo/api       # controlled migration step
npm run dev -w @equipdemo/api           # or: npm run build && npm start
npm run test -w @equipdemo/api          # unit (in-memory store)
npm run test:integration -w @equipdemo/api   # real PostgreSQL; database name must end in _test
```

Not included yet (handbook ch. 8-12): authentication (OIDC), RBAC/tenant scoping, cursor pagination,
shared rate-limit store (Redis) for multiple instances.
