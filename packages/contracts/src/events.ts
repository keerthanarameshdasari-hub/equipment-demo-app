import type { Equipment } from './equipment';

/**
 * Events written to the transactional outbox by the api and delivered by the worker
 * (handbook ch. 6: "write an outbox event in the same transaction and let a separate
 * worker deliver it with retries and an idempotency key").
 *
 * The api owns the `outbox_events` table (its migrations); the worker depends only on
 * this contract, never on api source code.
 */
export const OUTBOX_TABLE = 'outbox_events';

export type EquipmentCreatedEvent = {
  /** Event id, also the idempotency key for delivery. */
  id: string;
  type: 'equipment.created';
  occurredAt: string;
  data: Equipment;
};

export type DomainEvent = EquipmentCreatedEvent;
export type DomainEventType = DomainEvent['type'];

export const DOMAIN_EVENT_TYPES: readonly DomainEventType[] = ['equipment.created'];

export function isDomainEventType(value: unknown): value is DomainEventType {
  return typeof value === 'string' && (DOMAIN_EVENT_TYPES as readonly string[]).includes(value);
}
