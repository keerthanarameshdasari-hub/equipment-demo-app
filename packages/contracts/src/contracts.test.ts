import { describe, expect, test, vi } from 'vitest';
import {
  API_ROUTES,
  ApiClientError,
  EQUIPMENT_NAME_PATTERN,
  EQUIPMENT_RULES,
  createApiClient,
  hasAtMostTwoDecimals,
  isApiErrorBody,
  isEquipment,
  normalizeEquipmentName,
} from './index';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('equipment rules', () => {
  test('match the existing app and database limits', () => {
    expect(EQUIPMENT_RULES).toEqual({ nameMinLength: 2, nameMaxLength: 60, priceMax: 100000, listLimit: 50 });
  });

  test('name pattern accepts the documented characters only', () => {
    const re = new RegExp(EQUIPMENT_NAME_PATTERN, 'u');
    expect(re.test("JCB 3CX (Backhoe) / Loader - Ravi's & Co.")).toBe(true);
    expect(re.test('Grúa Torre')).toBe(true);
    expect(re.test('<script>')).toBe(false);
    expect(re.test('Drill; DROP TABLE')).toBe(false);
  });

  test('normalises whitespace and checks decimals', () => {
    expect(normalizeEquipmentName('  Mini   Excavator ')).toBe('Mini Excavator');
    expect(hasAtMostTwoDecimals(1499.5)).toBe(true);
    expect(hasAtMostTwoDecimals(0.1 + 0.2)).toBe(true);
    expect(hasAtMostTwoDecimals(1.234)).toBe(false);
  });

  test('isEquipment rejects malformed rows', () => {
    expect(isEquipment({ id: 1, name: 'Lift', price_per_hour: 900 })).toBe(true);
    expect(isEquipment({ id: '1', name: 'Lift', price_per_hour: 900 })).toBe(false);
    expect(isEquipment({ id: 1, name: ' ', price_per_hour: 900 })).toBe(false);
    expect(isEquipment({ id: 1, name: 'Lift', price_per_hour: '900' })).toBe(false);
    expect(isEquipment(null)).toBe(false);
  });

  test('isApiErrorBody recognises only the documented envelope', () => {
    expect(isApiErrorBody({ error: { code: 'not_found', message: 'Not found' }, requestId: 'r1' })).toBe(true);
    expect(isApiErrorBody({ error: 'Not found' })).toBe(false);
    expect(isApiErrorBody({ error: { code: 'teapot', message: 'x' } })).toBe(false);
  });
});

describe('API client', () => {
  test('lists equipment from the shared route and skips malformed rows', async () => {
    const fetchMock = vi.fn(async () =>
      json(200, { items: [{ id: 2, name: 'Mixer', price_per_hour: 650 }, { id: 'bad' }] }),
    );
    const client = createApiClient({ baseUrl: 'http://api.test/', fetch: fetchMock as unknown as typeof fetch });
    await expect(client.listEquipment()).resolves.toEqual([{ id: 2, name: 'Mixer', price_per_hour: 650 }]);
    expect(fetchMock).toHaveBeenCalledWith(`http://api.test${API_ROUTES.listEquipment.path}`, expect.objectContaining({ method: 'GET' }));
  });

  test('sends only known fields when creating', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual({ name: 'Lift', price_per_hour: 900 });
      return json(201, { id: 7, name: 'Lift', price_per_hour: 900 });
    });
    const client = createApiClient({ baseUrl: 'http://api.test', fetch: fetchMock as unknown as typeof fetch });
    const input = { name: 'Lift', price_per_hour: 900, admin: true } as unknown as { name: string; price_per_hour: number };
    await expect(client.createEquipment(input)).resolves.toEqual({ id: 7, name: 'Lift', price_per_hour: 900 });
  });

  test('maps the error envelope to ApiClientError', async () => {
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: (async () => json(400, { error: { code: 'invalid_request', message: 'Invalid request' }, requestId: 'req-1' })) as unknown as typeof fetch,
    });
    const error = await client.createEquipment({ name: 'x', price_per_hour: 1 }).catch(e => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ kind: 'http', status: 400, code: 'invalid_request', requestId: 'req-1' });
  });

  test('reports network failures and timeouts without leaking details', async () => {
    const offline = createApiClient({
      baseUrl: 'http://api.test',
      fetch: (async () => {
        throw new TypeError('getaddrinfo ENOTFOUND secret-host.internal');
      }) as unknown as typeof fetch,
    });
    const networkError = await offline.listEquipment().catch(e => e);
    expect(networkError).toMatchObject({ kind: 'network' });
    expect(networkError.message).not.toContain('secret-host');

    const slow = createApiClient({
      baseUrl: 'http://api.test',
      timeoutMs: 5,
      fetch: ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch,
    });
    await expect(slow.listEquipment()).rejects.toMatchObject({ kind: 'timeout' });
  });

  test('rejects responses that do not match the contract', async () => {
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: (async () => json(200, [{ id: 1 }])) as unknown as typeof fetch,
    });
    await expect(client.listEquipment()).rejects.toMatchObject({ kind: 'invalid_response' });
  });
});
