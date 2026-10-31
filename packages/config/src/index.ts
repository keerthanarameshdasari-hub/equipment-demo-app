/**
 * Validated environment configuration for every unit.
 *
 * - Each unit declares a spec; `loadConfig` validates ALL variables at start-up and
 *   throws one ConfigError listing every problem, so a misconfigured process never
 *   starts half-working.
 * - Error messages name variables, never their values.
 * - Fields marked `secret` are replaced by "[redacted]" in `describeConfig`, and
 *   `loadPublicConfig` refuses specs containing secrets (frontend bundles are public).
 *
 * No dependencies; runs in Node, browsers and React Native.
 */

export type Env = Record<string, string | undefined>;

type FieldBase<T> = {
  readonly kind: string;
  readonly secret: boolean;
  readonly optional: boolean;
  readonly defaultValue?: T;
  /** Returns the parsed value, or an error message that does not include the raw value. */
  parse(raw: string): { ok: true; value: T } | { ok: false; error: string };
};

export type Field<T> = FieldBase<T>;
export type Spec = Record<string, Field<unknown>>;

type ValueOf<F> = F extends Field<infer T> ? (F extends { optional: true } ? T | undefined : T) : never;
export type ConfigOf<S extends Spec> = { readonly [K in keyof S]: ValueOf<S[K]> };

type CommonOptions<T> = { default?: T; optional?: boolean; secret?: boolean };

function field<T>(
  kind: string,
  options: CommonOptions<T>,
  parse: Field<T>['parse'],
): Field<T> {
  return {
    kind,
    secret: options.secret ?? false,
    optional: options.optional ?? false,
    defaultValue: options.default,
    parse,
  };
}

export function str(options: CommonOptions<string> & { oneOf?: readonly string[]; minLength?: number } = {}) {
  return field<string>('string', options, raw => {
    if (options.minLength !== undefined && raw.length < options.minLength) {
      return { ok: false, error: `must be at least ${options.minLength} characters` };
    }
    if (options.oneOf && !options.oneOf.includes(raw)) {
      return { ok: false, error: `must be one of: ${options.oneOf.join(', ')}` };
    }
    return { ok: true, value: raw };
  });
}

export function int(options: CommonOptions<number> & { min?: number; max?: number } = {}) {
  return field<number>('integer', options, raw => {
    if (!/^-?\d+$/.test(raw)) {
      return { ok: false, error: 'must be an integer' };
    }
    const value = Number(raw);
    if (options.min !== undefined && value < options.min) {
      return { ok: false, error: `must be >= ${options.min}` };
    }
    if (options.max !== undefined && value > options.max) {
      return { ok: false, error: `must be <= ${options.max}` };
    }
    return { ok: true, value };
  });
}

export function port(options: CommonOptions<number> = {}) {
  return int({ ...options, min: 1, max: 65535 });
}

export function bool(options: CommonOptions<boolean> = {}) {
  return field<boolean>('boolean', options, raw => {
    if (['true', '1', 'yes'].includes(raw.toLowerCase())) {
      return { ok: true, value: true };
    }
    if (['false', '0', 'no'].includes(raw.toLowerCase())) {
      return { ok: true, value: false };
    }
    return { ok: false, error: 'must be true or false' };
  });
}

export function url(options: CommonOptions<string> & { protocols?: readonly string[] } = {}) {
  return field<string>('url', options, raw => {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return { ok: false, error: 'must be a valid URL' };
    }
    if (options.protocols && !options.protocols.includes(parsed.protocol)) {
      return { ok: false, error: `must use ${options.protocols.join(' or ')}` };
    }
    return { ok: true, value: raw };
  });
}

/** Comma-separated list, e.g. CORS_ORIGINS=https://a.example,https://b.example */
export function list(options: CommonOptions<readonly string[]> & { item?: Field<string> } = {}) {
  return field<readonly string[]>('list', options, raw => {
    const items = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (options.item) {
      for (const item of items) {
        const result = options.item.parse(item);
        if (!result.ok) {
          return { ok: false, error: `each item ${result.error}` };
        }
      }
    }
    return { ok: true, value: items };
  });
}

/** Same as `field` with `optional: true`, typed so the value may be undefined. */
export function optional<T>(f: Field<T>): Field<T> & { optional: true } {
  return { ...f, optional: true };
}

export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map(p => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

export function loadConfig<S extends Spec>(spec: S, env: Env): ConfigOf<S> {
  const problems: string[] = [];
  const result: Record<string, unknown> = {};

  for (const [name, f] of Object.entries(spec)) {
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') {
      if (f.defaultValue !== undefined) {
        result[name] = f.defaultValue;
      } else if (f.optional) {
        result[name] = undefined;
      } else {
        problems.push(`${name} is required`);
      }
      continue;
    }
    const parsed = f.parse(raw.trim());
    if (parsed.ok) {
      result[name] = parsed.value;
    } else {
      problems.push(`${name} ${parsed.error}`);
    }
  }

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }
  return Object.freeze(result) as ConfigOf<S>;
}

/**
 * For frontend bundles: everything in them is public, so a spec that contains a
 * secret field is a programming error and is rejected before any value is read.
 */
export function loadPublicConfig<S extends Spec>(spec: S, env: Env): ConfigOf<S> {
  const secrets = Object.entries(spec).filter(([, f]) => f.secret).map(([name]) => name);
  if (secrets.length > 0) {
    throw new ConfigError(secrets.map(name => `${name} is marked secret and cannot be used in a public (frontend) config`));
  }
  return loadConfig(spec, env);
}

/** A loggable view of a loaded config with secret values redacted. */
export function describeConfig<S extends Spec>(spec: S, config: ConfigOf<S>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(spec)) {
    const value = (config as Record<string, unknown>)[name];
    out[name] = spec[name]!.secret && value !== undefined ? '[redacted]' : value;
  }
  return out;
}
