import type { Lang } from "@/lib/i18n";
import { en } from "./en";
import type { FunnelCopy } from "./types";

/**
 * Every deck, for the build. **Never imported by anything the browser bundle reaches** — a
 * page carries its own deck as JSON, and importing this would put all of them in front of
 * the first paint. A new locale adds its deck here and its tag to `LOCALES`.
 */
export const FUNNEL_COPY: Record<Lang, FunnelCopy> = {
  en,
};
