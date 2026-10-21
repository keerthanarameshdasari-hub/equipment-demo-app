// The EquipmentRepository contract. EVERY data adapter must pass this suite
// unchanged: today mock and Supabase; the future AWS Amplify adapter is added
// to ADAPTERS below (see docs/AWS_MIGRATION.md).
import { describe, expect, test } from '@jest/globals';
import { DataError, type DataErrorKind } from '../src/data/DataError';
import type { EquipmentRepository } from '../src/data/EquipmentRepository';
import { createMockEquipmentRepository } from '../src/data/mockEquipmentRepository';
import { createSupabaseEquipmentRepository } from '../src/data/supabaseEquipmentRepository';
import { createFakeSupabase } from './helpers/fakeSupabase';

const SEED = [
  { id: 1, name: 'JCB Backhoe Loader', price_per_hour: 1500 },
  { id: 2, name: 'Mini Excavator', price_per_hour: 2000 },
  { id: 3, name: 'Concrete Mixer', price_per_hour: 650 },
];

type Harness = {
  repository: EquipmentRepository;
  /** Make the next request fail the way this backend fails. */
  failNext: (kind: 'network' | 'permission') => void;
  /** Clear any simulated failure. */
  reset: () => void;
};

const ADAPTERS: Record<string, (seed: typeof SEED) => Harness> = {
  mock: seed => {
    const repository = createMockEquipmentRepository({ initial: seed });
    return {
      repository,
      failNext: kind => {
        repository.setFailures({ failList: kind as DataErrorKind, failCreate: kind as DataErrorKind });
      },
      reset: () => repository.setFailures({}),
    };
  },
  supabase: seed => {
    const fake = createFakeSupabase(seed);
    return {
      repository: createSupabaseEquipmentRepository(fake.client),
      failNext: kind =>
        fake.failNext(
          kind === 'network'
            ? { throws: true, message: 'Network request failed' }
            : { code: '42501', message: 'permission denied for table equipment (internal detail)', status: 401 },
        ),
      reset: () => fake.failNext(null),
    };
  },
  // amplify: seed => ({ repository: createAmplifyEquipmentRepository(fakeAmplifyClient(seed)), failNext, reset }),
};

describe.each(Object.entries(ADAPTERS))('EquipmentRepository contract: %s adapter', (name, make) => {
  test('declares its data source', () => {
    expect(make(SEED).repository.source).toBe(name);
  });

  test('list() returns valid records, newest first', async () => {
    const items = await make(SEED).repository.list();
    expect(items.map(i => i.id)).toEqual([3, 2, 1]);
    for (const item of items) {
      expect(typeof item.id).toBe('number');
      expect(typeof item.name).toBe('string');
      expect(typeof item.price_per_hour).toBe('number');
    }
  });

  test('list() on an empty backend returns an empty array', async () => {
    expect(await make([]).repository.list()).toEqual([]);
  });

  test('create() returns the stored record with a new id, and list() then includes it first', async () => {
    const { repository } = make(SEED);
    const created = await repository.create({ name: 'Tower Crane', price_per_hour: 2500 });
    expect(created).toEqual({ id: 4, name: 'Tower Crane', price_per_hour: 2500 });
    expect((await repository.list())[0]).toEqual(created);
  });

  test.each(['network', 'permission'] as const)('a %s failure rejects with a user-safe DataError', async kind => {
    const harness = make(SEED);
    harness.failNext(kind);
    const error = await harness.repository.list().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).kind).toBe(kind);
    expect((error as DataError).message).not.toMatch(/internal detail|42501|permission denied for table/);
  });

  test('a failed create() rejects with DataError and stores nothing', async () => {
    const harness = make(SEED);
    harness.failNext('permission');
    await expect(harness.repository.create({ name: 'Tower Crane', price_per_hour: 1 })).rejects.toBeInstanceOf(DataError);
    harness.reset();
    const ids = (await harness.repository.list()).map(i => i.id);
    expect(ids).toEqual([3, 2, 1]);
  });
});
