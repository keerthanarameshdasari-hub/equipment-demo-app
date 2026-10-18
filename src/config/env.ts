export type SupabaseConfig = { url: string; publishableKey: string };

/**
 * Reads a value that babel.config.js inlines at build time. If the variable was
 * not set during the build, the expression stays as `process.env.X`, and
 * `process` may not exist in the app at runtime, so the read is guarded.
 */
function read(getValue: () => string | undefined): string | undefined {
  try {
    const value = getValue();
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Supabase configuration, or null when not configured so the app can fall
 * back to demo data instead of crashing at launch.
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  const url = read(() => process.env.SUPABASE_URL);
  const publishableKey = read(() => process.env.SUPABASE_PUBLISHABLE_KEY);
  if (!url || !publishableKey) {
    return null;
  }
  return { url, publishableKey };
}
