import { randomUUID } from 'node:crypto';
import type { DomainEvent, Equipment, NewEquipment } from '@equipdemo/contracts';

/**
 * Persistence port used by the HTTP layer. Implementations: Postgres (knexStore.ts)
 * and in-memory (tests, local experiments).
 */
export interface EquipmentStore {
  /** Newest first, at most `limit` records. */
  list(limit: number): Promise<Equipment[]>;
  /** Stores the record AND its `equipment.created` outbox event atomically. */
  create(input: NewEquipment): Promise<Equipment>;
  /** Throws when the backing store is unreachable (readiness probe). */
  ping(): Promise<void>;
}

export function equipmentCreatedEvent(equipment: Equipment, now = new Date()): DomainEvent {
  return { id: randomUUID(), type: 'equipment.created', occurredAt: now.toISOString(), data: equipment };
}

export type MemoryStore = EquipmentStore & {
  readonly events: DomainEvent[];
  setAvailable(available: boolean): void;
};

export function createMemoryStore(initial: Equipment[] = []): MemoryStore {
  let items = [...initial];
  let available = true;
  const events: DomainEvent[] = [];

  const ensureAvailable = () => {
    if (!available) {
      throw new Error('store unavailable');
    }
  };

  return {
    events,
    setAvailable(value) {
      available = value;
    },
    async list(limit) {
      ensureAvailable();
      return [...items].sort((a, b) => b.id - a.id).slice(0, limit);
    },
    async create(input) {
      ensureAvailable();
      const id = items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
      const created: Equipment = { id, name: input.name, price_per_hour: input.price_per_hour };
      items = [...items, created];
      events.push(equipmentCreatedEvent(created));
      return created;
    },
    async ping() {
      ensureAvailable();
    },
  };
}
