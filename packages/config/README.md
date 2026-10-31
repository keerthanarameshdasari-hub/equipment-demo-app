# @equipdemo/config

Validated environment configuration: `loadConfig(spec, env)` checks every variable at start-up and
throws one `ConfigError` listing all problems (names only, never values). `secret: true` fields are
redacted by `describeConfig()`; `loadPublicConfig()` (frontends) rejects specs that contain secrets.
Field types: `str`, `int`, `port`, `bool`, `url`, `list`, `optional(...)`. Dependency-free.
