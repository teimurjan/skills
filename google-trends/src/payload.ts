import { z } from "zod";
import { parseJsonAs } from "./read-json.ts";
import { err, ok, type Result } from "./types.ts";

export type WidgetTokens = { timeseries: string | null; relatedQueries: string | null };
export type ExploreRequest = { keyword: string; geo: string; time: string };
export type Timeline = { values: number[]; from: string | null; to: string | null };
export type RelatedQuery = { query: string; value: string };
export type Related = { top: RelatedQuery[]; rising: RelatedQuery[] };

const RELATED_LIMIT = 10;

const Explore = z.looseObject({
  widgets: z.array(z.looseObject({ id: z.string(), token: z.string() })),
});

const ExploreReq = z.looseObject({
  comparisonItem: z
    .array(z.looseObject({ keyword: z.string(), geo: z.unknown(), time: z.string() }))
    .min(1),
});

const Multiline = z.looseObject({
  default: z.looseObject({
    timelineData: z.array(
      z.looseObject({
        time: z.string(),
        value: z.array(z.number()),
        hasData: z.array(z.boolean()).optional(),
        isPartial: z.boolean().optional(),
      }),
    ),
  }),
});

const Autocomplete = z.looseObject({
  default: z.looseObject({
    topics: z.array(z.looseObject({ mid: z.string(), title: z.string(), type: z.string() })),
  }),
});

const RankedList = z.looseObject({
  default: z.looseObject({
    rankedList: z.array(
      z.looseObject({
        rankedKeyword: z.array(z.looseObject({ query: z.string(), formattedValue: z.string() })),
      }),
    ),
  }),
});

// Trends prefixes every JSON response with )]}' so that a script tag cannot run it.
const stripXssi = (text: string): string => {
  const start = text.indexOf("{");
  return start === -1 ? "" : text.slice(start);
};

const isoDay = (unixSeconds: string): string => new Date(Number(unixSeconds) * 1000).toISOString().slice(0, 10);

export const parseExplore = (text: string): Result<WidgetTokens, string> => {
  const parsed = parseJsonAs(stripXssi(text), Explore, "explore response");
  if (!parsed.ok) return parsed;
  const tokenOf = (id: string) => parsed.value.widgets.find((widget) => widget.id === id)?.token ?? null;
  return ok({ timeseries: tokenOf("TIMESERIES"), relatedQueries: tokenOf("RELATED_QUERIES") });
};

/** Reads the search that the page sent, so a topic shows up as its entity id, such as "/m/0abc". */
export const readExploreRequest = (url: string): Result<ExploreRequest, string> => {
  const req = new URL(url).searchParams.get("req");
  if (!req) return err("explore request has no req parameter");
  const parsed = parseJsonAs(req, ExploreReq, "explore request");
  if (!parsed.ok) return parsed;
  const [item] = parsed.value.comparisonItem;
  if (!item) return err("explore request has no comparison item");
  return ok({ keyword: item.keyword, geo: typeof item.geo === "string" ? item.geo : "", time: item.time });
};

/** Returns null when Trends has no data for the search. Drops the partial last point. */
export const parseTimeline = (text: string): Result<Timeline | null, string> => {
  const parsed = parseJsonAs(stripXssi(text), Multiline, "timeline response");
  if (!parsed.ok) return parsed;
  const points = parsed.value.default.timelineData.filter((point) => !point.isPartial);
  if (!points.some((point) => point.hasData?.[0] ?? true)) return ok(null);
  return ok({
    values: points.map((point) => point.value[0] ?? 0),
    from: points[0] ? isoDay(points[0].time) : null,
    to: points.at(-1) ? isoDay(points.at(-1)!.time) : null,
  });
};

/** Returns the id of a suggested topic with the same title as the query, such as "/m/06h7j". */
export const topicIdFor = (text: string, query: string): string | null => {
  const parsed = parseJsonAs(stripXssi(text), Autocomplete, "autocomplete response");
  if (!parsed.ok) return null;
  const wanted = query.trim().toLowerCase();
  return parsed.value.default.topics.find((topic) => topic.title.trim().toLowerCase() === wanted)?.mid ?? null;
};

export const parseRelated = (text: string): Result<Related, string> => {
  const parsed = parseJsonAs(stripXssi(text), RankedList, "related queries response");
  if (!parsed.ok) return parsed;
  const [top, rising] = parsed.value.default.rankedList.map((list) =>
    list.rankedKeyword.slice(0, RELATED_LIMIT).map(({ query, formattedValue }) => ({ query, value: formattedValue })),
  );
  return ok({ top: top ?? [], rising: rising ?? [] });
};
