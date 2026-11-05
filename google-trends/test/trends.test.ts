import { describe, expect, it } from "vitest";
import { itemsFromTerms, uniqueByKey } from "../src/items.ts";
import { parseExplore, parseRelated, parseTimeline, readExploreRequest, topicIdFor } from "../src/payload.ts";
import { selectPending, toEntry } from "../src/run.ts";
import type { TrendEntry } from "../src/store.ts";
import { summarizeTimeline } from "../src/summary.ts";

const SPEC = { geo: "", timeframe: "today 5-y" };

describe("search items", () => {
  it("uses a term as its own key and drops blank terms", () => {
    expect(itemsFromTerms([" pickleball ", "  "])).toEqual([{ key: "pickleball", query: "pickleball" }]);
  });

  it("keeps one item per key", () => {
    const items = [
      { key: "a", query: "a" },
      { key: "b", query: "b" },
      { key: "a", query: "a" },
    ];
    expect(uniqueByKey(items).map((item) => item.key)).toEqual(["a", "b"]);
  });
});

describe("payload parsers", () => {
  it("reads widget tokens behind the XSSI prefix", () => {
    const text = `)]}'\n{"widgets":[{"id":"TIMESERIES","token":"t1"},{"id":"GEO_MAP","token":"g"},{"id":"RELATED_QUERIES","token":"r1"}]}`;
    expect(parseExplore(text)).toEqual({ ok: true, value: { timeseries: "t1", relatedQueries: "r1" } });
  });

  it("reads the searched keyword from the explore URL", () => {
    const req = JSON.stringify({ comparisonItem: [{ keyword: "/m/0abc", geo: "US", time: "today 5-y" }], category: 0 });
    const url = `https://trends.google.com/trends/api/explore?hl=en-US&req=${encodeURIComponent(req)}`;
    expect(readExploreRequest(url)).toEqual({ ok: true, value: { keyword: "/m/0abc", geo: "US", time: "today 5-y" } });
  });

  it("drops the partial point of a timeline", () => {
    const text = `)]}',\n${JSON.stringify({
      default: {
        timelineData: [
          { time: "1609459200", value: [40], hasData: [true] },
          { time: "1610064000", value: [60], hasData: [true] },
          { time: "1610668800", value: [10], hasData: [true], isPartial: true },
        ],
      },
    })}`;
    expect(parseTimeline(text)).toEqual({ ok: true, value: { values: [40, 60], from: "2021-01-01", to: "2021-01-08" } });
  });

  it("returns null for a timeline without data", () => {
    const text = JSON.stringify({ default: { timelineData: [{ time: "1609459200", value: [0], hasData: [false] }] } });
    expect(parseTimeline(text)).toEqual({ ok: true, value: null });
  });

  it("finds the suggested topic with the same title", () => {
    const text = `)]}',\n${JSON.stringify({
      default: {
        topics: [
          { mid: "/g/11j317l_0k", title: "Logo design", type: "Topic" },
          { mid: "/g/11zj2tjfc0", title: "Logo Design Studio", type: "Topic" },
        ],
      },
    })}`;
    expect(topicIdFor(text, "logo design")).toBe("/g/11j317l_0k");
    expect(topicIdFor(text, "Logo maker")).toBeNull();
  });

  it("splits related queries into top and rising", () => {
    const text = `)]}',\n${JSON.stringify({
      default: {
        rankedList: [
          { rankedKeyword: [{ query: "co parenting app", formattedValue: "100" }] },
          { rankedKeyword: [{ query: "ourfamilywizard", formattedValue: "Breakout" }] },
        ],
      },
    })}`;
    expect(parseRelated(text)).toEqual({
      ok: true,
      value: { top: [{ query: "co parenting app", value: "100" }], rising: [{ query: "ourfamilywizard", value: "Breakout" }] },
    });
  });
});

describe("summarizeTimeline", () => {
  const line = (from: number, to: number, length = 50) =>
    Array.from({ length }, (_, index) => from + ((to - from) * index) / (length - 1));

  it.each([
    ["growing", line(40, 80)],
    ["declining", line(80, 40)],
    ["steady", line(60, 62)],
    ["spiky", Array.from({ length: 50 }, (_, index) => (index % 2 === 0 ? 10 : 90))],
    ["no_data", Array.from({ length: 50 }, () => 0)],
  ])("calls the line %s", (verdict, values) => {
    expect(summarizeTimeline(values).verdict).toBe(verdict);
  });

  it("measures growth from the first fifth to the last fifth", () => {
    expect(summarizeTimeline([50, 50, 60, 70, 100]).growthPct).toBe(100);
  });
});

describe("selectPending", () => {
  const ITEMS = [
    { key: "Coffee", query: "Coffee" },
    { key: "Food > Tea", query: "Tea" },
    { key: "Wine", query: "Wine" },
  ];

  const entry = (status: TrendEntry["status"], geo = ""): TrendEntry =>
    toEntry("q", status === "failed" ? { ok: false, error: { kind: "timeout", message: "x" } } : {
      ok: true,
      value: { keyword: "q", timeline: status === "ok" ? { values: [50, 50], from: null, to: null } : null, related: { top: [], rising: [] }, via: "typed" },
    }, { geo, timeframe: "today 5-y" }, "2026-10-31T00:00:00Z");

  const base = { spec: SPEC, limit: undefined, force: false };
  const keys = (store: Record<string, TrendEntry>, overrides = {}) =>
    selectPending(ITEMS, store, { ...base, ...overrides }).map((item) => item.key);

  it("skips settled items and retries failed ones", () => {
    const store = { Coffee: entry("ok"), Wine: entry("failed"), "Food > Tea": entry("no_data") };
    expect(keys(store)).toEqual(["Wine"]);
  });

  it("applies the limit after it skips settled items", () => {
    expect(keys({ Coffee: entry("ok") }, { limit: 1 })).toEqual(["Food > Tea"]);
  });

  it("searches again when the region changed or --force is set", () => {
    const store = { Coffee: entry("ok", "US"), "Food > Tea": entry("ok"), Wine: entry("ok") };
    expect(keys(store)).toEqual(["Coffee"]);
    expect(keys(store, { force: true })).toEqual(["Coffee", "Food > Tea", "Wine"]);
  });

  it("searches again when the related searches did not arrive", () => {
    const missing = toEntry("q", {
      ok: true,
      value: { keyword: "q", timeline: { values: [50, 50], from: null, to: null }, related: null, via: "typed" },
    }, SPEC, "2026-10-31T00:00:00Z");
    expect(missing.relatedStatus).toBe("missing");
    expect(keys({ Coffee: missing, "Food > Tea": entry("ok"), Wine: entry("ok") })).toEqual(["Coffee"]);
  });

  it("marks a topic id as a topic", () => {
    const topic = toEntry("Co-parenting", {
      ok: true,
      value: { keyword: "/m/04_xyz", timeline: { values: [40, 60], from: null, to: null }, related: null, via: "typed" },
    }, SPEC, "2026-10-31T00:00:00Z");
    expect([topic.kind, topic.status]).toEqual(["topic", "ok"]);
  });
});
