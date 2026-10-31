import type { Handlers, Logger } from './runner';

/**
 * Event handlers. Delivery is at-least-once, so every handler must be idempotent:
 * use `event.id` as the idempotency key for any external call.
 *
 * `equipment.created` currently only records the delivery. A real notification
 * (email, webhook, search index) plugs in here without touching the api.
 */
export function createHandlers(log: Logger): Handlers {
  return {
    'equipment.created': async event => {
      log.info('Delivered equipment.created', { eventId: event.id, equipmentId: event.data.id });
    },
  };
}
