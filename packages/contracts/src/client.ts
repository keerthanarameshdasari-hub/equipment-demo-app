import { isEquipment, type Equipment, type NewEquipment } from './equipment';
import { isApiErrorBody, type ApiErrorCode } from './errors';
import { API_ROUTES, type HealthBody } from './routes';

/**
 * Typed HTTP client for the API, shared by every frontend (admin-web,
 * workforce-mobile, and later customer-mobile). Uses only `fetch`, so it runs in
 * browsers, React Native and Node. It knows paths and shapes, nothing about how
 * the server is implemented.
 */

export type ApiClientErrorKind = 'network' | 'timeout' | 'http' | 'invalid_response';

export class ApiClientError extends Error {
  readonly kind: ApiClientErrorKind;
  readonly status?: number;
  readonly code?: ApiErrorCode;
  readonly requestId?: string;

  constructor(
    kind: ApiClientErrorKind,
    message: string,
    details: { status?: number; code?: ApiErrorCode; requestId?: string } = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.kind = kind;
    this.status = details.status;
    this.code = details.code;
    this.requestId = details.requestId;
  }
}

export type ApiClientOptions = {
  /** e.g. https://api.example.com (no trailing slash needed). */
  baseUrl: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export type ApiClient = {
  health(): Promise<HealthBody>;
  listEquipment(): Promise<Equipment[]>;
  createEquipment(input: NewEquipment): Promise<Equipment>;
};

export const DEFAULT_TIMEOUT_MS = 10_000;

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request(path: string, init: { method: string; body?: unknown }): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: init.body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        // Cast: React Native's and the DOM's AbortSignal typings differ slightly; the runtime object is the same.
        signal: controller.signal as RequestInit['signal'],
      });
    } catch {
      throw controller.signal.aborted
        ? new ApiClientError('timeout', 'The server took too long to respond.')
        : new ApiClientError('network', "Can't reach the server.");
    } finally {
      clearTimeout(timer);
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      if (isApiErrorBody(body)) {
        throw new ApiClientError('http', body.error.message, {
          status: response.status,
          code: body.error.code,
          requestId: body.requestId,
        });
      }
      throw new ApiClientError('http', `Request failed (${response.status}).`, { status: response.status });
    }
    return body;
  }

  return {
    async health() {
      const body = await request(API_ROUTES.healthLive.path, { method: API_ROUTES.healthLive.method });
      if (typeof body !== 'object' || body === null || typeof (body as HealthBody).ok !== 'boolean') {
        throw new ApiClientError('invalid_response', 'Unexpected response from the server.');
      }
      return body as HealthBody;
    },

    async listEquipment() {
      const body = await request(API_ROUTES.listEquipment.path, { method: API_ROUTES.listEquipment.method });
      const items = (body as { items?: unknown } | null)?.items;
      if (!Array.isArray(items)) {
        throw new ApiClientError('invalid_response', 'Unexpected response from the server.');
      }
      // Skip malformed rows rather than failing the whole list (same rule as customer-mobile).
      return items.filter(isEquipment);
    },

    async createEquipment(input) {
      const body = await request(API_ROUTES.createEquipment.path, {
        method: API_ROUTES.createEquipment.method,
        body: { name: input.name, price_per_hour: input.price_per_hour },
      });
      if (!isEquipment(body)) {
        throw new ApiClientError('invalid_response', 'Unexpected response from the server.');
      }
      return body;
    },
  };
}
