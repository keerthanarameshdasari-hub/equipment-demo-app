import 'dotenv/config';
import { describe, expect, test } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseEquipmentRepository } from '../src/data/supabaseEquipmentRepository';

// Live checks against a Supabase project, using only the publishable key.
//   INTEGRATION_MODE=full      (default) read, write, RLS and constraint checks (SIT, PRE-PROD)
//   INTEGRATION_MODE=readonly  read only; never writes (PROD smoke check)
//   INTEGRATION_REQUIRED=1     fail instead of skipping when configuration is missing (CI stages)

// Read via a variable so babel.config.js does not inline stale values.
const env = process.env;
const url = env.SUPABASE_URL;
const key = env.SUPABASE_PUBLISHABLE_KEY;
const mode = env.INTEGRATION_MODE === 'readonly' ? 'readonly' : 'full';
const configured = Boolean(url && key);

if (!configured && env.INTEGRATION_REQUIRED === '1') {
  throw new Error(
    'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required for this stage but are not set ' +
      '(check the GitHub Environment variables and secrets).',
  );
}
if (!configured) {
  console.warn('Skipping live Supabase checks: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not set.');
}

const describeLive = configured ? describe : describe.skip;
const writeTest = mode === 'full' ? test : test.skip;

describeLive(`Live Supabase (${mode}, publishable key + RLS)`, () => {
  const client = createClient(url as string, key as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const repository = createSupabaseEquipmentRepository(client);

  test('fetches records', async () => {
    const items = await repository.list();
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  writeTest('submits a record and reads it back; RLS blocks changing or deleting it', async () => {
    const name = `Integration check ${Date.now().toString().slice(-6)}`;
    const created = await repository.create({ name, price_per_hour: 1 });
    expect(created).toMatchObject({ name, price_per_hour: 1 });

    const items = await repository.list();
    expect(items.some(item => item.id === created.id)).toBe(true);

    // Only the row this test created is targeted, so a misconfigured policy
    // cannot change real data.
    const updated = await client
      .from('equipment')
      .update({ price_per_hour: 2 })
      .eq('id', created.id)
      .select();
    expect(updated.data ?? []).toHaveLength(0);
    const deleted = await client.from('equipment').delete().eq('id', created.id).select();
    expect(deleted.data ?? []).toHaveLength(0);
  });

  writeTest('the database rejects invalid values even if the app is bypassed', async () => {
    const result = await client.from('equipment').insert({ name: '', price_per_hour: -5 });
    expect(result.error).not.toBeNull();
  });
});
