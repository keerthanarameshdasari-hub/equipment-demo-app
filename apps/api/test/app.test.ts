import { afterEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { API_ROUTES, apiConfigSpecIsValid } from './helpers';
import { buildApp } from '../src/app';
import { createMemoryStore, type MemoryStore } from '../src/store';

let app: FastifyInstance | undefined;

async function setup(options: { rateLimitMax?: number; store?: MemoryStore } = {}) {
  const store = options.store ?? createMemoryStore([{ id: 1, name: 'Road Roller', price_per_hour: 1800 }]);
  app = await buildApp({ store, rateLimitMax: options.rateLimitMax, corsOrigins: ['http://localhost:5173'] });
  return { app, store };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const post = (instance: FastifyInstance, payload: unknown) =>
  instance.inject({ method: 'POST', url: API_ROUTES.createEquipment.path, payload: payload as object });

describe('health', () => {
  test('live is always ok; ready reflects the store', async () => {
    const { app: a, store } = await setup();
    expect((await a.inject({ url: API_ROUTES.healthLive.path })).json()).toEqual({ ok: true });
    expect((await a.inject({ url: API_ROUTES.healthReady.path })).statusCode).toBe(200);
    store.setAvailable(false);
    const ready = await a.inject({ url: API_ROUTES.healthReady.path });
    expect([ready.statusCode, ready.json()]).toEqual([503, { ok: false }]);
  });
});

describe('equipment', () => {
  test('lists newest first in the contract shape', async () => {
    const { app: a } = await setup();
    await post(a, { name: 'Scissor Lift', price_per_hour: 900 });
    const res = await a.inject({ url: API_ROUTES.listEquipment.path });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      items: [
        { id: 2, name: 'Scissor Lift', price_per_hour: 900 },
        { id: 1, name: 'Road Roller', price_per_hour: 1800 },
      ],
    });
  });

  test('creates a record, normalises the name and writes an outbox event', async () => {
    const { app: a, store } = await setup();
    const res = await post(a, { name: '  Mini   Excavator ', price_per_hour: 1999.5 });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: 2, name: 'Mini Excavator', price_per_hour: 1999.5 });
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject({ type: 'equipment.created', data: { id: 2, name: 'Mini Excavator' } });
  });

  test.each([
    ['missing price', { name: 'Lift' }],
    ['extra field', { name: 'Lift', price_per_hour: 10, admin: true }],
    ['price as string (no coercion)', { name: 'Lift', price_per_hour: '10' }],
    ['zero price', { name: 'Lift', price_per_hour: 0 }],
    ['price above max', { name: 'Lift', price_per_hour: 100000.01 }],
    ['three decimals', { name: 'Lift', price_per_hour: 10.123 }],
    ['name too short after trimming', { name: ' A    ', price_per_hour: 10 }],
    ['name too long after normalising', { name: 'x'.repeat(61), price_per_hour: 10 }],
    ['disallowed characters', { name: '<b>Lift</b>', price_per_hour: 10 }],
  ])('rejects %s with the error envelope', async (_label, payload) => {
    const { app: a, store } = await setup();
    const res = await post(a, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: 'invalid_request', message: 'Invalid request' },
      requestId: expect.any(String),
    });
    expect(store.events).toHaveLength(0);
  });

  test('a store failure becomes a 500 without internal details', async () => {
    const { app: a, store } = await setup();
    store.setAvailable(false);
    const res = await a.inject({ url: API_ROUTES.listEquipment.path });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toEqual({ code: 'internal', message: 'Internal server error' });
    expect(res.body).not.toContain('store unavailable');
  });

  test('unknown routes use the envelope', async () => {
    const { app: a } = await setup();
    const res = await a.inject({ url: '/v1/nope' });
    expect([res.statusCode, res.json().error.code]).toEqual([404, 'not_found']);
  });
});

describe('abuse controls', () => {
  test('rate limits with 429 and the envelope', async () => {
    const { app: a } = await setup({ rateLimitMax: 2 });
    await a.inject({ url: API_ROUTES.listEquipment.path });
    await a.inject({ url: API_ROUTES.listEquipment.path });
    const res = await a.inject({ url: API_ROUTES.listEquipment.path });
    expect([res.statusCode, res.json().error.code]).toEqual([429, 'rate_limited']);
  });

  test('CORS allows only configured origins', async () => {
    const { app: a } = await setup();
    const allowed = await a.inject({ url: API_ROUTES.listEquipment.path, headers: { origin: 'http://localhost:5173' } });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const other = await a.inject({ url: API_ROUTES.listEquipment.path, headers: { origin: 'https://evil.example' } });
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('rejects oversized bodies', async () => {
    const { app: a } = await setup();
    const res = await post(a, { name: 'Lift', price_per_hour: 10, pad: 'x'.repeat(20000) });
    expect(res.statusCode).toBe(413);
  });
});

describe('configuration', () => {
  test('the api config spec rejects a non-Postgres DATABASE_URL and defaults to loopback', () => {
    expect(apiConfigSpecIsValid()).toBe(true);
  });
});
