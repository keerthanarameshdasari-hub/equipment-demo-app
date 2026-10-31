import type { Knex } from 'knex';
import { OUTBOX_TABLE } from '@equipdemo/contracts';
import type { OutboxRecord, OutboxSource } from './runner';

/**
 * Postgres outbox. The table is created by the api's migrations; this module
 * depends only on the column contract, not on api code.
 *
 * Claiming uses a lease (locked_until) set under FOR UPDATE SKIP LOCKED, so several
 * workers can run safely and handlers run outside any database lock.
 */
export function createKnexOutbox(db: Knex): OutboxSource {
  const t = OUTBOX_TABLE;
  return {
    async claim(limit, leaseMs) {
      const result = await db.raw<{ rows: OutboxRecord[] }>(
        `UPDATE ${t}
            SET locked_until = now() + (? * interval '1 millisecond'),
                attempts = attempts + 1
          WHERE id IN (
            SELECT id FROM ${t}
             WHERE processed_at IS NULL AND failed_at IS NULL
               AND available_at <= now()
               AND (locked_until IS NULL OR locked_until < now())
             ORDER BY available_at, created_at
             LIMIT ?
             FOR UPDATE SKIP LOCKED)
        RETURNING id, type, payload, attempts`,
        [leaseMs, limit],
      );
      return result.rows;
    },

    async complete(id) {
      await db(t).where({ id }).update({ processed_at: db.fn.now(), locked_until: null, last_error: null });
    },

    async retry(id, error, availableAt) {
      await db(t).where({ id }).update({ available_at: availableAt, locked_until: null, last_error: error });
    },

    async fail(id, error) {
      await db(t).where({ id }).update({ failed_at: db.fn.now(), locked_until: null, last_error: error });
    },
  };
}
