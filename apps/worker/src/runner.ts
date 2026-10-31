import { isDomainEventType, type DomainEvent, type DomainEventType } from '@equipdemo/contracts';

/** One claimed outbox row. `attempts` already counts the current attempt. */
export type OutboxRecord = { id: string; type: string; payload: unknown; attempts: number };

/** Storage port for the outbox. Postgres implementation: knexOutbox.ts. */
export interface OutboxSource {
  /** Leases up to `limit` due records so no other worker processes them concurrently. */
  claim(limit: number, leaseMs: number): Promise<OutboxRecord[]>;
  complete(id: string): Promise<void>;
  retry(id: string, error: string, availableAt: Date): Promise<void>;
  /** Gives up: the record is kept for inspection (dead letter) and never retried. */
  fail(id: string, error: string): Promise<void>;
}

export type Handlers = { [K in DomainEventType]: (event: Extract<DomainEvent, { type: K }>) => Promise<void> };

export type Logger = {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
};

export type RunOptions = {
  batchSize: number;
  leaseMs: number;
  maxAttempts: number;
  now?: () => Date;
  log: Logger;
};

export type RunStats = { claimed: number; completed: number; retried: number; failed: number };

const MAX_BACKOFF_MS = 5 * 60_000;

/** Exponential backoff: 2 s, 4 s, 8 s … capped at 5 minutes. */
export function backoffMs(attempt: number): number {
  return Math.min(2 ** attempt * 1000, MAX_BACKOFF_MS);
}

/** Error text stored on the row: short, single line, no stack traces. */
function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error';
  return text.replace(/\s+/g, ' ').slice(0, 300);
}

function parseEvent(record: OutboxRecord): DomainEvent | null {
  const payload = (typeof record.payload === 'string' ? JSON.parse(record.payload) : record.payload) as Partial<DomainEvent>;
  if (!payload || !isDomainEventType(payload.type) || payload.type !== record.type || payload.id !== record.id) {
    return null;
  }
  return payload as DomainEvent;
}

/** Processes one batch. Handlers must be idempotent: delivery is at-least-once. */
export async function runOnce(source: OutboxSource, handlers: Handlers, options: RunOptions): Promise<RunStats> {
  const now = options.now ?? (() => new Date());
  const stats: RunStats = { claimed: 0, completed: 0, retried: 0, failed: 0 };
  const records = await source.claim(options.batchSize, options.leaseMs);
  stats.claimed = records.length;

  for (const record of records) {
    let event: DomainEvent | null;
    try {
      event = parseEvent(record);
    } catch {
      event = null;
    }
    if (!event) {
      // A malformed or unknown event will never succeed: dead-letter it immediately.
      await source.fail(record.id, `Unsupported or malformed event (type "${record.type}")`);
      options.log.error('Outbox event rejected', { id: record.id, type: record.type });
      stats.failed++;
      continue;
    }

    try {
      await handlers[event.type](event);
      await source.complete(record.id);
      stats.completed++;
    } catch (error) {
      const reason = describeError(error);
      if (record.attempts >= options.maxAttempts) {
        await source.fail(record.id, reason);
        options.log.error('Outbox event failed permanently', { id: record.id, type: record.type, attempts: record.attempts });
        stats.failed++;
      } else {
        const delay = backoffMs(record.attempts);
        await source.retry(record.id, reason, new Date(now().getTime() + delay));
        options.log.warn('Outbox event will be retried', { id: record.id, type: record.type, attempts: record.attempts, delayMs: delay });
        stats.retried++;
      }
    }
  }
  return stats;
}
