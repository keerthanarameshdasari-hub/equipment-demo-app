import { describe, expect, test } from 'vitest';
import { createWorkforceApi } from './api';
import { summarizeFleet } from './fleetSummary';

const fleet = [
  { id: 1, name: 'JCB Backhoe Loader', price_per_hour: 1500 },
  { id: 2, name: 'Mini Excavator', price_per_hour: 2000 },
  { id: 3, name: 'Concrete Mixer', price_per_hour: 650.25 },
];

describe('summarizeFleet', () => {
  test('summarises count, total rate, most expensive and sign-off list', () => {
    expect(summarizeFleet(fleet)).toEqual({
      count: 3,
      totalHourlyRate: 4150.25,
      mostExpensive: fleet[1],
      needsSignOff: [fleet[1], fleet[0]],
    });
  });

  test('handles an empty fleet', () => {
    expect(summarizeFleet([])).toEqual({ count: 0, totalHourlyRate: 0, mostExpensive: null, needsSignOff: [] });
  });
});

describe('createWorkforceApi', () => {
  test('requires a valid API base URL', () => {
    expect(() => createWorkforceApi({})).toThrow('WORKFORCE_API_BASE_URL is required');
  });

  test('uses the shared contract client', async () => {
    const api = createWorkforceApi({ WORKFORCE_API_BASE_URL: 'https://api.example.com' }, (async (input: string) => {
      expect(input).toBe('https://api.example.com/v1/equipment');
      return new Response(JSON.stringify({ items: fleet }), { status: 200 });
    }) as unknown as typeof fetch);
    expect(summarizeFleet(await api.listEquipment()).count).toBe(3);
  });
});
