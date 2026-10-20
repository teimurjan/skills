import { NextResponse } from "next/server";
import { deleteAccount } from "@/lib/account";
import { getUserFromRequest } from "@/lib/supabase/auth";
import { logFields, withLogging } from "@/lib/log";

export const dynamic = "force-dynamic";

/** Delete the caller's account and every record their shop owns — the in-app path
 * App Store guideline 5.1.1(v) requires of an app that makes you sign in.
 * Irreversible, and the app drops its session the moment this returns. A
 * subscription is left running: it lives on the Apple ID, and only Apple can
 * cancel it. */
export const DELETE = withLogging("account.delete", async (request: Request) => {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!(await deleteAccount(user.id))) {
    logFields({ outcome: "failed" });
    // No `message`: the words for every code live in the app, in
    // `ios/Appname/Shared/Networking/ServerErrorCopy.swift`, where they can
    // be shown in the reader's language.
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  logFields({ outcome: "deleted" });
  return NextResponse.json({ ok: true });
});
