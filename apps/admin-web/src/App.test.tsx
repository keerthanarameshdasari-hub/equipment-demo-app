import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiClientError, type ApiClient } from '@equipdemo/contracts';
import { App, errorMessage } from './App';
import { readAdminConfig } from './config';

const client: ApiClient = {
  health: async () => ({ ok: true }),
  listEquipment: async () => [],
  createEquipment: async () => ({ id: 1, name: 'x', price_per_hour: 1 }),
};

describe('App', () => {
  test('renders the equipment table with a count', () => {
    const html = renderToStaticMarkup(
      <App
        client={client}
        initialState={{
          status: 'ready',
          items: [
            { id: 2, name: 'Mini Excavator', price_per_hour: 2000 },
            { id: 1, name: 'JCB Backhoe Loader', price_per_hour: 1500.5 },
          ],
        }}
      />,
    );
    expect(html).toContain('<caption>2 items</caption>');
    expect(html).toContain('Mini Excavator');
    expect(html).toContain('₹1,500.5');
  });

  test('shows loading first, and errors with the request id', () => {
    expect(renderToStaticMarkup(<App client={client} />)).toContain('Loading');
    const error = new ApiClientError('http', 'Too many requests', { status: 429, code: 'rate_limited', requestId: 'req-9' });
    expect(errorMessage(error)).toBe('Too many requests (request req-9)');
    expect(errorMessage(new Error('internal detail'))).toBe('Something went wrong.');
  });

  test('escapes names coming from the API', () => {
    const html = renderToStaticMarkup(
      <App client={client} initialState={{ status: 'ready', items: [{ id: 1, name: '<img src=x>', price_per_hour: 1 }] }} />,
    );
    expect(html).not.toContain('<img');
  });
});

describe('admin config', () => {
  test('defaults to the local api and validates the URL', () => {
    expect(readAdminConfig({}).VITE_API_BASE_URL).toBe('http://127.0.0.1:3000');
    expect(() => readAdminConfig({ VITE_API_BASE_URL: 'ftp://x' })).toThrow(/must use/);
  });
});
