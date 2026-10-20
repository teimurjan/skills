import "server-only";
import { cookies } from "next/headers";
import { createServerClient as createSsrServerClient, type CookieOptions } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";
import { sessionCookieOptions } from "./cookie";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Server Supabase client bound to the request cookies, for server components and the
 * auth callback. Not used by `app/api/**` — those authenticate the iOS app by bearer
 * token through `auth.ts`, and must keep doing so. */
export async function createServerClient() {
  const cookieStore = await cookies();
  return createSsrServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        // A Server Component's cookie store is read-only, so this throws there. `proxy.ts`
        // refreshes the session on every request instead, which is why losing this write
        // costs nothing.
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* no-op during an RSC render */
        }
      },
    },
  });
}
