/**
 * Which app's own browser a visit is inside, off the user agent.
 *
 * Meta opens an ad's destination in a WKWebView (a WebView on Android) rather than the
 * system browser, and three things follow for the funnel: Google refuses OAuth there, an
 * emailed link opens somewhere else, and nothing in Amplitude's autocapture says so — `os`
 * and `device` read as any iPhone. Each app names itself differently: Facebook with
 * `FBAN`/`FBAV` on iOS and `FB_IAB` on Android, Instagram by name, Threads by its codename
 * and nothing else.
 */
export type InAppBrowser = "facebook" | "instagram" | "threads";

export function inAppBrowser(userAgent: string): InAppBrowser | null {
  if (/Barcelona/i.test(userAgent)) return "threads";
  if (/Instagram/i.test(userAgent)) return "instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(userAgent)) return "facebook";
  return null;
}
