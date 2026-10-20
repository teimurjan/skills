/** Shared Supabase env. Uses the new API key format (publishable + secret), not
 * the legacy anon/service_role JWTs. The app runs without these set — payments
 * and generation quota simply stay inert until they are configured. */

/** Supabase clients want the bare project origin (e.g. https://xxx.supabase.co).
 * Tolerate a pasted REST path like `.../rest/v1/` by reducing to origin. */
function projectOrigin(raw: string): string {
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
}

export const SUPABASE_URL = projectOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
