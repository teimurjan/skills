import type { Metadata } from "next";
import { Document, siteIcons } from "@/components/site/Document";
import "@/app/globals.css";
import { copyFor } from "@/components/site/copy";
import { PREFIXED_LOCALES } from "@/lib/i18n";
import { langOf, type LocaleParams } from "./params";

/**
 * The root layout for every locale that is not the default one.
 *
 * One of three root layouts, because `<html lang>` has to be right and no layout can
 * change an attribute set by a layout above it. `Document` holds everything the three
 * share; only the tag and the default metadata differ.
 *
 * One layout for every prefixed locale rather than one per language: the segment is the
 * tag, so a locale added to `LOCALES` gets these pages with no file of its own.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return PREFIXED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const copy = copyFor(await langOf(props));
  return { ...siteIcons, title: copy.home.meta.title, description: copy.home.meta.description };
}

export default async function LocaleLayout(props: LocaleParams & { children: React.ReactNode }) {
  return <Document lang={await langOf(props)}>{props.children}</Document>;
}
