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
import { AddEquipmentScreen } from '../src/screens/AddEquipmentScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'AddEquipment'>;

async function renderForm(options: MockOptions = {}) {
  const repository = createMockEquipmentRepository({ initial: [], ...options });
  const createSpy = jest.spyOn(repository, 'create');
  const navigation = { popTo: jest.fn() } as unknown as Props['navigation'];
  const route = { key: 'AddEquipment-1', name: 'AddEquipment' } as Props['route'];
  await render(
    <RepositoryProvider repository={repository}>
      <AddEquipmentScreen navigation={navigation} route={route} />
    </RepositoryProvider>,
  );
  return { repository, createSpy, navigation };
}

async function fill(name: string, price: string) {
  await fireEvent.changeText(screen.getByTestId('name-input'), name);
  await fireEvent.changeText(screen.getByTestId('price-input'), price);
}

describe('AddEquipmentScreen', () => {
  test('shows validation errors and does not submit empty input', async () => {
    const { createSpy } = await renderForm();
    await fireEvent.press(screen.getByTestId('submit-button'));

    expect(await screen.findByText('Enter a name.')).toBeTruthy();
    expect(screen.getByText('Enter a price per hour.')).toBeTruthy();
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('rejects a non-numeric price', async () => {
    const { createSpy } = await renderForm();
    await fill('Tower Crane', 'abc');
    await fireEvent.press(screen.getByTestId('submit-button'));

    expect(await screen.findByText(/Enter a number/)).toBeTruthy();
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('clears a field error when the user edits that field', async () => {
    await renderForm();
    await fireEvent.press(screen.getByTestId('submit-button'));
    await screen.findByText('Enter a name.');

    await fireEvent.changeText(screen.getByTestId('name-input'), 'Crane');
    expect(screen.queryByText('Enter a name.')).toBeNull();
  });

  test('submits valid input and returns to Home with the created record', async () => {
    const { createSpy, navigation, repository } = await renderForm();
    await fill('  Tower Crane ', '2500');
    await fireEvent.press(screen.getByTestId('submit-button'));

    await waitFor(() =>
      expect(navigation.popTo).toHaveBeenCalledWith('Home', {
        created: { id: 1, name: 'Tower Crane' },
      }),
    );
    expect(createSpy).toHaveBeenCalledWith({ name: 'Tower Crane', price_per_hour: 2500 });
    expect(await repository.list()).toEqual([{ id: 1, name: 'Tower Crane', price_per_hour: 2500 }]);
  });

  test('shows an understandable error when the server rejects the submit', async () => {
    const { navigation } = await renderForm({ failCreate: 'permission' });
    await fill('Tower Crane', '2500');
    await fireEvent.press(screen.getByTestId('submit-button'));

    expect(await screen.findByText(/didn't allow this request/)).toBeTruthy();
    expect(navigation.popTo).not.toHaveBeenCalled();
    // The form keeps the user's input so they can retry.
    expect(screen.getByDisplayValue('Tower Crane')).toBeTruthy();
  });
});
