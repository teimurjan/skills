import { notFound } from "next/navigation";
import { isPrefixedLocale, type Lang } from "@/lib/i18n";

/** The one dynamic segment this tree has. Next hands params in as a promise, and both the
 * page and its metadata need the same one, so the shape is named once here. */
export type LocaleParams = { params: Promise<{ locale: string }> };

/**
 * The segment, narrowed to a locale the site is actually written in.
 *
 * `dynamicParams = false` in the layout already means only a generated param reaches a
 * page, so in practice this never returns anything else — it is the boundary check that
 * makes that guarantee legible in the types rather than a cast, and the thing that keeps
 * `/en` a 404 rather than a second address for pages that already live at the root.
 */
export async function langOf({ params }: LocaleParams): Promise<Lang> {
  const { locale } = await params;
  if (!isPrefixedLocale(locale)) notFound();
  return locale;
}
