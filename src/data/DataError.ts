export type DataErrorKind =
  | 'network'
  | 'timeout'
  | 'permission'
  | 'not_found'
  | 'rejected'
  | 'unknown';

const MESSAGES: Record<DataErrorKind, string> = {
  network: "Can't reach the server. Check your internet connection and try again.",
  timeout: 'The server took too long to respond. Please try again.',
  permission: "The server didn't allow this request. Check the table's access policies (RLS).",
  not_found: "The equipment table wasn't found on the server.",
  rejected: 'The server rejected this record. Check the values and try again.',
  unknown: 'Something went wrong. Please try again.',
};

/**
 * The only error type the UI sees. `message` is safe to show to users;
 * `code` is the backend code (if any), kept for debugging. Neither contains
 * submitted values or credentials.
 */
export class DataError extends Error {
  readonly kind: DataErrorKind;
  readonly code?: string;

  constructor(kind: DataErrorKind, code?: string) {
    super(MESSAGES[kind]);
    this.name = 'DataError';
    this.kind = kind;
    this.code = code;
  }
}

export function toUserMessage(error: unknown): string {
  return error instanceof DataError ? error.message : MESSAGES.unknown;
}
