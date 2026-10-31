import type { Knex } from 'knex';
import { OUTBOX_TABLE } from '@equipdemo/contracts';

/**
 * Migrations are TypeScript modules compiled into the bundle and run by a
 * separate, controlled step (`npm run migrate`, or `node dist/migrate.js` in a
 * container), never by every API replica at start-up (handbook ch. 4 and 6).
 * Never edit a migration that has been applied anywhere; add a new one.
 */
type Migration = { up(db: Knex): Promise<void>; down(db: Knex): Promise<void> };

const m001_equipment: Migration = {
  // Same table, rules and numeric id as supabase/schema.sql, so data can move between them.
  async up(db) {
    await db.schema.createTable('equipment', t => {
      t.bigIncrements('id').primary();
      t.text('name').notNullable();
      t.decimal('price_per_hour', 10, 2).notNullable();
      t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    });
    await db.raw(`ALTER TABLE equipment
      ADD CONSTRAINT equipment_name_length CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
      ADD CONSTRAINT equipment_price_range CHECK (price_per_hour > 0 AND price_per_hour <= 100000)`);
  },
  async down(db) {
    await db.schema.dropTable('equipment');
  },
};

const m002_outbox: Migration = {
  async up(db) {
    await db.schema.createTable(OUTBOX_TABLE, t => {
      t.uuid('id').primary();
      t.text('type').notNullable();
      t.jsonb('payload').notNullable();
      t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
      t.timestamp('available_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
      t.integer('attempts').notNullable().defaultTo(0);
      t.timestamp('locked_until', { useTz: true });
      t.timestamp('processed_at', { useTz: true });
      t.timestamp('failed_at', { useTz: true });
      t.text('last_error');
    });
    await db.raw(
      `CREATE INDEX ${OUTBOX_TABLE}_pending_idx ON ${OUTBOX_TABLE} (available_at)
       WHERE processed_at IS NULL AND failed_at IS NULL`,
    );
  },
  async down(db) {
    await db.schema.dropTable(OUTBOX_TABLE);
  },
};

const MIGRATIONS: Record<string, Migration> = {
  '001_equipment': m001_equipment,
  '002_outbox_events': m002_outbox,
};

export const migrationSource: Knex.MigrationSource<string> = {
  async getMigrations() {
    return Object.keys(MIGRATIONS);
  },
  getMigrationName(name) {
    return name;
  },
  async getMigration(name) {
    return MIGRATIONS[name]!;
  },
};
