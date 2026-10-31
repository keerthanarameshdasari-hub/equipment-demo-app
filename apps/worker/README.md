# worker

Delivers events from the `outbox_events` table written by the api (handbook: transactional outbox).

- Claims due rows with a lease (`FOR UPDATE SKIP LOCKED` + `locked_until`), so several workers can run
  and handlers run outside database locks.
- At-least-once delivery: handlers must be idempotent (use `event.id` as the idempotency key).
- Failures retry with exponential backoff (2 s, 4 s, ... max 5 min); after `MAX_ATTEMPTS` the row is
  dead-lettered (`failed_at`, `last_error`). Malformed or unknown events are dead-lettered immediately.
- Stops after the current batch on SIGTERM/SIGINT.

The api owns the table (its migrations). Run them before the worker's integration tests:
`npm run migrate -w @equipdemo/api && npm run test:integration -w @equipdemo/worker`.
