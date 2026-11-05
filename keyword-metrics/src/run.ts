import { setTimeout as sleep } from "node:timers/promises";
import type { AdsClient, AdsFailure } from "./ads-api.ts";
import type { SearchItem } from "./items.ts";
import { findResult, indexResults, toEntry, type KeywordEntry, type Targeting } from "./metrics.ts";
import { saveStore, type KeywordStore } from "./store.ts";

export type Selection = { targeting: Targeting; limit: number | undefined; force: boolean };

export type LookupOptions = {
  targeting: Targeting;
  storePath: string;
  batchSize: number;
  /** Google allows 1 request per second for each account. */
  paceMs: number;
  backoffMs: readonly number[];
};

export type LookupSummary = { counts: Record<KeywordEntry["status"], number>; failure: AdsFailure | null; store: KeywordStore };

const sameTargeting = (entry: KeywordEntry, { geo, language }: Targeting): boolean =>
  entry.language === language && entry.geo.join() === geo.join();

export const selectPending = (items: readonly SearchItem[], store: KeywordStore, selection: Selection): SearchItem[] =>
  items
    .filter((item) => {
      const entry = store[item.key];
      return selection.force || entry === undefined || !sameTargeting(entry, selection.targeting);
    })
    .slice(0, selection.limit);

const describe = (entry: KeywordEntry): string => {
  if (entry.status === "no_data") return "no data";
  const competition = entry.competitionIndex === null ? "no competition data" : `competition ${entry.competitionIndex} (${entry.competition ?? "unknown"})`;
  return `${entry.avgMonthlySearches?.toLocaleString("en-US")}/mo, ${competition}`;
};

const toBatches = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

const fetchWithBackoff = async (client: AdsClient, keywords: readonly string[], options: LookupOptions) => {
  let result = await client.fetchMetrics(keywords, options.targeting);
  for (const waitMs of options.backoffMs) {
    if (result.ok || result.error.kind !== "rate_limited") return result;
    console.log(`  rate limited by Google, waiting ${waitMs / 1000} s`);
    await sleep(waitMs);
    result = await client.fetchMetrics(keywords, options.targeting);
  }
  return result;
};

/** Saves after each batch, so a stopped run continues where it stopped. */
export const runLookup = async (
  client: AdsClient,
  items: readonly SearchItem[],
  initial: KeywordStore,
  options: LookupOptions,
): Promise<LookupSummary> => {
  const counts = { ok: 0, no_data: 0 };
  let store = initial;
  for (const [index, batch] of toBatches(items, options.batchSize).entries()) {
    if (index > 0) await sleep(options.paceMs);
    const keywords = [...new Set(batch.map((item) => item.query))];
    const result = await fetchWithBackoff(client, keywords, options);
    if (!result.ok) return { counts, failure: result.error, store };

    const results = indexResults(result.value);
    const fetchedAt = new Date().toISOString();
    const entries = batch.map((item) => {
      const entry = toEntry(item, findResult(results, item.query), options.targeting, fetchedAt);
      counts[entry.status] += 1;
      console.log(`  ${describe(entry)}  ${item.key}`);
      return [item.key, entry] as const;
    });
    store = { ...store, ...Object.fromEntries(entries) };
    await saveStore(options.storePath, store);
  }
  return { counts, failure: null, store };
};
