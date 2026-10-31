import type { Knex } from 'knex';
import { OUTBOX_TABLE, type Equipment } from '@equipdemo/contracts';
import { equipmentCreatedEvent, type EquipmentStore } from './store';

const COLUMNS = ['id', 'name', 'price_per_hour'] as const;

type Row = { id: string | number; name: string; price_per_hour: string | number };

/** pg returns bigint and numeric as strings; the contract uses numbers. */
function toEquipment(row: Row): Equipment {
  return { id: Number(row.id), name: row.name, price_per_hour: Number(row.price_per_hour) };
}

/** PostgreSQL store. The caller owns (and destroys) the Knex pool. */
export function createKnexStore(db: Knex): EquipmentStore {
  return {
    async list(limit) {
      const rows: Row[] = await db('equipment').select(COLUMNS).orderBy('id', 'desc').limit(limit);
      return rows.map(toEquipment);
    },

    async create(input) {
      // Record and outbox event commit together, or not at all (handbook ch. 6).
      return db.transaction(async trx => {
        const [row] = (await trx('equipment')
          .insert({ name: input.name, price_per_hour: input.price_per_hour })
          .returning(COLUMNS)) as Row[];
        const equipment = toEquipment(row!);
        const event = equipmentCreatedEvent(equipment);
        await trx(OUTBOX_TABLE).insert({ id: event.id, type: event.type, payload: JSON.stringify(event) });
        return equipment;
      });
    },

    async ping() {
      await db.raw('select 1');
    },
  };
}
