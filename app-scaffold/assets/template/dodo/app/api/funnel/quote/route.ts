import { NextResponse } from "next/server";
import { previewPlanQuote } from "@/lib/checkoutSession";
import { logFields, withLogging } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * The plan cards' prices in the visitor's own currency, for the web funnel's checkout step.
 *
 * Unauthenticated: the price is public, and the step asks before there is anyone signed
 * in to ask as. Vercel resolves the country at the edge; locally there is no header and
 * Dodo quotes its default currency.
 */
export const GET = withLogging("funnel.quote", async (request: Request) => {
  const country = request.headers.get("x-vercel-ip-country")?.toUpperCase();
  const result = await previewPlanQuote(country);
  logFields({ country: country ?? null, quoted: result.configured && result.quote !== null });
  return NextResponse.json(result);
});
