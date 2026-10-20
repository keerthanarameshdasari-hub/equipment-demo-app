// Regression: Version 1's fetch and submit behaviour must be unchanged in Version 2.
// These tests pin the V1 contract: what is fetched, how it is shown, what is
// submitted and what the user sees afterwards.
import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RepositoryProvider } from '../src/data/RepositoryContext';
import { createMockEquipmentRepository, DEMO_EQUIPMENT } from '../src/data/mockEquipmentRepository';
import {
  COLUMNS,
  LIST_LIMIT,
  TABLE,
  createSupabaseEquipmentRepository,
} from '../src/data/supabaseEquipmentRepository';
import type { RootStackParamList } from '../src/navigation/types';
import { AddEquipmentScreen } from '../src/screens/AddEquipmentScreen';
import { HomeScreen } from '../src/screens/HomeScreen';

type HomeProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
type AddProps = NativeStackScreenProps<RootStackParamList, 'AddEquipment'>;

/** Records the Supabase query-builder chain and resolves with `response`. */
function recordingClient(response: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'order', 'limit', 'insert', 'single', 'abortSignal']) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => void) => resolve(response);
  return { client: builder as unknown as SupabaseClient, calls };
}

describe('V1 regression: Supabase requests are unchanged', () => {
  test('fetch: same table, columns, newest-first order and limit as Version 1', async () => {
    expect([TABLE, COLUMNS, LIST_LIMIT]).toEqual(['equipment', 'id, name, price_per_hour', 50]);
    const { client, calls } = recordingClient({ data: DEMO_EQUIPMENT, error: null });
    const items = await createSupabaseEquipmentRepository(client).list();
    expect(calls.map(([m, a]) => [m, a.filter(x => !(x instanceof AbortSignal))])).toEqual([
      ['from', ['equipment']],
      ['select', ['id, name, price_per_hour']],
      ['order', ['id', { ascending: false }]],
      ['limit', [50]],
      ['abortSignal', []],
    ]);
    expect(items).toHaveLength(DEMO_EQUIPMENT.length);
  });

  test('submit: same insert payload (name and price only) and returned row as Version 1', async () => {
    const stored = { id: 42, name: 'Tower Crane', price_per_hour: 2500 };
    const { client, calls } = recordingClient({ data: stored, error: null });
    const created = await createSupabaseEquipmentRepository(client).create({
      name: 'Tower Crane',
      price_per_hour: 2500,
    });
    expect(calls.find(([m]) => m === 'insert')?.[1]).toEqual([{ name: 'Tower Crane', price_per_hour: 2500 }]);
    expect(created).toEqual(stored);
  });
});

describe('V1 regression: screens', () => {
  test('fetch: with no search typed, every fetched record is listed (newest first) with its price', async () => {
    const repository = createMockEquipmentRepository();
    await render(
      <RepositoryProvider repository={repository}>
        <HomeScreen
          navigation={{ navigate: jest.fn() } as unknown as HomeProps['navigation']}
          route={{ key: 'Home-1', name: 'Home' } as HomeProps['route']}
        />
      </RepositoryProvider>,
    );
    await screen.findByText('Road Roller');
    for (const item of DEMO_EQUIPMENT) {
      expect(screen.getByText(item.name)).toBeTruthy();
    }
    expect(screen.getByText('₹1,500 / hour')).toBeTruthy();
    const ids = screen.getAllByTestId(/^equipment-\d+$/).map(el => el.props.testID);
    expect(ids).toEqual(['equipment-5', 'equipment-4', 'equipment-3', 'equipment-2', 'equipment-1']);
  });

  test('submit: a valid form is saved and Home is told what was added (same as Version 1)', async () => {
    const repository = createMockEquipmentRepository({ initial: [] });
    const navigation = { popTo: jest.fn() } as unknown as AddProps['navigation'];
    await render(
      <RepositoryProvider repository={repository}>
        <AddEquipmentScreen navigation={navigation} route={{ key: 'Add-1', name: 'AddEquipment' } as AddProps['route']} />
      </RepositoryProvider>,
    );
    await fireEvent.changeText(screen.getByTestId('name-input'), 'Tower Crane');
    await fireEvent.changeText(screen.getByTestId('price-input'), '2500');
    await fireEvent.press(screen.getByTestId('submit-button'));

    await waitFor(() =>
      expect(navigation.popTo).toHaveBeenCalledWith('Home', { created: { id: 1, name: 'Tower Crane' } }),
    );
    expect(await repository.list()).toEqual([{ id: 1, name: 'Tower Crane', price_per_hour: 2500 }]);
  });

  test('submit then fetch: the new record appears on Home with the V1 success message', async () => {
    const repository = createMockEquipmentRepository();
    await repository.create({ name: 'Tower Crane', price_per_hour: 2500 });
    await render(
      <RepositoryProvider repository={repository}>
        <HomeScreen
          navigation={{ navigate: jest.fn() } as unknown as HomeProps['navigation']}
          route={{ key: 'Home-1', name: 'Home', params: { created: { id: 6, name: 'Tower Crane' } } } as HomeProps['route']}
        />
      </RepositoryProvider>,
    );
    expect(await screen.findByText('Added “Tower Crane”.')).toBeTruthy();
    expect(await screen.findByText('Tower Crane')).toBeTruthy();
  });
});
