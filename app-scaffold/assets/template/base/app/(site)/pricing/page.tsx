import type { Metadata } from "next";
import { copyFor } from "@/components/site/copy";
import { PricingPage } from "@/components/site/PricingPage";
import { alternatesFor } from "@/lib/i18n";

export const metadata: Metadata = {
  ...copyFor("en").pricing.meta,
  alternates: alternatesFor("en", "pricing"),
};

export default function Page() {
  return <PricingPage lang="en" />;
}
