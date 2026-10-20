// Version 2 feature: search the equipment list by name, with a result count.
import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { describeCount, filterEquipment } from '../src/domain/equipment';
import { RepositoryProvider } from '../src/data/RepositoryContext';
import { createMockEquipmentRepository, DEMO_EQUIPMENT } from '../src/data/mockEquipmentRepository';
import type { RootStackParamList } from '../src/navigation/types';
import { HomeScreen } from '../src/screens/HomeScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

describe('filterEquipment', () => {
  const names = (query: string) => filterEquipment(DEMO_EQUIPMENT, query).map(e => e.name);

  test('an empty or blank query returns every item, in the same order', () => {
    expect(filterEquipment(DEMO_EQUIPMENT, '')).toBe(DEMO_EQUIPMENT);
    expect(filterEquipment(DEMO_EQUIPMENT, '   ')).toBe(DEMO_EQUIPMENT);
  });

  test('matches part of a name, ignoring case and extra spaces', () => {
    expect(names('mini')).toEqual(['Mini Excavator']);
    expect(names('  ROLLER ')).toEqual(['Road Roller']);
    expect(names('er')).toEqual(['JCB Backhoe Loader', 'Concrete Mixer', 'Road Roller']);
  });

  test('every word must match, in any order', () => {
    expect(names('loader jcb')).toEqual(['JCB Backhoe Loader']);
    expect(names('jcb crane')).toEqual([]);
  });

  test('does not change the input list', () => {
    const copy = [...DEMO_EQUIPMENT];
    filterEquipment(DEMO_EQUIPMENT, 'mini');
    expect(DEMO_EQUIPMENT).toEqual(copy);
  });
});

describe('describeCount', () => {
  test.each([
    [5, 5, '5 items'],
    [1, 1, '1 item'],
    [2, 5, 'Showing 2 of 5'],
    [0, 5, 'Showing 0 of 5'],
  ])('%p of %p -> %p', (shown, total, text) => {
    expect(describeCount(shown, total)).toBe(text);
  });
});

describe('HomeScreen search', () => {
  async function renderHome(initial = DEMO_EQUIPMENT) {
    const repository = createMockEquipmentRepository({ initial });
    const navigation = { navigate: jest.fn() } as unknown as Props['navigation'];
    const route = { key: 'Home-1', name: 'Home' } as Props['route'];
    await render(
      <RepositoryProvider repository={repository}>
        <HomeScreen navigation={navigation} route={route} />
      </RepositoryProvider>,
    );
    await screen.findByText('Road Roller');
    return repository;
  }

  test('shows the total count, then filters as the user types', async () => {
    await renderHome();
    expect(screen.getByText('5 items')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('search-input'), 'exc');
    expect(screen.getByText('Mini Excavator')).toBeTruthy();
    expect(screen.queryByText('Road Roller')).toBeNull();
    expect(screen.getByText('Showing 1 of 5')).toBeTruthy();
  });

  test('explains when nothing matches, and Clear restores the full list', async () => {
    await renderHome();
    await fireEvent.changeText(screen.getByTestId('search-input'), 'helicopter');
    expect(screen.getByText('No equipment matches “helicopter”.')).toBeTruthy();
    expect(screen.getByText('Showing 0 of 5')).toBeTruthy();
    // The "no equipment yet" message is only for a truly empty table.
    expect(screen.queryByText(/No equipment yet/)).toBeNull();

    await fireEvent.press(screen.getByTestId('clear-search'));
    expect(screen.getByText('Road Roller')).toBeTruthy();
    expect(screen.getByText('5 items')).toBeTruthy();
  });

  test('keeps the search applied after a refresh brings in new data', async () => {
    const repository = await renderHome();
    await fireEvent.changeText(screen.getByTestId('search-input'), 'crane');
    expect(screen.getByText('Showing 0 of 5')).toBeTruthy();

    await repository.create({ name: 'Tower Crane', price_per_hour: 2500 });
    await fireEvent.press(screen.getByTestId('refresh-button'));
    expect(await screen.findByText('Tower Crane')).toBeTruthy();
    expect(screen.getByText('Showing 1 of 6')).toBeTruthy();
  });

  test('no search box or count when the table is empty (Version 1 empty state unchanged)', async () => {
    const repository = createMockEquipmentRepository({ initial: [] });
    const navigation = { navigate: jest.fn() } as unknown as Props['navigation'];
    await render(
      <RepositoryProvider repository={repository}>
        <HomeScreen navigation={navigation} route={{ key: 'Home-1', name: 'Home' } as Props['route']} />
      </RepositoryProvider>,
    );
    expect(await screen.findByText('No equipment yet. Add the first one.')).toBeTruthy();
    expect(screen.queryByTestId('search-input')).toBeNull();
    expect(screen.queryByTestId('result-count')).toBeNull();
  });
});
