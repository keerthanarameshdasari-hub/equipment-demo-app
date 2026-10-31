import knex from 'knex';
import { describeConfig, loadConfig } from '@equipdemo/config';
import { workerConfigSpec } from './config';
import { createHandlers } from './handlers';
import { createKnexOutbox } from './knexOutbox';
import { runOnce, type Logger } from './runner';

const log: Logger = {
  info: (msg, data) => console.log(JSON.stringify({ level: 'info', msg, ...data })),
  warn: (msg, data) => console.warn(JSON.stringify({ level: 'warn', msg, ...data })),
  error: (msg, data) => console.error(JSON.stringify({ level: 'error', msg, ...data })),
};

const config = loadConfig(workerConfigSpec, process.env);
const db = knex({ client: 'pg', connection: config.DATABASE_URL, pool: { min: 0, max: 2 } });
const source = createKnexOutbox(db);
const handlers = createHandlers(log);

let stopping = false;
let wake: (() => void) | undefined;
const sleep = (ms: number) =>
  new Promise<void>(resolve => {
    const timer = setTimeout(resolve, ms);
    wake = () => {
      clearTimeout(timer);
      resolve();
    };
  });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    log.info('Stopping after the current batch', { signal });
    stopping = true;
    wake?.();
  });
}

log.info('Starting worker', { config: describeConfig(workerConfigSpec, config) });
try {
  while (!stopping) {
    try {
      const stats = await runOnce(source, handlers, {
        batchSize: config.BATCH_SIZE,
        leaseMs: config.LEASE_MS,
        maxAttempts: config.MAX_ATTEMPTS,
        log,
      });
      if (stats.claimed > 0) {
        log.info('Batch processed', stats);
      }
      // Keep draining while there is work; otherwise wait for the next poll.
      if (stats.claimed < config.BATCH_SIZE) {
        await sleep(config.POLL_INTERVAL_MS);
      }
    } catch (error) {
      // Database unavailable etc.: log without connection details and back off.
      log.error('Poll failed', { error: error instanceof Error ? error.name : 'unknown' });
      await sleep(Math.min(config.POLL_INTERVAL_MS * 5, 30_000));
    }
  }
} finally {
  await db.destroy();
  log.info('Worker stopped');
}
