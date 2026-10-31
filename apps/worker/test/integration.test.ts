import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import knex, { type Knex } from 'knex';
import { OUTBOX_TABLE, type DomainEvent } from '@equipdemo/contracts';
import { createKnexOutbox } from '../src/knexOutbox';
import { runOnce } from '../src/runner';

// Needs the api's migrations applied first (the api owns the schema):
//   npm run migrate -w @equipdemo/api && npm run test:integration -w @equipdemo/worker
const raw = process.env.DATABASE_URL;
if (raw && !new URL(raw).pathname.endsWith('_test')) {
  throw new Error('Refusing to run integration tests: the database name must end in "_test".');
}
if (!raw && process.env.INTEGRATION_REQUIRED === '1') {
  throw new Error('INTEGRATION_REQUIRED=1 but DATABASE_URL is not set');
}
const describeDb = raw ? describe : describe.skip;
const silent = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describeDb('worker against PostgreSQL', () => {
  let db: Knex;
  const ids: string[] = [];

  const insert = async (type = 'equipment.created') => {
    const id = randomUUID();
    const payload: DomainEvent = { id, type: 'equipment.created', occurredAt: new Date().toISOString(), data: { id: 99, name: 'Test', price_per_hour: 1 } };
    await db(OUTBOX_TABLE).insert({ id, type, payload: JSON.stringify(payload) });
    ids.push(id);
    return id;
  };

  beforeAll(async () => {
    db = knex({ client: 'pg', connection: raw! });
    if (!(await db.schema.hasTable(OUTBOX_TABLE))) {
      throw new Error(`Table ${OUTBOX_TABLE} missing: run the api migrations first`);
    }
    // Start from a clean slate for rows this suite could claim.
    await db(OUTBOX_TABLE).whereNull('processed_at').whereNull('failed_at').update({ failed_at: db.fn.now(), last_error: 'parked by worker integration test' });
  });

  afterAll(async () => {
    if (ids.length) {
      await db(OUTBOX_TABLE).whereIn('id', ids).delete();
    }
    await db?.destroy();
  });

  test('claims, delivers and completes; a second worker cannot claim leased rows', async () => {
    const ok = await insert();
    const bad = await insert('equipment.unknown');
    const source = createKnexOutbox(db);

    const delivered: string[] = [];
    const stats = await runOnce(source, {
      'equipment.created': async e => {
        delivered.push(e.id);
      },
    }, { batchSize: 10, leaseMs: 30_000, maxAttempts: 3, log: silent });
    expect(stats).toMatchObject({ claimed: 2, completed: 1, failed: 1 });
    expect(delivered).toEqual([ok]);

    const rows = await db(OUTBOX_TABLE).whereIn('id', [ok, bad]).orderBy('created_at');
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    expect(byId[ok].processed_at).not.toBeNull();
    expect(byId[bad].failed_at).not.toBeNull();

    // Leasing: once claimed, a row is invisible to other workers until the lease expires.
    const leased = await insert();
    expect((await source.claim(10, 30_000)).map(r => r.id)).toEqual([leased]);
    expect(await source.claim(10, 30_000)).toEqual([]);
  });

  test('a failed delivery is rescheduled with backoff and its attempt counted', async () => {
    const id = await insert();
    const source = createKnexOutbox(db);
    await runOnce(source, { 'equipment.created': async () => Promise.reject(new Error('down')) }, { batchSize: 10, leaseMs: 30_000, maxAttempts: 3, log: silent });
    const row = await db(OUTBOX_TABLE).where({ id }).first();
    expect(row).toMatchObject({ attempts: 1, processed_at: null, failed_at: null, locked_until: null, last_error: 'Error: down' });
    expect(new Date(row.available_at).getTime()).toBeGreaterThan(Date.now());
  });
});
