import knex, { type Knex } from 'knex';

/** Creates the Knex pool. Hosted environments should require verified TLS in DATABASE_URL. */
export function createDb(databaseUrl: string): Knex {
  return knex({
    client: 'pg',
    connection: databaseUrl,
    pool: { min: 0, max: 5 },
    acquireConnectionTimeout: 5000,
  });
}
