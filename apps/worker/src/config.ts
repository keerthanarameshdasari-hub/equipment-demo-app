import { int, str, url } from '@equipdemo/config';

export const workerConfigSpec = {
  NODE_ENV: str({ oneOf: ['development', 'test', 'production'], default: 'production' }),
  DATABASE_URL: url({ protocols: ['postgres:', 'postgresql:'], secret: true }),
  POLL_INTERVAL_MS: int({ min: 100, max: 60_000, default: 1000 }),
  BATCH_SIZE: int({ min: 1, max: 100, default: 10 }),
  LEASE_MS: int({ min: 1000, max: 600_000, default: 30_000 }),
  MAX_ATTEMPTS: int({ min: 1, max: 50, default: 5 }),
};
