import type { SupabaseClient } from '@supabase/supabase-js';

type Row = { id: number; name: string; price_per_hour: number | string };
export type FakeFailure = { message?: string; code?: string; status?: number; throws?: boolean } | null;

/**
 * In-memory stand-in for the parts of the Supabase query builder the adapter
 * uses (from/select/order/limit/insert/single/abortSignal). Behaves like
 * PostgREST for those calls, so contract tests need no network.
 */
export function createFakeSupabase(initial: Row[] = []) {
  let rows = [...initial];
  let nextFailure: FakeFailure = null;

  const client = {
    from(table: string) {
      const state: { insert?: Omit<Row, 'id'>; single?: boolean; limit?: number; ascending?: boolean } = {};
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: (_col: string, opts: { ascending: boolean }) => {
          state.ascending = opts.ascending;
          return builder;
        },
        limit: (n: number) => {
          state.limit = n;
          return builder;
        },
        insert: (row: Omit<Row, 'id'>) => {
          state.insert = row;
          return builder;
        },
        single: () => {
          state.single = true;
          return builder;
        },
        abortSignal: () => builder,
        then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
          const failure = nextFailure;
          nextFailure = null;
          if (failure?.throws) {
            return reject(new TypeError(failure.message ?? 'Network request failed'));
          }
          if (failure) {
            return resolve({ data: null, error: { message: failure.message ?? '', code: failure.code ?? '' }, status: failure.status });
          }
          if (table !== 'equipment') {
            return resolve({ data: null, error: { code: 'PGRST205', message: 'not found' }, status: 404 });
          }
          if (state.insert) {
            const id = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
            const stored = { id, ...state.insert };
            rows = [...rows, stored];
            return resolve({ data: state.single ? stored : [stored], error: null, status: 201 });
          }
          const sorted = [...rows].sort((a, b) => (state.ascending === false ? b.id - a.id : a.id - b.id));
          return resolve({ data: sorted.slice(0, state.limit ?? sorted.length), error: null, status: 200 });
        },
      };
      return builder;
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    failNext(failure: FakeFailure) {
      nextFailure = failure;
    },
  };
}
