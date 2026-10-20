import { NextResponse } from "next/server";
import { reminderLang, unsubscribe } from "@/lib/checkoutReminder/reminders";
import { renderUnsubscribePage } from "@/lib/checkoutReminder/render";
import { logFields, withLogging } from "@/lib/log";

export const dynamic = "force-dynamic";

const html = (body: string) =>
  new NextResponse(body, { headers: { "content-type": "text/html; charset=utf-8" } });

const tokenOf = (request: Request) => new URL(request.url).searchParams.get("token") ?? "";

/** The footer link: a page that asks, because mail scanners open every link they find. */
export const GET = withLogging("email.unsubscribe", async (request: Request) => {
  const lang = await reminderLang(tokenOf(request));
  if (!lang) return new NextResponse(null, { status: 404 });
  return html(renderUnsubscribePage(lang, "ask", request.url));
});

/** The page's button, and the mail client's own one-click button (RFC 8058). */
export const POST = withLogging("email.unsubscribe", async (request: Request) => {
  const lang = await unsubscribe(tokenOf(request));
  if (!lang) return new NextResponse(null, { status: 404 });
  logFields({ outcome: "unsubscribed" });
  return html(renderUnsubscribePage(lang, "done", request.url));
});
