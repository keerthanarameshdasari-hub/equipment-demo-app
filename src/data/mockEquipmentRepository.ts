import type { Equipment, NewEquipment } from '../domain/equipment';
import { DataError, type DataErrorKind } from './DataError';
import type { EquipmentRepository } from './EquipmentRepository';

/** Non-sensitive demo dataset (same rows as supabase/seed.sql). */
export const DEMO_EQUIPMENT: Equipment[] = [
  { id: 1, name: 'JCB Backhoe Loader', price_per_hour: 1500 },
  { id: 2, name: 'Mini Excavator', price_per_hour: 2000 },
  { id: 3, name: 'Concrete Mixer', price_per_hour: 650 },
  { id: 4, name: 'Scissor Lift', price_per_hour: 900 },
  { id: 5, name: 'Road Roller', price_per_hour: 1800 },
];

export type MockOptions = {
  initial?: Equipment[];
  /** Simulated latency in ms (0 in tests). */
  delayMs?: number;
  /** Make list() / create() fail with the given error kind. */
  failList?: DataErrorKind;
  failCreate?: DataErrorKind;
};

export type MockEquipmentRepository = EquipmentRepository & {
  /** Change failure behaviour between calls (tests). */
  setFailures(failures: Pick<MockOptions, 'failList' | 'failCreate'>): void;
};

/** In-memory repository: used in tests and when no backend is configured. */
export function createMockEquipmentRepository(options: MockOptions = {}): MockEquipmentRepository {
  let items = [...(options.initial ?? DEMO_EQUIPMENT)];
  let failList = options.failList;
  let failCreate = options.failCreate;
  const delayMs = options.delayMs ?? 0;

  const wait = () =>
    delayMs > 0 ? new Promise<void>(resolve => setTimeout(resolve, delayMs)) : Promise.resolve();

  return {
    source: 'mock',

    setFailures(failures) {
      failList = failures.failList;
      failCreate = failures.failCreate;
    },

    async list() {
      await wait();
      if (failList) {
        throw new DataError(failList);
      }
      return [...items].sort((a, b) => b.id - a.id);
    },

    async create(input: NewEquipment) {
      await wait();
      if (failCreate) {
        throw new DataError(failCreate);
      }
      const id = items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
      const created: Equipment = { id, name: input.name, price_per_hour: input.price_per_hour };
      items = [...items, created];
      return created;
    },
  };
}
