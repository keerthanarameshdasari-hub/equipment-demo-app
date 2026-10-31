# @equipdemo/contracts

The shared HTTP contract: `Equipment`/`NewEquipment` types, JSON Schemas (used by the api for
validation and response serialisation), route paths, the error envelope, outbox event types and a
typed `fetch` client for frontends. Platform-neutral and dependency-free.

Change rules: additive changes are safe; renaming/removing a field or route is a breaking change that
needs a new versioned route (`/v2/...`). CI re-tests every consumer when this package changes.
