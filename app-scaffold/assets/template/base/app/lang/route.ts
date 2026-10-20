import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_LANG,
  isLang,
  isSitePage,
  LANG_COOKIE,
  LANG_COOKIE_MAX_AGE,
  pathFor,
} from "@/lib/i18n";

/**
 * The language switcher, as a redirect rather than a click handler.
 *
 * It exists because the choice has to outlive the request: the proxy sends a reader in
 * Almaty to `/ru` from their IP address, so a bare link to `/` would bounce them straight
 * back and the English link would look broken. Setting a cookie is the only thing that
 * beats the guess, and doing it here rather than in a `"use client"` component keeps six
 * otherwise static pages free of JavaScript.
 *
 * **Neither parameter is a URL.** `page` is a name from a fixed list and `to` is a
 * language tag, and the path is built here from both. A `?next=` carrying a path would be
 * an open redirect on a domain that also runs a checkout — the one place a phishing link
 * that starts on your own origin is worth something.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const to = params.get("to");
  const page = params.get("page");

  const lang = isLang(to) ? to : DEFAULT_LANG;
  const target = pathFor(lang, isSitePage(page) ? page : "home");

  const response = NextResponse.redirect(new URL(target, request.url));
  response.cookies.set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: LANG_COOKIE_MAX_AGE,
    sameSite: "lax",
    // Read by the proxy on the server, never by a script. It holds a language tag and
    // nothing else, which is why it needs no consent banner to sit beside it.
    httpOnly: true,
  });
  return response;
}
