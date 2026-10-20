import type { Metadata } from "next";
import { copyFor } from "@/components/site/copy";
import { ProsePage } from "@/components/site/ProsePage";
import { alternatesFor } from "@/lib/i18n";
import { langOf, type LocaleParams } from "../params";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const lang = await langOf(props);
  return { ...copyFor(lang).refund.meta, alternates: alternatesFor(lang, "refund") };
}

export default async function Page(props: LocaleParams) {
  return <ProsePage lang={await langOf(props)} page="refund" select={(copy) => copy.refund} />;
}
