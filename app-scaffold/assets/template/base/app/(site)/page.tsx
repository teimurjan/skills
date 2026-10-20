import type { Metadata } from "next";
import { copyFor } from "@/components/site/copy";
import { HomePage } from "@/components/site/HomePage";
import { alternatesFor } from "@/lib/i18n";

export const metadata: Metadata = {
  ...copyFor("en").home.meta,
  alternates: alternatesFor("en", "home"),
};

export default function Page() {
  return <HomePage lang="en" />;
}
