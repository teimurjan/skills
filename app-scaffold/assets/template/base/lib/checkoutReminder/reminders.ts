import "server-only";
import { randomBytes } from "node:crypto";
import { appStoreUrl } from "@/lib/appStoreListing";
import { isResendConfigured, postalAddress, sendEmail } from "@/lib/email/resend";
import { readEntitlement } from "@/lib/entitlements";
import { DEFAULT_LANG, isLang, SITE_URL, type Lang } from "@/lib/i18n";
import { createAdminClient, isServiceConfigured } from "@/lib/supabase/admin";
import { isDiscountConfigured, mintDiscount, reminderLink } from "./discount";
import { renderReminderEmail } from "./render";

/**
 * The abandoned-checkout reminder. One email per account, ever, an hour after the funnel last
 * started a checkout for it, carrying a single-use discount off the first payment. How the
 * biller takes the code, and so what the link carries, is `discount.ts`.
 */

export const DISCOUNT_PERCENT = 20;
const QUIET_FOR_MS = 60 * 60 * 1000;
/** A checkout older than this is not a reminder any more, it is a surprise. It also keeps a
 * cron that was down for a week from mailing the whole backlog at once. */
const STALE_AFTER_MS = 48 * 60 * 60 * 1000;
const BATCH_SIZE = 100;
/** Resend allows two requests a second per team. */
const SEND_SPACING_MS = 550;

const TABLE = "checkout_reminders";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const isReminderConfigured = isServiceConfigured && isResendConfigured && isDiscountConfigured;

const langOf = (value: unknown): Lang => (isLang(value) ? value : DEFAULT_LANG);

/** The reader has a checkout in front of them. Moves an unsent reminder's clock forward; a sent
 * one stays sent. */
export async function recordCheckoutStart(userId: string, lang: Lang): Promise<boolean> {
  const { error } = await createAdminClient()
    .from(TABLE)
    .upsert({ user_id: userId, lang, started_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) console.error("recordCheckoutStart failed", error);
  return !error;
}

/** The code the reminder minted for this account, if any. Null on a failed read: a checkout
 * at the full price beats no checkout. */
export async function reminderDiscountCode(userId: string): Promise<string | null> {
  if (!isServiceConfigured) return null;
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .select("discount_code")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) console.error("reminderDiscountCode failed", error);
  return data?.discount_code ?? null;
}

/** The language this account's checkout was read in, for the welcome email. English when no
 * checkout was recorded or the read failed. */
export async function checkoutLang(userId: string): Promise<Lang> {
  const { data } = await createAdminClient().from(TABLE).select("lang").eq("user_id", userId).maybeSingle();
  return langOf(data?.lang);
}

export interface ReminderRun {
  due: number;
  sent: number;
  /** Paid since, or no address to write to. Their rows are removed. */
  closed: number;
  /** Left unclaimed for the next run. */
  failed: number;
}

interface DueRow {
  user_id: string;
  lang: string;
  discount_code: string | null;
  unsubscribe_token: string;
}

/** Everything that went quiet an hour ago and has not been reminded. Null when the due rows
 * could not be read at all, which the cron reports as a failure. */
export async function sendDueReminders(): Promise<ReminderRun | null> {
  const now = Date.now();
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .select("user_id, lang, discount_code, unsubscribe_token")
    .is("sent_at", null)
    .is("unsubscribed_at", null)
    .lte("started_at", new Date(now - QUIET_FOR_MS).toISOString())
    .gte("started_at", new Date(now - STALE_AFTER_MS).toISOString())
    .order("started_at")
    .limit(BATCH_SIZE);
  if (error) {
    console.error("sendDueReminders read failed", error);
    return null;
  }

  const run: ReminderRun = { due: data.length, sent: 0, closed: 0, failed: 0 };
  for (const row of data as DueRow[]) {
    const outcome = await remind(row);
    run[outcome] += 1;
    if (outcome === "sent") await sleep(SEND_SPACING_MS);
  }
  return run;
}

async function remind(row: DueRow): Promise<"sent" | "closed" | "failed"> {
  const admin = createAdminClient();
  const close = async () => {
    await admin.from(TABLE).delete().eq("user_id", row.user_id);
    return "closed" as const;
  };

  // A failed read is not "unpaid": skip, and ask again next run.
  const paid = await readEntitlement(row.user_id).then(
    (status) => status.paid,
    () => null,
  );
  if (paid === null) return "failed";
  if (paid) return close();

  const { data: account, error: accountError } = await admin.auth.admin.getUserById(row.user_id);
  if (accountError) return "failed";
  if (!account.user.email) return close();

  // Claimed before anything leaves, so a second run over the same row finds nothing to take.
  const { data: claimed } = await admin
    .from(TABLE)
    .update({ sent_at: new Date().toISOString() })
    .eq("user_id", row.user_id)
    .is("sent_at", null)
    .select("user_id");
  if (!claimed?.length) return "failed";
  const release = async () => {
    await admin.from(TABLE).update({ sent_at: null }).eq("user_id", row.user_id);
    return "failed" as const;
  };

  const code = row.discount_code ?? newCode();
  if (!row.discount_code) {
    if (!(await mintDiscount(code, DISCOUNT_PERCENT, row.user_id))) return release();
    const { error: saveError } = await admin.from(TABLE).update({ discount_code: code }).eq("user_id", row.user_id);
    if (saveError) return release();
  }

  const lang = langOf(row.lang);
  const unsubscribeUrl = `${SITE_URL}/api/email/unsubscribe?token=${row.unsubscribe_token}`;
  const email = renderReminderEmail({
    lang,
    percent: DISCOUNT_PERCENT,
    checkoutUrl: reminderLink(lang, code),
    appStoreUrl,
    unsubscribeUrl,
    postalAddress,
  });
  const sent = await sendEmail(
    {
      to: account.user.email,
      ...email,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    },
    `checkout-reminder/${row.user_id}`,
  );
  return sent ? "sent" : release();
}

/** Uppercase and unambiguous (no 0/O, 1/I), short enough for every biller's code field. */
const newCode = (): string =>
  `BACK${Array.from(randomBytes(8), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("")}`;

/** The language of the reminder a token belongs to, for the unsubscribe page. Null when the
 * token names nothing. */
export async function reminderLang(token: string): Promise<Lang | null> {
  if (!UUID.test(token)) return null;
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .select("lang")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (error) throw error;
  return data ? langOf(data.lang) : null;
}

/** Idempotent: a second click, or the mail client's one-click POST after the reader's own,
 * lands on the same answer. */
export async function unsubscribe(token: string): Promise<Lang | null> {
  if (!UUID.test(token)) return null;
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .is("unsubscribed_at", null)
    .select("lang");
  if (error) throw error;
  if (data.length) return langOf(data[0].lang);
  return reminderLang(token);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
