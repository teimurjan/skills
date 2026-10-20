import type { Metadata } from "next";
import { Document, siteIcons } from "@/components/site/Document";
import "@/app/globals.css";
import { copyFor } from "@/components/site/copy";

/**
 * The root layout for the English pages.
 *
 * One of three, because `<html lang>` has to be right and no layout can change an
 * attribute set by a layout above it. `Document` holds everything the three share; only
 * the tag and the default metadata differ.
 */
export const metadata: Metadata = {
  ...siteIcons,
  title: copyFor("en").home.meta.title,
  description: copyFor("en").home.meta.description,
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <Document lang="en">{children}</Document>;
}
