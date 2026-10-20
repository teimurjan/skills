import type { CheckoutBreakdownData } from "dodopayments-checkout";
import { formatMoney, fromMinorUnits, type Plan, type PlanQuote } from "@/lib/plans";
import { fill, useLocale } from "./locale";

/**
 * The order summary under the inline checkout. The session is created with
 * `show_order_details: false`, so the totals a checkout must show are ours to draw. The plan
 * quote is the floor; a `checkout.breakdown` upgrades it with the tax split and the exact total.
 * No trial line: the web sells none.
 */
export function CheckoutSummary({
  breakdown,
  plan,
  quote,
}: {
  breakdown?: CheckoutBreakdownData;
  plan: Plan;
  quote: PlanQuote;
}) {
  const { copy } = useLocale();
  const words = copy.checkout;
  const currency = breakdown?.finalTotalCurrency ?? breakdown?.currency ?? quote.currency;
  const money = (amount: number | null | undefined) =>
    amount == null ? null : formatMoney(fromMinorUnits(amount, currency), currency);

  const listed = formatMoney(quote[plan], quote.currency);
  const total = money(breakdown?.finalTotal ?? breakdown?.total) ?? listed;
  const label = copy.paywall[plan];
  const adjustments = breakdown
    ? [
        breakdown.discount ? { label: words.discount, value: `−${money(breakdown.discount)}` } : null,
        breakdown.tax ? { label: words.tax, value: money(breakdown.tax) } : null,
      ].filter((line) => line !== null)
    : [];

  return (
    <div className="card px-4 py-3.5">
      <p className="eyebrow">{words.summary}</p>

      <div className="mt-2.5 flex items-start justify-between gap-4 text-[16px] leading-[1.45]">
        <span className="min-w-0">
          <span className="font-bold text-ink">Appname</span>
          <span className="text-muted"> · {label}</span>
        </span>
        <span className="num shrink-0 text-muted">{money(breakdown?.subTotal) ?? listed}</span>
      </div>

      {adjustments.length > 0 && (
        <dl className="mt-2.5 flex flex-col gap-1 border-t border-hairline pt-2.5 text-[16px]">
          {adjustments.map((line) => (
            <div key={line.label} className="flex justify-between gap-4">
              <dt className="text-muted">{line.label}</dt>
              <dd className="num">{line.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-2.5 flex items-baseline justify-between border-t border-hairline pt-2.5">
        <span className="text-[17px] font-bold">{words.total}</span>
        <span className="num text-[18.5px] font-extrabold">{total}</span>
      </div>

      <p className="mt-2 text-[14.5px] leading-[1.5] text-muted">
        {plan === "lifetime"
          ? words.noRenewal
          : fill(words.renews, { amount: total, cycle: plan === "yearly" ? words.cycles.year : words.cycles.month })}
      </p>
    </div>
  );
}
