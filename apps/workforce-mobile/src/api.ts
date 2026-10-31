import { createApiClient, type ApiClient } from '@equipdemo/contracts';
import { loadPublicConfig, url } from '@equipdemo/config';

/** Public build-time config; the native shell will supply these values at build time. */
export const workforceConfigSpec = {
  WORKFORCE_API_BASE_URL: url({ protocols: ['http:', 'https:'] }),
};

/** The only way this app talks to the backend: the shared contract client. */
export function createWorkforceApi(env: Record<string, string | undefined>, fetchImpl?: typeof fetch): ApiClient {
  const config = loadPublicConfig(workforceConfigSpec, env);
  return createApiClient({ baseUrl: config.WORKFORCE_API_BASE_URL, fetch: fetchImpl });
}
