import type { Equipment, NewEquipment } from '../domain/equipment';

/** Backends that can sit behind the repository. 'amplify' is reserved for the planned AWS adapter. */
export type DataSourceName = 'supabase' | 'mock' | 'amplify';

/** What the UI shows for each data source (no backend names appear anywhere else in the UI). */
export const DATA_SOURCE_LABELS: Record<DataSourceName, string> = {
  mock: 'Demo data (no backend configured)',
  supabase: 'Live data · Supabase',
  amplify: 'Live data · AWS',
};

/**
 * Data-access contract used by the UI. The UI depends only on this interface,
 * never on a backend SDK (enforced by ESLint).
 *
 * Implementations: Supabase (live), mock (tests / no backend configured).
 * A future AWS Amplify implementation plugs in here without UI changes; it must
 * pass the shared contract tests in __tests__/repositoryContract.test.ts.
 * See docs/AWS_MIGRATION.md.
 *
 * Behaviour every implementation must provide:
 * - list(): at most 50 records, newest first (highest id first); rows that are
 *   malformed are skipped, never thrown; numeric fields are numbers.
 * - create(): input is already validated by the UI; send only `name` and
 *   `price_per_hour`; resolve with the stored record (including its new id),
 *   which list() then returns.
 * - Errors: reject ONLY with DataError (kinds: network, timeout, permission,
 *   not_found, rejected, unknown). Never expose backend messages, keys or
 *   submitted values to the UI or logs.
 * - Requests time out (DataError 'timeout') instead of hanging.
 */
export interface EquipmentRepository {
  readonly source: DataSourceName;
  /** Returns a small list of records, newest first. */
  list(): Promise<Equipment[]>;
  /** Creates a record and returns it as stored. Input must already be validated. */
  create(input: NewEquipment): Promise<Equipment>;
}
