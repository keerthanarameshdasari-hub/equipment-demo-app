import { describe, expect, test, vi } from 'vitest';
import type { DomainEvent } from '@equipdemo/contracts';
import { backoffMs, runOnce, type Handlers, type OutboxRecord, type OutboxSource } from '../src/runner';
import { workerConfigSpec } from '../src/config';
import { loadConfig } from '@equipdemo/config';

const silent = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const NOW = new Date('2026-10-31T00:00:00Z');

function event(id: string): DomainEvent {
  return { id, type: 'equipment.created', occurredAt: NOW.toISOString(), data: { id: 1, name: 'Lift', price_per_hour: 900 } };
}

function memorySource(records: OutboxRecord[]) {
  const calls: string[] = [];
  const source: OutboxSource = {
    claim: async limit => records.splice(0, limit),
    complete: async id => {
      calls.push(`complete:${id}`);
    },
    retry: async (id, _error, at) => {
      calls.push(`retry:${id}@${at.toISOString()}`);
    },
    fail: async (id, error) => {
      calls.push(`fail:${id}:${error}`);
    },
  };
  return { source, calls };
}

const options = { batchSize: 10, leaseMs: 30_000, maxAttempts: 3, now: () => NOW, log: silent };

describe('runOnce', () => {
  test('delivers events and marks them complete', async () => {
    const handler = vi.fn(async () => {});
    const { source, calls } = memorySource([
      { id: 'e1', type: 'equipment.created', payload: event('e1'), attempts: 1 },
      { id: 'e2', type: 'equipment.created', payload: JSON.stringify(event('e2')), attempts: 1 },
    ]);
    const stats = await runOnce(source, { 'equipment.created': handler }, options);
    expect(stats).toEqual({ claimed: 2, completed: 2, retried: 0, failed: 0 });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(['complete:e1', 'complete:e2']);
  });

  test('retries a failing handler with exponential backoff', async () => {
    const handlers: Handlers = { 'equipment.created': async () => Promise.reject(new Error('SMTP down')) };
    const { source, calls } = memorySource([{ id: 'e1', type: 'equipment.created', payload: event('e1'), attempts: 2 }]);
    const stats = await runOnce(source, handlers, options);
    expect(stats.retried).toBe(1);
    expect(calls).toEqual([`retry:e1@${new Date(NOW.getTime() + 4000).toISOString()}`]);
  });

  test('dead-letters after max attempts', async () => {
    const handlers: Handlers = { 'equipment.created': async () => Promise.reject(new Error('still down')) };
    const { source, calls } = memorySource([{ id: 'e1', type: 'equipment.created', payload: event('e1'), attempts: 3 }]);
    expect((await runOnce(source, handlers, options)).failed).toBe(1);
    expect(calls).toEqual(['fail:e1:Error: still down']);
  });

  test('dead-letters malformed or mismatched events without calling handlers', async () => {
    const handler = vi.fn(async () => {});
    const { source, calls } = memorySource([
      { id: 'x1', type: 'equipment.deleted', payload: { ...event('x1'), type: 'equipment.deleted' }, attempts: 1 },
      { id: 'x2', type: 'equipment.created', payload: event('other-id'), attempts: 1 },
      { id: 'x3', type: 'equipment.created', payload: '{not json', attempts: 1 },
    ]);
    const stats = await runOnce(source, { 'equipment.created': handler }, options);
    expect(stats).toEqual({ claimed: 3, completed: 0, retried: 0, failed: 3 });
    expect(handler).not.toHaveBeenCalled();
    expect(calls.every(c => c.startsWith('fail:'))).toBe(true);
  });

  test('backoff is capped at five minutes', () => {
    expect([backoffMs(1), backoffMs(2), backoffMs(20)]).toEqual([2000, 4000, 300000]);
  });
});

describe('worker configuration', () => {
  test('defaults are applied and DATABASE_URL is required', () => {
    expect(() => loadConfig(workerConfigSpec, {})).toThrow('DATABASE_URL is required');
    const config = loadConfig(workerConfigSpec, { DATABASE_URL: 'postgres://u:p@h/db' });
    expect([config.BATCH_SIZE, config.MAX_ATTEMPTS, config.POLL_INTERVAL_MS]).toEqual([10, 5, 1000]);
  });
});
