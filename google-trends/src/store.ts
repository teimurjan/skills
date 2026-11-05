import { existsSync } from "node:fs";
import { z } from "zod";
import { writeFileAtomic } from "./atomic-write.ts";
import { readJsonAs } from "./read-json.ts";
import { ok, type Result } from "./types.ts";

const RelatedQuery = z.object({ query: z.string(), value: z.string() });

export const TrendEntry = z.object({
  query: z.string(),
  /** What Trends searched: the query, or a topic id such as "/m/0abc". */
  keyword: z.string().nullable(),
  kind: z.enum(["topic", "term"]).nullable(),
  geo: z.string(),
  timeframe: z.string(),
  status: z.enum(["ok", "no_data", "failed"]),
  summary: z
    .object({
      mean: z.number(),
      growthPct: z.number().nullable(),
      volatility: z.number(),
      verdict: z.enum(["growing", "steady", "spiky", "declining", "no_data"]),
    })
    .nullable(),
  values: z.array(z.number()),
  from: z.string().nullable(),
  to: z.string().nullable(),
  top: z.array(RelatedQuery),
  rising: z.array(RelatedQuery),
  /** "none" means Trends lists no related searches; "missing" means the response did not arrive. */
  relatedStatus: z.enum(["ok", "none", "missing"]).optional(),
  via: z.enum(["typed", "url"]).nullable(),
  error: z.string().nullable(),
  fetchedAt: z.string(),
});

export type TrendEntry = z.infer<typeof TrendEntry>;

/** Keyed by the key of each search item, which is the term itself unless the input file gives one. */
export const TrendStore = z.record(z.string(), TrendEntry);

export type TrendStore = Readonly<Record<string, TrendEntry>>;

export const loadStore = async (path: string): Promise<Result<TrendStore, string>> =>
  existsSync(path) ? readJsonAs(path, TrendStore) : ok({});

export const saveStore = (path: string, store: TrendStore): Promise<void> =>
  writeFileAtomic(path, `${JSON.stringify(store, null, 2)}\n`);
