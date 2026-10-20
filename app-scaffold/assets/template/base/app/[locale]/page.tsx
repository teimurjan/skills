import type { Metadata } from "next";
import { copyFor } from "@/components/site/copy";
import { HomePage } from "@/components/site/HomePage";
import { alternatesFor } from "@/lib/i18n";
import { langOf, type LocaleParams } from "./params";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const lang = await langOf(props);
  return { ...copyFor(lang).home.meta, alternates: alternatesFor(lang, "home") };
}

export default async function Page(props: LocaleParams) {
  return <HomePage lang={await langOf(props)} />;
}
