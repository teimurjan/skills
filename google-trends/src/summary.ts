export type Verdict = "growing" | "steady" | "spiky" | "declining" | "no_data";

export type TrendSummary = {
  /** Trends scales each search to its own peak of 100, so compare means only inside one search. */
  mean: number;
  /** Change from the first fifth of the range to the last fifth, in percent. */
  growthPct: number | null;
  /** Mean week-to-week change divided by the mean. A steady line stays near 0.1. */
  volatility: number;
  verdict: Verdict;
};

const EDGE_FRACTION = 0.2;
const GROWTH_THRESHOLD_PCT = 15;
const SPIKY_VOLATILITY = 0.25;
const MIN_MEAN = 1;

const average = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const round = (value: number, digits: number): number => Number(value.toFixed(digits));

const verdictFor = (mean: number, growthPct: number | null, volatility: number): Verdict => {
  if (mean < MIN_MEAN) return "no_data";
  if (volatility > SPIKY_VOLATILITY) return "spiky";
  if (growthPct === null || growthPct > GROWTH_THRESHOLD_PCT) return "growing";
  if (growthPct < -GROWTH_THRESHOLD_PCT) return "declining";
  return "steady";
};

/** Sorts a trend line into buckets. A steady or growing line is a good sign of demand. */
export const summarizeTimeline = (values: readonly number[]): TrendSummary => {
  const mean = average(values);
  const edge = Math.max(1, Math.round(values.length * EDGE_FRACTION));
  const first = average(values.slice(0, edge));
  const last = average(values.slice(-edge));
  const growthPct = first < MIN_MEAN ? null : ((last - first) / first) * 100;
  const steps = values.slice(1).map((value, index) => Math.abs(value - (values[index] ?? value)));
  const volatility = mean < MIN_MEAN ? 0 : average(steps) / mean;
  return {
    mean: round(mean, 1),
    growthPct: growthPct === null ? null : Math.round(growthPct),
    volatility: round(volatility, 3),
    verdict: verdictFor(mean, growthPct, volatility),
  };
};
