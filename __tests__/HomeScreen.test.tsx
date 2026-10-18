import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RepositoryProvider } from '../src/data/RepositoryContext';
import {
  createMockEquipmentRepository,
  type MockOptions,
} from '../src/data/mockEquipmentRepository';
import type { RootStackParamList } from '../src/navigation/types';
import { HomeScreen } from '../src/screens/HomeScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

async function renderHome(options: MockOptions = {}, params?: Props['route']['params']) {
  const repository = createMockEquipmentRepository(options);
  const navigation = { navigate: jest.fn() } as unknown as Props['navigation'];
  const route = { key: 'Home-1', name: 'Home', params } as Props['route'];
  await render(
    <RepositoryProvider repository={repository}>
      <HomeScreen navigation={navigation} route={route} />
    </RepositoryProvider>,
  );
  return { repository, navigation };
}

describe('HomeScreen', () => {
  test('shows the app name, a loading state, then the list', async () => {
    await renderHome();
    expect(screen.getByText('equipDemo')).toBeTruthy();
    expect(await screen.findByText('JCB Backhoe Loader')).toBeTruthy();
    expect(screen.getByText('₹1,500 / hour')).toBeTruthy();
    expect(screen.getByText(/Demo data/)).toBeTruthy();
  });

  test('shows the empty state', async () => {
    await renderHome({ initial: [] });
    expect(await screen.findByText(/No equipment yet/)).toBeTruthy();
  });

  test('shows an understandable error and recovers on retry', async () => {
    const { repository } = await renderHome({ failList: 'network' });
    expect(await screen.findByText(/Can't reach the server/)).toBeTruthy();

    repository.setFailures({});
    await fireEvent.press(screen.getByTestId('retry-button'));
    expect(await screen.findByText('Mini Excavator')).toBeTruthy();
    expect(screen.queryByTestId('error-message')).toBeNull();
  });

  test('refresh reloads the list', async () => {
    const { repository } = await renderHome({ initial: [] });
    await screen.findByTestId('empty-message');

    await repository.create({ name: 'Tower Crane', price_per_hour: 2500 });
    await fireEvent.press(screen.getByTestId('refresh-button'));
    expect(await screen.findByText('Tower Crane')).toBeTruthy();
  });

  test('a failed refresh keeps the list and shows the error', async () => {
    const { repository } = await renderHome();
    await screen.findByText('Road Roller');

    repository.setFailures({ failList: 'permission' });
    await fireEvent.press(screen.getByTestId('refresh-button'));
    expect(await screen.findByText(/didn't allow/)).toBeTruthy();
    expect(screen.getByText('Road Roller')).toBeTruthy();
  });

  test('confirms a newly created record', async () => {
    await renderHome({}, { created: { id: 9, name: 'Tower Crane' } });
    expect(await screen.findByText('Added “Tower Crane”.')).toBeTruthy();
  });

  test('opens the form', async () => {
    const { navigation } = await renderHome();
    await screen.findByText('Road Roller');
    await fireEvent.press(screen.getByTestId('add-button'));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('AddEquipment'));
  });
});
