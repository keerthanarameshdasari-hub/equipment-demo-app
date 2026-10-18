import type { Equipment, NewEquipment } from '../domain/equipment';

export type DataSourceName = 'supabase' | 'mock';

/**
 * Data-access contract used by the UI. Implementations: Supabase (live),
 * mock (tests / no backend configured). A future AWS Amplify implementation
 * plugs in here without UI changes.
 *
 * Implementations reject only with DataError.
 */
export interface EquipmentRepository {
  readonly source: DataSourceName;
  /** Returns a small list of records, newest first. */
  list(): Promise<Equipment[]>;
  /** Creates a record and returns it as stored. Input must already be validated. */
  create(input: NewEquipment): Promise<Equipment>;
}
