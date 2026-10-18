import 'dotenv/config';
import { describe, expect, test } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseEquipmentRepository } from '../src/data/supabaseEquipmentRepository';

// Read via a variable so babel.config.js does not inline stale values.
const env = process.env;
const url = env.SUPABASE_URL;
const key = env.SUPABASE_PUBLISHABLE_KEY;
const describeLive = url && key ? describe : describe.skip;

if (!url || !key) {
  console.warn('Skipping live Supabase checks: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not set.');
}

describeLive('Live Supabase (publishable key + RLS)', () => {
  const client = createClient(url as string, key as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const repository = createSupabaseEquipmentRepository(client);

  test('fetches records', async () => {
    const items = await repository.list();
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  test('submits a record and reads it back', async () => {
    const name = `Integration check ${Date.now().toString().slice(-6)}`;
    const created = await repository.create({ name, price_per_hour: 1 });
    expect(created).toMatchObject({ name, price_per_hour: 1 });

    const items = await repository.list();
    expect(items.some(item => item.id === created.id)).toBe(true);
  });

  test('RLS blocks updates and deletes with the publishable key', async () => {
    const [first] = await repository.list();
    const updated = await client.from('equipment').update({ price_per_hour: 0 }).eq('id', first.id).select();
    expect(updated.data ?? []).toHaveLength(0);
    const deleted = await client.from('equipment').delete().eq('id', first.id).select();
    expect(deleted.data ?? []).toHaveLength(0);
  });

  test('the database rejects invalid values even if the app is bypassed', async () => {
    const result = await client.from('equipment').insert({ name: '', price_per_hour: -5 });
    expect(result.error).not.toBeNull();
  });
});
