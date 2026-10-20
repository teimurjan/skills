import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

/**
 * Resolve the authenticated user from the iOS app's
 * `Authorization: Bearer <access_token>` header. The token is verified against
 * Supabase Auth rather than merely decoded, so it is safe to trust.
 *
 * There is no cookie path: this backend serves the app, not a signed-in web
 * session, so it needs no `@supabase/ssr` and no request-scoped cookie store.
 */
export async function getUserFromRequest(request: Request): Promise<User | null> {
  if (!isSupabaseConfigured) return null;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await supabase.auth.getUser(header.slice(7));
  return data.user ?? null;
}
