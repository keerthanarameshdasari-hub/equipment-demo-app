import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isValidEquipment,
  toEquipment,
  type Equipment,
  type NewEquipment,
} from '../domain/equipment';
import { DataError } from './DataError';
import type { EquipmentRepository } from './EquipmentRepository';

export const TABLE = 'equipment';
export const COLUMNS = 'id, name, price_per_hour';
export const LIST_LIMIT = 50;
export const REQUEST_TIMEOUT_MS = 10_000;

type BackendError = { code?: string; message?: string } | null | undefined;
type BackendResponse<T> = { data: T | null; error: BackendError; status?: number };

const PERMISSION_CODES = ['42501', 'PGRST301', 'PGRST302'];
const NOT_FOUND_CODES = ['42P01', 'PGRST205'];
const REJECTED_CODES = ['23502', '23505', '23514', '22001', '22003', '22P02'];

/** Maps a Supabase/PostgREST error to a DataError without exposing its details. */
export function mapBackendError(error: BackendError, status?: number): DataError {
  const code = error?.code || undefined;
  const message = error?.message ?? '';

  if (/abort/i.test(message)) {
    return new DataError('timeout', code);
  }
  if (/network request failed|failed to fetch|fetch failed|networkerror/i.test(message)) {
    return new DataError('network', code);
  }
  if ((code && PERMISSION_CODES.includes(code)) || status === 401 || status === 403) {
    return new DataError('permission', code);
  }
  if ((code && NOT_FOUND_CODES.includes(code)) || status === 404) {
    return new DataError('not_found', code);
  }
  if ((code && REJECTED_CODES.includes(code)) || status === 400 || status === 409) {
    return new DataError('rejected', code);
  }
  return new DataError('unknown', code);
}

/** Runs a request with a timeout and converts every failure into a DataError. */
async function run<T>(
  request: (signal: AbortSignal) => PromiseLike<BackendResponse<T>>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: BackendResponse<T>;
  try {
    response = await request(controller.signal);
  } catch (thrown) {
    if (controller.signal.aborted) {
      throw new DataError('timeout');
    }
    const message = thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : '';
    throw mapBackendError({ message });
  } finally {
    clearTimeout(timer);
  }

  if (response.error) {
    throw controller.signal.aborted
      ? new DataError('timeout', response.error.code || undefined)
      : mapBackendError(response.error, response.status);
  }
  if (response.data == null) {
    throw new DataError('unknown');
  }
  return response.data;
}

export function createSupabaseEquipmentRepository(
  client: SupabaseClient,
  options: { timeoutMs?: number } = {},
): EquipmentRepository {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  return {
    source: 'supabase',

    async list(): Promise<Equipment[]> {
      const rows = await run<Equipment[]>(
        signal =>
          client
            .from(TABLE)
            .select(COLUMNS)
            .order('id', { ascending: false })
            .limit(LIST_LIMIT)
            .abortSignal(signal) as unknown as PromiseLike<BackendResponse<Equipment[]>>,
        timeoutMs,
      );
      return rows.filter(isValidEquipment).map(toEquipment);
    },

    async create(input: NewEquipment): Promise<Equipment> {
      // Send only the known columns, never arbitrary fields.
      const record = { name: input.name, price_per_hour: input.price_per_hour };
      const row = await run<Equipment>(
        signal =>
          client
            .from(TABLE)
            .insert(record)
            .select(COLUMNS)
            .abortSignal(signal)
            .single() as unknown as PromiseLike<BackendResponse<Equipment>>,
        timeoutMs,
      );
      if (!isValidEquipment(row)) {
        throw new DataError('unknown');
      }
      return toEquipment(row);
    },
  };
}
