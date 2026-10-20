import { NextResponse } from "next/server";
import { readEntitlement } from "@/lib/entitlements";
import { getUserFromRequest } from "@/lib/supabase/auth";
import { logFields, withLogging } from "@/lib/log";

export const dynamic = "force-dynamic";

/** Whether the signed-in account holds a live subscription. Keyed on the user
 * rather than a transaction id, so the answer follows the account onto any
 * device they sign in on — and across both billers, since a web subscription
 * unlocks the app the same way an in-app one does.
 *
 * `provider` is additive: shipped binaries decode `paid`/`expiresAt` and ignore
 * it. It says whether "Manage subscription" should open StoreKit's sheet or
 * /api/subscription/portal. */
export const GET = withLogging("entitlement", async (request: Request) => {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const status = await readEntitlement(user.id);
  logFields({ ...status });
  return NextResponse.json(status);
});
