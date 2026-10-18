import { describe, expect, test } from '@jest/globals';
import {
  isValidEquipment,
  toEquipment,
  validateEquipmentInput,
} from '../src/domain/equipment';

describe('validateEquipmentInput', () => {
  test('accepts valid input and normalises it', () => {
    expect(validateEquipmentInput({ name: '  Tower   Crane ', pricePerHour: ' 2500.50 ' })).toEqual({
      ok: true,
      value: { name: 'Tower Crane', price_per_hour: 2500.5 },
    });
  });

  test('requires both fields', () => {
    const result = validateEquipmentInput({ name: '   ', pricePerHour: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBe('Enter a name.');
      expect(result.errors.pricePerHour).toBe('Enter a price per hour.');
    }
  });

  test.each([
    ['A', 'at least'],
    ['x'.repeat(61), 'at most'],
    ['Crane <script>', 'Use letters'],
  ])('rejects invalid name %p', (name, message) => {
    const result = validateEquipmentInput({ name, pricePerHour: '100' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toContain(message);
    }
  });

  test.each([
    ['abc', 'Enter a number'],
    ['-5', 'Enter a number'],
    ['1.234', 'Enter a number'],
    ['1e3', 'Enter a number'],
    ['0', 'greater than 0'],
    ['100001', 'at most'],
  ])('rejects invalid price %p', (pricePerHour, message) => {
    const result = validateEquipmentInput({ name: 'Mini Excavator', pricePerHour });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.pricePerHour).toContain(message);
      expect(result.errors.name).toBeUndefined();
    }
  });
});

describe('isValidEquipment (rows from the backend)', () => {
  test('accepts a valid row', () => {
    expect(isValidEquipment({ id: 1, name: 'JCB Backhoe Loader', price_per_hour: 1500 })).toBe(true);
  });

  test('rejects a negative price', () => {
    expect(isValidEquipment({ id: 2, name: 'Mini Excavator', price_per_hour: -2000 })).toBe(false);
  });

  test('rejects an empty name', () => {
    expect(isValidEquipment({ id: 3, name: '   ', price_per_hour: 1800 })).toBe(false);
  });

  test('normalises numeric strings', () => {
    expect(toEquipment({ id: 4, name: ' Lift ', price_per_hour: '900.00' as unknown as number })).toEqual({
      id: 4,
      name: 'Lift',
      price_per_hour: 900,
    });
  });
});
