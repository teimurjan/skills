import type { Metadata } from "next";
import { copyFor } from "@/components/site/copy";
import { PricingPage } from "@/components/site/PricingPage";
import { alternatesFor } from "@/lib/i18n";
import { langOf, type LocaleParams } from "../params";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const lang = await langOf(props);
  return { ...copyFor(lang).pricing.meta, alternates: alternatesFor(lang, "pricing") };
}

export default async function Page(props: LocaleParams) {
  return <PricingPage lang={await langOf(props)} />;
}
