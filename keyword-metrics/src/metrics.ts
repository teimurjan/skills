import { z } from "zod";
import type { SearchItem } from "./items.ts";
import { parseJsonAs } from "./read-json.ts";
import type { Result } from "./types.ts";

export type Targeting = { geo: readonly string[]; language: string | null };

// The REST API sends int64 fields as JSON strings.
const Int = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]);

const Metrics = z.looseObject({
  avgMonthlySearches: Int.optional(),
  competition: z.string().optional(),
  competitionIndex: Int.optional(),
  lowTopOfPageBidMicros: Int.optional(),
  highTopOfPageBidMicros: Int.optional(),
  monthlySearchVolumes: z
    .array(z.looseObject({ year: Int, month: z.string(), monthlySearches: Int.optional() }))
    .optional(),
});

const KeywordResult = z.looseObject({
  text: z.string(),
  closeVariants: z.array(z.string()).optional(),
  keywordMetrics: Metrics.optional(),
});

const MetricsResponse = z.looseObject({ results: z.array(KeywordResult).optional() });

export type KeywordResult = z.infer<typeof KeywordResult>;

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];
const COMPETITION_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
type CompetitionLevel = (typeof COMPETITION_LEVELS)[number];

export type KeywordEntry = {
  query: string;
  /** The text Google reports. A close variant such as "cars" reports as "car". */
  matchedText: string | null;
  closeVariants: string[];
  geo: string[];
  language: string | null;
  status: "ok" | "no_data";
  avgMonthlySearches: number | null;
  competition: CompetitionLevel | null;
  /** Share of ad slots filled, from 0 to 100. It measures paid competition, not SEO difficulty. */
  competitionIndex: number | null;
  /** Top-of-page bid percentiles, in the currency of the Google Ads account. */
  lowTopOfPageBid: number | null;
  highTopOfPageBid: number | null;
  monthly: { month: string; searches: number | null }[];
  fetchedAt: string;
};

export const parseMetricsResponse = (text: string): Result<KeywordResult[], string> => {
  const parsed = parseJsonAs(text, MetricsResponse, "metrics response");
  return parsed.ok ? { ok: true, value: parsed.value.results ?? [] } : parsed;
};

/** Google can change case and punctuation in the text it returns, so compare letters and digits only. */
const normalize = (text: string): string =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export const indexResults = (results: readonly KeywordResult[]): ReadonlyMap<string, KeywordResult> =>
  new Map(
    results.flatMap((result) =>
      [result.text, ...(result.closeVariants ?? [])].map((text) => [normalize(text), result] as const),
    ),
  );

export const findResult = (index: ReadonlyMap<string, KeywordResult>, query: string): KeywordResult | undefined =>
  index.get(normalize(query));

const microsToAmount = (micros: number | undefined): number | null =>
  micros === undefined ? null : Number((micros / 1_000_000).toFixed(2));

const toCompetitionLevel = (value: string | undefined): CompetitionLevel | null =>
  COMPETITION_LEVELS.find((level) => level === value) ?? null;

const toMonthly = (volumes: NonNullable<z.infer<typeof Metrics>["monthlySearchVolumes"]>): KeywordEntry["monthly"] =>
  volumes
    .map(({ year, month, monthlySearches }) => ({
      month: `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, "0")}`,
      searches: monthlySearches ?? null,
    }))
    .toSorted((a, b) => a.month.localeCompare(b.month));

export const toEntry = (
  item: SearchItem,
  result: KeywordResult | undefined,
  targeting: Targeting,
  fetchedAt: string,
): KeywordEntry => {
  const metrics = result?.keywordMetrics;
  return {
    query: item.query,
    matchedText: result?.text ?? null,
    closeVariants: result?.closeVariants ?? [],
    geo: [...targeting.geo],
    language: targeting.language,
    status: metrics?.avgMonthlySearches === undefined ? "no_data" : "ok",
    avgMonthlySearches: metrics?.avgMonthlySearches ?? null,
    competition: toCompetitionLevel(metrics?.competition),
    competitionIndex: metrics?.competitionIndex ?? null,
    lowTopOfPageBid: microsToAmount(metrics?.lowTopOfPageBidMicros),
    highTopOfPageBid: microsToAmount(metrics?.highTopOfPageBidMicros),
    monthly: toMonthly(metrics?.monthlySearchVolumes ?? []),
    fetchedAt,
  };
};
