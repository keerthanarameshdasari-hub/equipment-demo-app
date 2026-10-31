import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import {
  API_ERROR_MESSAGES,
  API_ROUTES,
  EQUIPMENT_RULES,
  apiErrorSchema,
  equipmentListSchema,
  equipmentSchema,
  hasAtMostTwoDecimals,
  healthSchema,
  newEquipmentSchema,
  normalizeEquipmentName,
  type ApiErrorBody,
  type ApiErrorCode,
  type NewEquipment,
} from '@equipdemo/contracts';
import type { EquipmentStore } from './store';

export type AppOptions = {
  store: EquipmentStore;
  rateLimitMax?: number;
  corsOrigins?: readonly string[];
  logger?: FastifyServerOptions['logger'];
};

class HttpError extends Error {
  constructor(readonly statusCode: number) {
    super(`HTTP ${statusCode}`);
  }
}

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  400: 'invalid_request',
  404: 'not_found',
  429: 'rate_limited',
  503: 'unavailable',
};

function errorBody(status: number, requestId: string): ApiErrorBody {
  const code = CODE_BY_STATUS[status] ?? (status >= 400 && status < 500 ? 'invalid_request' : 'internal');
  return { error: { code, message: API_ERROR_MESSAGES[code] }, requestId };
}

/** Server-side business rules, applied after JSON Schema validation (never trust the client). */
export function normalizeNewEquipment(body: NewEquipment): NewEquipment {
  const name = normalizeEquipmentName(body.name);
  if (name.length < EQUIPMENT_RULES.nameMinLength || name.length > EQUIPMENT_RULES.nameMaxLength) {
    throw new HttpError(400);
  }
  if (!hasAtMostTwoDecimals(body.price_per_hour)) {
    throw new HttpError(400);
  }
  return { name, price_per_hour: Math.round(body.price_per_hour * 100) / 100 };
}

/**
 * Builds the HTTP app without listening, so tests use `app.inject()` (handbook ch. 3).
 * The caller owns the store and its connections.
 */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { store, rateLimitMax = 100, corsOrigins = [], logger = false } = options;

  const app = Fastify({
    logger:
      logger === false
        ? false
        : {
            ...(typeof logger === 'object' ? logger : {}),
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          },
    bodyLimit: 16384,
    trustProxy: false,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });

  app.addSchema(equipmentSchema);
  app.addSchema(apiErrorSchema);

  await app.register(cors, { origin: corsOrigins.length > 0 ? [...corsOrigins] : false });
  await app.register(rateLimit, {
    max: rateLimitMax,
    timeWindow: '1 minute',
    errorResponseBuilder: () => new HttpError(429),
  });

  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, req, reply) => {
    const status = err.validation
      ? 400
      : err.statusCode && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500;
    if (status >= 500) {
      req.log.error({ err }, 'Request failed');
    }
    reply.code(status).send(errorBody(status, req.id));
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send(errorBody(404, req.id));
  });

  const errorResponses = { 400: apiErrorSchema, 429: apiErrorSchema, 500: apiErrorSchema };

  app.get(API_ROUTES.healthLive.path, { schema: { response: { 200: healthSchema } } }, async () => ({ ok: true }));

  app.get(API_ROUTES.healthReady.path, { schema: { response: { 200: healthSchema, 503: healthSchema } } }, async (_req, reply) => {
    try {
      await store.ping();
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  app.get(
    API_ROUTES.listEquipment.path,
    { schema: { response: { 200: equipmentListSchema, ...errorResponses } } },
    async () => ({ items: await store.list(EQUIPMENT_RULES.listLimit) }),
  );

  app.post<{ Body: NewEquipment }>(
    API_ROUTES.createEquipment.path,
    { schema: { body: newEquipmentSchema, response: { 201: equipmentSchema, ...errorResponses } } },
    async (req, reply) => {
      const created = await store.create(normalizeNewEquipment(req.body));
      return reply.code(201).send(created);
    },
  );

  return app;
}
