import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";
import { sessionCookieOptions } from "./cookie";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refresh the Supabase session cookie on each request, so a server component or the auth
 * callback always sees a live token. A no-op until Supabase is configured, which is what
 * keeps a bare clone from erroring on every request.
 *
 * Called from `proxy.ts` — Next 16's name for what used to be `middleware.ts`.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Touching the user is what triggers the refresh when the access token is stale.
  await supabase.auth.getUser();
  expireLegacySession(request, response);
  return response;
}

/**
 * The cookie the session lived in before it moved to the apex (`lib/supabase/cookie.ts`):
 * `@supabase/ssr`'s default name, host-only, and good for 400 days. Nothing reads it any
 * more, and a browser that has one would otherwise carry its 3 kB on every request until
 * 2027. Cleared host-only, the scope it was written at; the prefix also catches the chunks
 * (`.0`, `.1`) and the PKCE verifier written under the same key.
 */
function expireLegacySession(request: NextRequest, response: NextResponse): void {
  const projectRef = SUPABASE_URL.replace(/^https?:\/\//, "").split(".")[0];
  const legacy = `sb-${projectRef}-auth-token`;
  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith(legacy)) response.cookies.delete({ name, path: "/" });
  }
}
