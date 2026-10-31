// Controlled migration step: `npm run migrate -w @equipdemo/api` (or `node dist/migrate.js`).
// Usage: migrate [latest|rollback|status]   (rollback is for disposable databases only)
import { loadConfig, url } from '@equipdemo/config';
import { createDb } from './db';
import { migrationSource } from './migrations';

const { DATABASE_URL } = loadConfig(
  { DATABASE_URL: url({ protocols: ['postgres:', 'postgresql:'], secret: true }) },
  process.env,
);
const command = process.argv[2] ?? 'latest';
const db = createDb(DATABASE_URL);

try {
  if (command === 'latest') {
    const [batch, names] = await db.migrate.latest({ migrationSource });
    console.log(names.length ? `Batch ${batch}: applied ${names.join(', ')}` : 'Already up to date');
  } else if (command === 'rollback') {
    const [batch, names] = await db.migrate.rollback({ migrationSource });
    console.log(names.length ? `Rolled back batch ${batch}: ${names.join(', ')}` : 'Nothing to roll back');
  } else if (command === 'status') {
    const [done, pending] = await db.migrate.list({ migrationSource });
    console.log(`Applied: ${done.length}, pending: ${pending.length}`);
  } else {
    throw new Error(`Unknown command "${command}" (use latest, rollback or status)`);
  }
} catch (err) {
  console.error('Migration failed:', err instanceof Error ? err.message : 'unknown error');
  process.exitCode = 1;
} finally {
  await db.destroy();
}
