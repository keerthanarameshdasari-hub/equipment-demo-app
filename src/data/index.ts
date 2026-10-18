import { getSupabaseConfig } from '../config/env';
import type { EquipmentRepository } from './EquipmentRepository';
import { createMockEquipmentRepository } from './mockEquipmentRepository';
import { createSupabaseClient } from './supabaseClient';
import { createSupabaseEquipmentRepository } from './supabaseEquipmentRepository';

export type { EquipmentRepository, DataSourceName } from './EquipmentRepository';
export { DataError, toUserMessage } from './DataError';

/**
 * Picks the data source for the app: Supabase when configured at build time,
 * otherwise in-memory demo data (the UI shows which one is active).
 */
export function createDefaultRepository(): EquipmentRepository {
  const config = getSupabaseConfig();
  if (config) {
    return createSupabaseEquipmentRepository(createSupabaseClient(config));
  }
  return createMockEquipmentRepository({ delayMs: 400 });
}
