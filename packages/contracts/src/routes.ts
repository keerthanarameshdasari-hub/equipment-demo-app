/** Every HTTP route of the API. Clients and the server both read paths from here. */
export const API_ROUTES = {
  healthLive: { method: 'GET', path: '/health/live' },
  healthReady: { method: 'GET', path: '/health/ready' },
  listEquipment: { method: 'GET', path: '/v1/equipment' },
  createEquipment: { method: 'POST', path: '/v1/equipment' },
} as const;

export type ApiRouteName = keyof typeof API_ROUTES;

export type HealthBody = { ok: boolean };

export const healthSchema = {
  $id: 'Health',
  type: 'object',
  additionalProperties: false,
  required: ['ok'],
  properties: { ok: { type: 'boolean' } },
} as const;
