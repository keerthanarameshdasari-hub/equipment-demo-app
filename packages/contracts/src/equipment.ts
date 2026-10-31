/**
 * Equipment resource, version 1 of the HTTP contract.
 *
 * The shape matches what customer-mobile already uses (numeric id, snake_case
 * price_per_hour) so no existing client changes meaning. Rules match
 * supabase/schema.sql and src/domain/equipment.ts in customer-mobile.
 */

/** An equipment record as returned by the API. */
export type Equipment = {
  id: number;
  name: string;
  price_per_hour: number;
};

/** Request body for creating a record (the server assigns `id`). */
export type NewEquipment = {
  name: string;
  price_per_hour: number;
};

export const EQUIPMENT_RULES = {
  nameMinLength: 2,
  nameMaxLength: 60,
  priceMax: 100000,
  /** Maximum number of records returned by the list endpoint. */
  listLimit: 50,
} as const;

/**
 * Allowed name characters: Latin letters (incl. accented), digits, spaces and . , ' & ( ) / -
 * Explicit ranges instead of \p{L} (Hermes support is unreliable). Used as a JSON Schema
 * `pattern` and by `normalizeEquipmentName` consumers.
 */
export const EQUIPMENT_NAME_PATTERN = "^[A-Za-z0-9À-ɏ .,'&()/-]+$";

/** Trims and collapses internal whitespace (the canonical stored form of a name). */
export function normalizeEquipmentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** True when a price has at most two decimal places (numeric(10,2) in the database). */
export function hasAtMostTwoDecimals(price: number): boolean {
  return Number.isFinite(price) && Math.abs(Math.round(price * 100) - price * 100) < 1e-6;
}

/** JSON Schema for the create request. Extra properties are rejected. */
export const newEquipmentSchema = {
  $id: 'NewEquipment',
  type: 'object',
  additionalProperties: false,
  required: ['name', 'price_per_hour'],
  properties: {
    name: {
      type: 'string',
      minLength: EQUIPMENT_RULES.nameMinLength,
      // Before normalisation; the server re-checks length after collapsing whitespace.
      maxLength: 200,
      pattern: EQUIPMENT_NAME_PATTERN,
    },
    price_per_hour: {
      type: 'number',
      exclusiveMinimum: 0,
      maximum: EQUIPMENT_RULES.priceMax,
    },
  },
} as const;

/** JSON Schema for one record in a response. */
export const equipmentSchema = {
  $id: 'Equipment',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'price_per_hour'],
  properties: {
    id: { type: 'integer', minimum: 1 },
    name: { type: 'string' },
    price_per_hour: { type: 'number' },
  },
} as const;

/** JSON Schema for the list response. */
export const equipmentListSchema = {
  $id: 'EquipmentList',
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: { type: 'array', maxItems: EQUIPMENT_RULES.listLimit, items: equipmentSchema },
  },
} as const;

export type EquipmentList = { items: Equipment[] };

/** Runtime guard for untrusted data (e.g. a response body in a client). */
export function isEquipment(value: unknown): value is Equipment {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    Number.isInteger(v.id) &&
    (v.id as number) > 0 &&
    typeof v.name === 'string' &&
    v.name.trim().length > 0 &&
    typeof v.price_per_hour === 'number' &&
    Number.isFinite(v.price_per_hour) &&
    v.price_per_hour >= 0
  );
}
