import Link from "next/link";
import { AppStoreBadge } from "@/components/AppStoreBadge";
import { Logo } from "@/components/Logo";
import { copyFor } from "@/components/site/copy";
import { ScreenshotGallery } from "@/components/site/ScreenshotGallery";
import { LanguageSwitch } from "@/components/site/SiteShell";
import { funnelPath, pathFor, type Lang } from "@/lib/i18n";
import { MARKETS } from "@/lib/markets";
import { formatMoney, planListQuote } from "@/lib/plans";

/**
 * Hero, then the screenshots, then why, then how, then the price.
 *
 * The screenshots sit directly under the hero. Someone arriving from an ad has decided nothing
 * yet, and the fastest way to answer "is this a real app or a landing page for one" is to show
 * them the app. Every buy button goes to the funnel, which argues before it asks.
 */
export function HomePage({ lang }: { lang: Lang }) {
  const copy = copyFor(lang);
  const home = copy.home;
  // The dollar placeholder in the reader's own number format; checkout quotes their currency.
  const { numberLocale } = MARKETS[lang];
  const plans = [
    [home.plan.monthly, planListQuote.monthly],
    [home.plan.yearly, planListQuote.yearly],
    [home.plan.lifetime, planListQuote.lifetime],
  ] as const;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/90 backdrop-blur-md">
        <div className="shell flex items-center justify-between py-3">
          <Logo />
          <div className="flex items-center gap-5">
            <Link href={pathFor(lang, "pricing")} className="text-[14px] font-medium text-muted hover:text-ink">
              {copy.nav.pricing}
            </Link>
            <a href={funnelPath(lang)} className="text-[14px] font-semibold text-ink underline underline-offset-4 hover:text-slate">
              {copy.nav.start}
            </a>
          </div>
        </div>
      </header>

      <section>
        <div className="shell pt-14 pb-12">
          <div className="max-w-3xl">
            <h1 className="text-[40px] leading-[1.02] font-extrabold tracking-[-0.02em] text-ink sm:text-[60px]">
              {home.headline}
            </h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-slate sm:text-[18px]">{home.sub}</p>
          </div>
          <div className="mt-8 flex flex-col items-start gap-3.5 sm:flex-row sm:items-center sm:gap-6">
            <AppStoreBadge />
            <a
              href={funnelPath(lang)}
              className="text-[15px] font-semibold text-ink underline underline-offset-4 hover:text-slate"
            >
              {home.webCta}
            </a>
          </div>
        </div>
      </section>

      {/* The app itself, before a word of argument */}
      <section>
        <div className="shell pt-16 pb-12">
          <h2 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em] text-ink">{home.shotsHeading}</h2>
          <div className="mt-8">
            <ScreenshotGallery shots={home.shots} />
          </div>
        </div>
      </section>

      <section>
        <div className="shell py-12">
          <h2 className="max-w-2xl text-[28px] leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-[34px]">
            {home.painsHeading}
          </h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {home.pains.map((pain) => (
              <div key={pain.kicker} className="card p-6">
                <p className="eyebrow">{pain.kicker}</p>
                <h3 className="mt-3 text-[18px] leading-snug font-bold text-ink">{pain.title}</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-muted">{pain.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how">
        <div className="shell py-12">
          <h2 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-[34px]">
            {home.howHeading}
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] text-muted">{home.howSub}</p>

          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            {home.steps.map((step) => (
              <li key={step.n}>
                <span className="num flex size-11 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-on-ink">
                  {step.n}
                </span>
                <h3 className="mt-4 text-[18px] font-bold text-ink">{step.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The price, last, and the close that leads into it. One section, so the closer's words
          do the closing and the card takes the click: one accent fill on the page. */}
      <section id="pricing">
        <div className="shell pt-12 pb-16">
          <h2 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-[34px]">
            {home.closer.heading}
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] text-muted">{home.closer.body}</p>

          <div className="card mt-8 overflow-hidden">
            <div className="px-5 pt-6 sm:px-7">
              <p className="eyebrow">{home.plan.eyebrow}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2">
              <div className="flex flex-col justify-center px-5 py-6 sm:px-7">
                <p className="max-w-md text-[20px] leading-snug font-bold tracking-[-0.01em] text-ink">
                  {home.plan.pitch}
                </p>
              </div>

              <div className="border-t border-divider px-5 py-6 sm:border-t-0 sm:border-l sm:px-7">
                <dl className="divide-y divide-divider">
                  {plans.map(([label, amount]) => (
                    <div key={label} className="flex items-baseline justify-between gap-6 py-3 first:pt-0">
                      <dt className="text-[15px] text-slate">{label}</dt>
                      <dd className="num text-[15px] font-semibold whitespace-nowrap text-ink">
                        {formatMoney(amount, planListQuote.currency, numberLocale)}
                      </dd>
                    </div>
                  ))}
                </dl>

                <a href={funnelPath(lang)} className="btn mt-6">
                  {home.plan.cta}
                </a>

                <div className="mt-6 border-t border-divider pt-6">
                  <p className="text-[13px] leading-relaxed text-muted">{home.plan.appNote}</p>
                  <div className="mt-4">
                    <AppStoreBadge size="sm" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="shell pb-10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-6">
          <Logo />
          <nav className="flex flex-wrap items-center gap-5 text-[13px] text-muted">
            <Link href={pathFor(lang, "pricing")} className="hover:text-ink">{copy.nav.pricing}</Link>
            <Link href={pathFor(lang, "support")} className="hover:text-ink">{copy.nav.support}</Link>
            <Link href={pathFor(lang, "privacy")} className="hover:text-ink">{copy.nav.privacy}</Link>
            <Link href={pathFor(lang, "terms")} className="hover:text-ink">{copy.nav.terms}</Link>
            <Link href={pathFor(lang, "refund")} className="hover:text-ink">{copy.nav.refund}</Link>
            <LanguageSwitch lang={lang} page="home" />
          </nav>
        </div>
      </footer>
    </div>
  );
}
