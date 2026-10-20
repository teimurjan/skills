import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { withLogging } from "@/lib/log";

export const dynamic = "force-dynamic";

/** The caller's address as Vercel's edge saw it. `x-real-ip` is the edge's own; the first
 * hop of `x-forwarded-for` is the fallback. Anything that is not an address is no answer. */
function clientIp(headers: Headers): string | null {
  const candidate =
    headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return isIP(candidate) ? candidate : null;
}

/**
 * The buyer's IP for the server Purchase. The funnel stamps it into Paddle's `customData`,
 * because the webhook that reports the sale to Meta is called by Paddle and never sees it.
 */
export const GET = withLogging("client-ip", async (request: Request) =>
  NextResponse.json(
    { ip: clientIp(request.headers) },
    { headers: { "Cache-Control": "no-store" } },
  ),
);
