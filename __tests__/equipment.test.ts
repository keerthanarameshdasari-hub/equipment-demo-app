
import { describe, expect, test } from '@jest/globals';

describe('Equipment data validation', () => {
  const isValidEquipment = (item: {
    id?: number;
    name?: string;
    price_per_hour?: number | string;
  }) =>
    item.id != null &&
    typeof item.name === 'string' &&
    item.name.trim().length > 0 &&
    item.price_per_hour != null &&
    Number.isFinite(Number(item.price_per_hour)) &&
    Number(item.price_per_hour) >= 0;

  test('accepts valid equipment', () => {
    expect(
      isValidEquipment({
        id: 1,
        name: 'JCB Backhoe Loader',
        price_per_hour: 1500,
      })
    ).toBe(true);
  });

  test('rejects a negative price', () => {
    expect(
      isValidEquipment({
        id: 2,
        name: 'Mini Excavator',
        price_per_hour: -2000,
      })
    ).toBe(false);
  });

  test('rejects an empty equipment name', () => {
    expect(
      isValidEquipment({
        id: 3,
        name: '   ',
        price_per_hour: 1800,
      })
    ).toBe(false);
  });
});
