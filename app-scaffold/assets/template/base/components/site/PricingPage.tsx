import { AppStoreBadge } from "@/components/AppStoreBadge";
import { copyFor } from "@/components/site/copy";
import { Prose, SiteShell } from "@/components/site/SiteShell";
import { funnelPath, type Lang } from "@/lib/i18n";
import { MARKETS } from "@/lib/markets";
import { formatMoney, planListQuote } from "@/lib/plans";

/** Two cards, the web door and the App Store door, and then the detail. */
export function PricingPage({ lang }: { lang: Lang }) {
  const copy = copyFor(lang);
  const { numberLocale } = MARKETS[lang];
  const text = copy.pricing;
  const price = (amount: number) => formatMoney(amount, planListQuote.currency, numberLocale);
  const [monthly, yearly, lifetime] = [planListQuote.monthly, planListQuote.yearly, planListQuote.lifetime].map(price);

  return (
    <SiteShell lang={lang} page="pricing">
      <div className="max-w-2xl">
        <p className="eyebrow">{text.eyebrow}</p>
        <h1 className="mt-3 text-[40px] leading-[1.02] font-extrabold tracking-[-0.02em] text-ink">
          {text.heading}
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">{text.intro}</p>
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <div className="card p-6">
          <p className="eyebrow">{text.web.eyebrow}</p>
          <p className="mt-3 text-[44px] leading-none font-extrabold tracking-[-0.02em] text-ink tabular-nums">
            {monthly}
            <span className="text-[15px] font-medium tracking-normal text-muted">{text.web.perMonth}</span>
          </p>
          <p className="num mt-3 text-[14px] text-slate">{text.web.orOthers(yearly, lifetime)}</p>
          <a href={funnelPath(lang)} className="btn mt-6">
            {text.web.cta}
          </a>
          <p className="mt-4 text-[12px] leading-relaxed text-muted">{text.web.note}</p>
        </div>

        <div className="card p-6">
          <p className="eyebrow">{text.app.eyebrow}</p>
          <p className="mt-3 text-[44px] leading-[1.02] font-extrabold tracking-[-0.02em] text-ink">
            {text.app.headline}
          </p>
          <p className="mt-3 text-[14px] text-slate">{text.app.sub}</p>
          <div className="mt-6">
            <AppStoreBadge />
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-muted">{text.app.note}</p>
        </div>
      </div>

      <Prose>{text.body}</Prose>
    </SiteShell>
  );
}
