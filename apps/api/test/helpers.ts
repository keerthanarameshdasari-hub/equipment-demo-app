import { ConfigError, loadConfig } from '@equipdemo/config';
import { apiConfigSpec } from '../src/config';

export { API_ROUTES } from '@equipdemo/contracts';

export function apiConfigSpecIsValid(): boolean {
  const ok = loadConfig(apiConfigSpec, { DATABASE_URL: 'postgres://u:p@localhost:5432/db' });
  if (ok.HOST !== '127.0.0.1' || ok.PORT !== 3000 || ok.NODE_ENV !== 'production') {
    return false;
  }
  try {
    loadConfig(apiConfigSpec, { DATABASE_URL: 'mysql://u:p@localhost/db' });
    return false;
  } catch (e) {
    return e instanceof ConfigError && e.problems.includes('DATABASE_URL must use postgres: or postgresql:');
  }
}

/**
 * Integration tests refuse any database whose name does not end in `_test`
 * (handbook ch. 13: the guard is an extra precaution, not permission to use a
 * shared environment).
 */
export function testDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return undefined;
  }
  const name = new URL(raw).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error('Refusing to run integration tests: the database name must end in "_test".');
  }
  return raw;
}
