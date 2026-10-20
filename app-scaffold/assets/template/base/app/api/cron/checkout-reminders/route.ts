import { NextResponse } from "next/server";
import { isReminderConfigured, sendDueReminders } from "@/lib/checkoutReminder/reminders";
import { logFields, withLogging } from "@/lib/log";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

/** Vercel's cron, every 15 minutes (`vercel.json`). Vercel signs the call with `CRON_SECRET`;
 * without one set, nobody else may trigger a mailing. */
export const GET = withLogging("cron.checkout-reminders", async (request: Request) => {
  if (!CRON_SECRET || !isReminderConfigured) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const run = await sendDueReminders();
  if (!run) return NextResponse.json({ error: "read_failed" }, { status: 500 });
  logFields({ ...run });
  return NextResponse.json(run);
});
