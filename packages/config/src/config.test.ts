import { describe, expect, test } from 'vitest';
import { ConfigError, bool, describeConfig, int, list, loadConfig, loadPublicConfig, optional, port, str, url } from './index';

const spec = {
  NODE_ENV: str({ oneOf: ['development', 'test', 'production'], default: 'development' }),
  PORT: port({ default: 3000 }),
  DATABASE_URL: url({ protocols: ['postgres:', 'postgresql:'], secret: true }),
  RATE_LIMIT_MAX: int({ min: 1, default: 100 }),
  TRUST_PROXY: bool({ default: false }),
  CORS_ORIGINS: list({ default: [], item: url({ protocols: ['http:', 'https:'] }) }),
  SENTRY_DSN: optional(url({ secret: true })),
};

describe('loadConfig', () => {
  test('parses, applies defaults and types values', () => {
    const config = loadConfig(spec, {
      DATABASE_URL: 'postgres://user:pw@localhost:5432/app',
      PORT: '8080',
      TRUST_PROXY: 'true',
      CORS_ORIGINS: 'http://localhost:5173, https://admin.example.com',
    });
    expect(config).toEqual({
      NODE_ENV: 'development',
      PORT: 8080,
      DATABASE_URL: 'postgres://user:pw@localhost:5432/app',
      RATE_LIMIT_MAX: 100,
      TRUST_PROXY: true,
      CORS_ORIGINS: ['http://localhost:5173', 'https://admin.example.com'],
      SENTRY_DSN: undefined,
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  test('reports every problem at once and never echoes values', () => {
    const secret = 'mysql://admin:hunter2@db.internal/app';
    let error: unknown;
    try {
      loadConfig(spec, { DATABASE_URL: secret, PORT: '99999', NODE_ENV: 'staging', RATE_LIMIT_MAX: 'lots' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const { problems, message } = error as ConfigError;
    expect(problems).toEqual([
      'NODE_ENV must be one of: development, test, production',
      'PORT must be <= 65535',
      'DATABASE_URL must use postgres: or postgresql:',
      'RATE_LIMIT_MAX must be an integer',
    ]);
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('staging');
  });

  test('requires values without a default', () => {
    expect(() => loadConfig(spec, {})).toThrow('DATABASE_URL is required');
    expect(() => loadConfig(spec, { DATABASE_URL: '   ' })).toThrow('DATABASE_URL is required');
  });
});

describe('describeConfig', () => {
  test('redacts secret fields for logging', () => {
    const config = loadConfig(spec, { DATABASE_URL: 'postgres://u:pw@h/db' });
    const described = describeConfig(spec, config);
    expect(described.DATABASE_URL).toBe('[redacted]');
    expect(described.SENTRY_DSN).toBeUndefined();
    expect(described.PORT).toBe(3000);
  });
});

describe('loadPublicConfig', () => {
  test('accepts public specs', () => {
    expect(loadPublicConfig({ API_BASE_URL: url() }, { API_BASE_URL: 'https://api.example.com' })).toEqual({
      API_BASE_URL: 'https://api.example.com',
    });
  });

  test('rejects any spec that contains a secret field, before reading values', () => {
    expect(() => loadPublicConfig({ DB: url({ secret: true }) }, {})).toThrow(/marked secret/);
  });
});
