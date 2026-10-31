/**
 * The single error envelope every API error uses (handbook ch. 3: "use a single
 * documented error envelope"). `message` is safe to show; it never contains
 * submitted values, SQL, stack traces or credentials.
 */
export const API_ERROR_CODES = [
  'invalid_request',
  'not_found',
  'rate_limited',
  'unavailable',
  'internal',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiErrorBody = {
  error: { code: ApiErrorCode; message: string };
  requestId: string;
};

export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  invalid_request: 'Invalid request',
  not_found: 'Not found',
  rate_limited: 'Too many requests',
  unavailable: 'Service unavailable',
  internal: 'Internal server error',
};

export const apiErrorSchema = {
  $id: 'ApiError',
  type: 'object',
  additionalProperties: false,
  required: ['error', 'requestId'],
  properties: {
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', enum: [...API_ERROR_CODES] },
        message: { type: 'string' },
      },
    },
    requestId: { type: 'string' },
  },
} as const;

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const error = (value as { error?: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    (API_ERROR_CODES as readonly string[]).includes((error as { code?: unknown }).code as string) &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}
