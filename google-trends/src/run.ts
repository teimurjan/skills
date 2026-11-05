import { setTimeout as sleep } from "node:timers/promises";
import type { SearchItem } from "./items.ts";
import type { Result } from "./types.ts";
import type { Capture, SearchFailure, SearchSpec, TrendsSession } from "./session.ts";
import { saveStore, type TrendEntry, type TrendStore } from "./store.ts";
import { summarizeTimeline } from "./summary.ts";

export type Selection = {
  spec: SearchSpec;
  limit: number | undefined;
  force: boolean;
};

export type FillOptions = Selection & { storePath: string; paceMs: number; signal: AbortSignal };

export type FillSummary = { counts: Record<TrendEntry["status"], number>; blocked: boolean; store: TrendStore };

// Google sends 429 without Retry-After, so wait longer after each block, then give up.
const BLOCK_BACKOFF_S = [60, 180, 600];
const TOPIC_ID = /^\/[mg]\//;

const isSettled = (entry: TrendEntry | undefined, spec: SearchSpec): boolean =>
  entry !== undefined &&
  entry.status !== "failed" &&
  entry.relatedStatus !== "missing" &&
  entry.geo === spec.geo &&
  entry.timeframe === spec.timeframe;

export const selectPending = (items: readonly SearchItem[], store: TrendStore, selection: Selection): SearchItem[] =>
  items.filter((item) => selection.force || !isSettled(store[item.key], selection.spec)).slice(0, selection.limit);

export const toEntry = (
  query: string,
  result: Result<Capture, SearchFailure>,
  spec: SearchSpec,
  fetchedAt: string,
): TrendEntry => {
  const base = { query, geo: spec.geo, timeframe: spec.timeframe, fetchedAt };
  if (!result.ok) {
    return {
      ...base, keyword: null, kind: null, status: "failed", summary: null, values: [], from: null, to: null,
      top: [], rising: [], via: null, error: result.error.message,
    };
  }
  const { keyword, timeline, related, via } = result.value;
  const summary = timeline ? summarizeTimeline(timeline.values) : null;
  return {
    ...base,
    keyword,
    kind: TOPIC_ID.test(keyword) ? "topic" : "term",
    status: summary && summary.verdict !== "no_data" ? "ok" : "no_data",
    summary,
    values: timeline?.values ?? [],
    from: timeline?.from ?? null,
    to: timeline?.to ?? null,
    top: related?.top ?? [],
    rising: related?.rising ?? [],
    relatedStatus: relatedStatusOf(timeline, related),
    via,
    error: null,
  };
};

const relatedStatusOf = (timeline: Capture["timeline"], related: Capture["related"]): NonNullable<TrendEntry["relatedStatus"]> => {
  if (!timeline) return "none";
  if (!related) return "missing";
  return related.top.length + related.rising.length > 0 ? "ok" : "none";
};

const describe = (entry: TrendEntry): string => {
  if (entry.status === "failed") return `failed: ${entry.error}`;
  if (!entry.summary || entry.status === "no_data") return "no data";
  const growth = entry.summary.growthPct === null ? "new" : `${entry.summary.growthPct > 0 ? "+" : ""}${entry.summary.growthPct}%`;
  const related = entry.relatedStatus === "missing" ? ", related missing" : "";
  return `${entry.summary.verdict} ${growth}${related}`;
};

const searchWithBackoff = async (
  session: TrendsSession,
  query: string,
  signal: AbortSignal,
): Promise<Result<Capture, SearchFailure>> => {
  let result = await session.search(query);
  for (const waitS of BLOCK_BACKOFF_S) {
    if (result.ok || result.error.kind !== "blocked" || signal.aborted) return result;
    console.log(`  blocked by Google, waiting ${waitS} s`);
    await sleep(waitS * 1000, undefined, { signal }).catch(() => {});
    if (signal.aborted) return result;
    result = await session.search(query);
  }
  return result;
};

/** Searches each item in turn and saves after every search, so a stopped run continues where it stopped. */
export const runFill = async (
  session: TrendsSession,
  items: readonly SearchItem[],
  initial: TrendStore,
  options: FillOptions,
): Promise<FillSummary> => {
  const counts = { ok: 0, no_data: 0, failed: 0 };
  let store = initial;
  for (const [index, { key, query }] of items.entries()) {
    if (options.signal.aborted) break;
    if (index > 0) {
      const jitter = 0.75 + Math.random() * 0.5;
      await sleep(options.paceMs * jitter, undefined, { signal: options.signal }).catch(() => {});
      if (options.signal.aborted) break;
    }
    const result = await searchWithBackoff(session, query, options.signal);
    const entry = toEntry(query, result, options.spec, new Date().toISOString());
    store = { ...store, [key]: entry };
    await saveStore(options.storePath, store);
    counts[entry.status] += 1;
    const via = entry.via ? ` (${entry.via}${entry.kind === "topic" ? ", topic" : ""})` : "";
    console.log(`  ${describe(entry)}  ${key}${via}  [${items.length - index - 1} left]`);
    if (!result.ok && result.error.kind === "blocked") return { counts, blocked: true, store };
  }
  return { counts, blocked: false, store };
};
