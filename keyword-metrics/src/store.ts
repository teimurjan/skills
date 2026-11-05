import { existsSync } from "node:fs";
import { z } from "zod";
import { writeFileAtomic } from "./atomic-write.ts";
import type { KeywordEntry } from "./metrics.ts";
import { readJsonAs } from "./read-json.ts";
import { ok, type Result } from "./types.ts";

const Entry: z.ZodType<KeywordEntry> = z.object({
  query: z.string(),
  matchedText: z.string().nullable(),
  closeVariants: z.array(z.string()),
  geo: z.array(z.string()),
  language: z.string().nullable(),
  status: z.enum(["ok", "no_data"]),
  avgMonthlySearches: z.number().nullable(),
  competition: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable(),
  competitionIndex: z.number().nullable(),
  lowTopOfPageBid: z.number().nullable(),
  highTopOfPageBid: z.number().nullable(),
  monthly: z.array(z.object({ month: z.string(), searches: z.number().nullable() })),
  fetchedAt: z.string(),
});

const StoreFile = z.record(z.string(), Entry);

/** Keyed by the key of each search item, which is the keyword itself unless the input file gives one. */
export type KeywordStore = Readonly<Record<string, KeywordEntry>>;

export const loadStore = async (path: string): Promise<Result<KeywordStore, string>> =>
  existsSync(path) ? readJsonAs(path, StoreFile) : ok({});

export const saveStore = (path: string, store: KeywordStore): Promise<void> =>
  writeFileAtomic(path, `${JSON.stringify(store, null, 2)}\n`);
