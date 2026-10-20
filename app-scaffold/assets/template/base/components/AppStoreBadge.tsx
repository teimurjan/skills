import { appStoreUrl } from "@/lib/appStoreListing";

/** Apple's badge, linked to the listing. Renders nothing until there is a listing to link to. */

export function AppStoreBadge({ size = "md" }: { size?: "sm" | "md" }) {
  if (!appStoreUrl) return null;
  const height = size === "sm" ? "h-10" : "h-12";
  return (
    <a href={appStoreUrl} className={`inline-flex ${height}`} aria-label="Download on the App Store">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/badges/app-store.svg" alt="Download on the App Store" className="h-full w-auto" />
    </a>
  );
}
