import { describeConfig, loadConfig } from '@equipdemo/config';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { apiConfigSpec } from './config';
import { createDb } from './db';
import { createKnexStore } from './knexStore';

// Validate every variable before opening any connection.
const config = loadConfig(apiConfigSpec, process.env);
const db = createDb(config.DATABASE_URL);
let app: FastifyInstance | undefined;
let closing = false;

async function close(): Promise<void> {
  if (closing) {
    return;
  }
  closing = true;
  // Drain budget; align with the orchestrator's termination grace period.
  const timer = setTimeout(() => process.exit(1), 10_000);
  timer.unref();
  try {
    if (app) {
      await app.close();
    }
    await db.destroy();
  } finally {
    clearTimeout(timer);
  }
}

try {
  app = await buildApp({
    store: createKnexStore(db),
    rateLimitMax: config.RATE_LIMIT_MAX,
    corsOrigins: config.CORS_ORIGINS,
    logger: { level: config.LOG_LEVEL },
  });
  app.log.info({ config: describeConfig(apiConfigSpec, config) }, 'Starting api');
  await app.listen({ host: config.HOST, port: config.PORT });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      close().catch(() => {
        process.exitCode = 1;
      });
    });
  }
} catch (err) {
  console.error('Startup failed:', err instanceof Error ? err.message : 'unknown error');
  process.exitCode = 1;
  await close();
}
