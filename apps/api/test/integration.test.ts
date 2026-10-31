import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Knex } from 'knex';
import type { FastifyInstance } from 'fastify';
import { API_ROUTES, OUTBOX_TABLE } from '@equipdemo/contracts';
import { buildApp } from '../src/app';
import { createDb } from '../src/db';
import { createKnexStore } from '../src/knexStore';
import { migrationSource } from '../src/migrations';
import { testDatabaseUrl } from './helpers';

// Real HTTP framework + real PostgreSQL. Skips when DATABASE_URL is not set;
// CI sets it (Postgres service container) so the suite always runs there.
const databaseUrl = testDatabaseUrl();
const describeDb = databaseUrl ? describe : describe.skip;
if (!databaseUrl && process.env.INTEGRATION_REQUIRED === '1') {
  throw new Error('INTEGRATION_REQUIRED=1 but DATABASE_URL is not set');
}

describeDb('api against PostgreSQL', () => {
  let db: Knex;
  let app: FastifyInstance;
  const createdIds: number[] = [];

  beforeAll(async () => {
    db = createDb(databaseUrl!);
    await db.migrate.latest({ migrationSource });
    app = await buildApp({ store: createKnexStore(db) });
  });

  afterAll(async () => {
    if (createdIds.length) {
      await db(OUTBOX_TABLE).whereRaw("(payload->'data'->>'id')::bigint = any(?)", [createdIds]).delete();
      await db('equipment').whereIn('id', createdIds).delete();
    }
    await app?.close();
    await db?.destroy();
  });

  test('ready when the database responds', async () => {
    expect((await app.inject({ url: API_ROUTES.healthReady.path })).json()).toEqual({ ok: true });
  });

  test('create persists the record and its outbox event in one transaction', async () => {
    const res = await app.inject({
      method: 'POST',
      url: API_ROUTES.createEquipment.path,
      payload: { name: 'Integration   Lift', price_per_hour: 1234.5 },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    createdIds.push(created.id);
    expect(created).toEqual({ id: expect.any(Number), name: 'Integration Lift', price_per_hour: 1234.5 });

    const list = (await app.inject({ url: API_ROUTES.listEquipment.path })).json();
    expect(list.items[0]).toEqual(created);

    const events = await db(OUTBOX_TABLE).whereRaw("(payload->'data'->>'id')::bigint = ?", [created.id]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'equipment.created', processed_at: null, attempts: 0 });
  });

  test('database constraints hold even if a writer bypasses the API', async () => {
    await expect(db('equipment').insert({ name: ' x ', price_per_hour: 10 })).rejects.toThrow(/equipment_name_length/);
    await expect(db('equipment').insert({ name: 'Valid', price_per_hour: 0 })).rejects.toThrow(/equipment_price_range/);
  });

  test('migrations are idempotent', async () => {
    const [, names] = await db.migrate.latest({ migrationSource });
    expect(names).toEqual([]);
  });
});
