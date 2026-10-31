import { int, list, port, str, url } from '@equipdemo/config';

/** Every variable the api reads. Validated once at start-up (see server.ts). */
export const apiConfigSpec = {
  NODE_ENV: str({ oneOf: ['development', 'test', 'production'], default: 'production' }),
  // Loopback by default (handbook ch. 5); containers set HOST=0.0.0.0 explicitly.
  HOST: str({ default: '127.0.0.1' }),
  PORT: port({ default: 3000 }),
  DATABASE_URL: url({ protocols: ['postgres:', 'postgresql:'], secret: true }),
  RATE_LIMIT_MAX: int({ min: 1, max: 100000, default: 100 }),
  CORS_ORIGINS: list({ default: [], item: url({ protocols: ['http:', 'https:'] }) }),
  LOG_LEVEL: str({ oneOf: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'], default: 'info' }),
};
