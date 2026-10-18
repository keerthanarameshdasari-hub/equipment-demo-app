import { describe, expect, test } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DataError } from '../src/data/DataError';
import {
  createSupabaseEquipmentRepository,
  mapBackendError,
} from '../src/data/supabaseEquipmentRepository';

type Call = [method: string, args: unknown[]];
type Outcome =
  | { data: unknown; error: unknown; status?: number }
  | { throws: Error }
  | 'hang';

/**
 * Minimal stand-in for the Supabase query builder: records each chained call
 * and resolves (or rejects) with the given outcome when awaited.
 */
function fakeClient(outcome: Outcome) {
  const calls: Call[] = [];
  let signal: AbortSignal | undefined;
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'select', 'order', 'limit', 'insert', 'single', 'abortSignal']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      if (method === 'abortSignal') {
        signal = args[0] as AbortSignal;
      }
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    if (outcome === 'hang') {
      // Like supabase-js: an aborted request resolves with an AbortError.
      signal?.addEventListener('abort', () =>
        resolve({ data: null, error: { message: 'AbortError: Aborted', code: '20' } }),
      );
      return;
    }
    if ('throws' in outcome) {
      reject(outcome.throws);
      return;
    }
    resolve(outcome);
  };
  return { client: builder as unknown as SupabaseClient, calls };
}

const methods = (calls: Call[]) => calls.map(([m]) => m);

describe('Supabase repository: list', () => {
  test('queries the equipment table, newest first, limited', async () => {
    const { client, calls } = fakeClient({
      data: [{ id: 2, name: 'Mini Excavator', price_per_hour: 2000 }],
      error: null,
      status: 200,
    });
    const items = await createSupabaseEquipmentRepository(client).list();

    expect(items).toEqual([{ id: 2, name: 'Mini Excavator', price_per_hour: 2000 }]);
    expect(methods(calls)).toEqual(['from', 'select', 'order', 'limit', 'abortSignal']);
    expect(calls[0][1]).toEqual(['equipment']);
    expect(calls[1][1]).toEqual(['id, name, price_per_hour']);
    expect(calls[2][1]).toEqual(['id', { ascending: false }]);
  });

  test('skips malformed rows and normalises numeric strings', async () => {
    const { client } = fakeClient({
      data: [
        { id: 1, name: 'Road Roller', price_per_hour: '1800.00' },
        { id: 2, name: '', price_per_hour: 100 },
        { id: 3, name: 'Bad price', price_per_hour: -1 },
      ],
      error: null,
    });
    expect(await createSupabaseEquipmentRepository(client).list()).toEqual([
      { id: 1, name: 'Road Roller', price_per_hour: 1800 },
    ]);
  });

  test('returns an empty list', async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect(await createSupabaseEquipmentRepository(client).list()).toEqual([]);
  });

  test('maps an RLS denial to a permission error', async () => {
    const { client } = fakeClient({
      data: null,
      error: { code: '42501', message: 'permission denied for table equipment' },
      status: 401,
    });
    await expect(createSupabaseEquipmentRepository(client).list()).rejects.toMatchObject({
      kind: 'permission',
      code: '42501',
    });
  });

  test('maps a thrown network failure to a network error', async () => {
    const { client } = fakeClient({ throws: new TypeError('Network request failed') });
    const error = await createSupabaseEquipmentRepository(client)
      .list()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(error).toMatchObject({ kind: 'network' });
    expect((error as DataError).message).toMatch(/internet connection/);
  });

  test('times out a request that never answers', async () => {
    const { client } = fakeClient('hang');
    await expect(
      createSupabaseEquipmentRepository(client, { timeoutMs: 20 }).list(),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('Supabase repository: create', () => {
  test('inserts only the known columns and returns the stored row', async () => {
    const { client, calls } = fakeClient({
      data: { id: 7, name: 'Tower Crane', price_per_hour: 2500 },
      error: null,
      status: 201,
    });
    const input = { name: 'Tower Crane', price_per_hour: 2500, extra: 'ignored' };
    const created = await createSupabaseEquipmentRepository(client).create(input);

    expect(created).toEqual({ id: 7, name: 'Tower Crane', price_per_hour: 2500 });
    expect(methods(calls)).toEqual(['from', 'insert', 'select', 'abortSignal', 'single']);
    expect(calls[1][1]).toEqual([{ name: 'Tower Crane', price_per_hour: 2500 }]);
  });

  test('maps a check-constraint violation to a rejected error', async () => {
    const { client } = fakeClient({
      data: null,
      error: { code: '23514', message: 'violates check constraint' },
      status: 400,
    });
    await expect(
      createSupabaseEquipmentRepository(client).create({ name: 'X', price_per_hour: 1 }),
    ).rejects.toMatchObject({ kind: 'rejected' });
  });

  test('maps a missing insert policy to a permission error', async () => {
    const { client } = fakeClient({
      data: null,
      error: {
        code: '42501',
        message: 'new row violates row-level security policy for table "equipment"',
      },
      status: 403,
    });
    await expect(
      createSupabaseEquipmentRepository(client).create({ name: 'Crane', price_per_hour: 10 }),
    ).rejects.toMatchObject({ kind: 'permission' });
  });
});

describe('mapBackendError', () => {
  test.each([
    [{ code: 'PGRST205', message: 'Could not find the table' }, undefined, 'not_found'],
    [{ code: '', message: 'TypeError: Network request failed' }, 0, 'network'],
    [{ code: '', message: 'something odd' }, 500, 'unknown'],
  ])('%p -> %p', (error, status, kind) => {
    expect(mapBackendError(error, status).kind).toBe(kind);
  });

  test('user message never includes backend details', () => {
    const error = mapBackendError({ code: '42501', message: 'secret internal detail' }, 401);
    expect(error.message).not.toContain('secret internal detail');
  });
});
