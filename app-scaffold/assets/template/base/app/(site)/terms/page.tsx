import type { Metadata } from "next";
import { copyFor } from "@/components/site/copy";
import { ProsePage } from "@/components/site/ProsePage";
import { alternatesFor } from "@/lib/i18n";

export const metadata: Metadata = {
  ...copyFor("en").terms.meta,
  alternates: alternatesFor("en", "terms"),
};

export default function Page() {
  return <ProsePage lang="en" page="terms" select={(copy) => copy.terms} />;
}
