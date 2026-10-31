import { loadPublicConfig, url } from '@equipdemo/config';

/** Public build-time config (VITE_* values are compiled into the bundle). */
export const adminConfigSpec = {
  VITE_API_BASE_URL: url({ protocols: ['http:', 'https:'], default: 'http://127.0.0.1:3000' }),
};

export function readAdminConfig(env: Record<string, string | undefined>) {
  return loadPublicConfig(adminConfigSpec, env);
}
