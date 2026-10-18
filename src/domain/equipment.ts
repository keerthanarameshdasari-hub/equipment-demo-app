/** An equipment record as stored in the `equipment` table. */
export type Equipment = {
  id: number;
  name: string;
  price_per_hour: number;
};

/** The values needed to create a record (the database assigns `id`). */
export type NewEquipment = {
  name: string;
  price_per_hour: number;
};

/** Raw text from the form, before validation. */
export type EquipmentFormInput = {
  name: string;
  pricePerHour: string;
};

export type EquipmentFormErrors = Partial<Record<keyof EquipmentFormInput, string>>;

export type ValidationResult =
  | { ok: true; value: NewEquipment }
  | { ok: false; errors: EquipmentFormErrors };

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 60;
export const PRICE_MAX = 100000;

// Latin letters (incl. accented), digits, spaces and a few common punctuation marks.
// Explicit ranges rather than \p{L}, which Hermes does not reliably support.
const NAME_PATTERN = /^[A-Za-z0-9À-ɏ .,'&()/-]+$/;
// Up to 6 digits, optionally followed by up to 2 decimal places.
const PRICE_PATTERN = /^\d{1,6}(\.\d{1,2})?$/;

/** Validates form input and converts it to a record ready to submit. */
export function validateEquipmentInput(input: EquipmentFormInput): ValidationResult {
  const errors: EquipmentFormErrors = {};

  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length === 0) {
    errors.name = 'Enter a name.';
  } else if (name.length < NAME_MIN_LENGTH) {
    errors.name = `Name must be at least ${NAME_MIN_LENGTH} characters.`;
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.name = `Name must be at most ${NAME_MAX_LENGTH} characters.`;
  } else if (!NAME_PATTERN.test(name)) {
    errors.name = 'Use letters, numbers, spaces and . , \' & ( ) / - only.';
  }

  const priceText = input.pricePerHour.trim();
  let price = NaN;
  if (priceText.length === 0) {
    errors.pricePerHour = 'Enter a price per hour.';
  } else if (!PRICE_PATTERN.test(priceText)) {
    errors.pricePerHour = 'Enter a number, e.g. 1500 or 1499.50.';
  } else {
    price = Number(priceText);
    if (price <= 0) {
      errors.pricePerHour = 'Price must be greater than 0.';
    } else if (price > PRICE_MAX) {
      errors.pricePerHour = `Price must be at most ${PRICE_MAX.toLocaleString('en-IN')}.`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { name, price_per_hour: price } };
}

/**
 * Guards against malformed rows coming back from the backend.
 * Rows that fail are skipped rather than crashing the list.
 */
export function isValidEquipment(item: {
  id?: unknown;
  name?: unknown;
  price_per_hour?: unknown;
}): item is Equipment {
  return (
    item.id != null &&
    typeof item.name === 'string' &&
    item.name.trim().length > 0 &&
    item.price_per_hour != null &&
    Number.isFinite(Number(item.price_per_hour)) &&
    Number(item.price_per_hour) >= 0
  );
}

/** Normalises a validated row (e.g. numeric columns returned as strings). */
export function toEquipment(item: Equipment): Equipment {
  return {
    id: Number(item.id),
    name: item.name.trim(),
    price_per_hour: Number(item.price_per_hour),
  };
}

export function formatPricePerHour(price: number): string {
  return `₹${price.toLocaleString('en-IN')} / hour`;
}
