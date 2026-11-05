import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMetricsRequest, describeApiError, openClient, type AdsClient } from "../src/ads-api.ts";
import { CredentialsFile } from "../src/credentials.ts";
import { findResult, indexResults, parseMetricsResponse, toEntry, type KeywordResult } from "../src/metrics.ts";
import { runLookup, selectPending } from "../src/run.ts";

const WORLD = { geo: [], language: null };
const NOW = "2026-11-05T00:00:00Z";

const LIVE_SHAPED_RESPONSE = JSON.stringify({
  results: [
    {
      text: "car",
      closeVariants: ["cars"],
      keywordMetrics: {
        avgMonthlySearches: "1500",
        competition: "MEDIUM",
        competitionIndex: "42",
        lowTopOfPageBidMicros: "1250000",
        highTopOfPageBidMicros: "3400000",
        monthlySearchVolumes: [
          { month: "FEBRUARY", year: "2026", monthlySearches: "210" },
          { month: "JANUARY", year: "2026", monthlySearches: "190" },
          { month: "DECEMBER", year: "2025" },
        ],
      },
    },
    { text: "unknown thing", keywordMetrics: {} },
  ],
});

const parsedResults = (): KeywordResult[] => {
  const parsed = parseMetricsResponse(LIVE_SHAPED_RESPONSE);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
};

const entryFor = (query: string) =>
  toEntry({ key: query, query }, findResult(indexResults(parsedResults()), query), WORLD, NOW);

describe("toEntry", () => {
  it("reads numbers that the API sends as strings and converts bids from micros", () => {
    expect(entryFor("car")).toMatchObject({
      status: "ok",
      avgMonthlySearches: 1500,
      competition: "MEDIUM",
      competitionIndex: 42,
      lowTopOfPageBid: 1.25,
      highTopOfPageBid: 3.4,
    });
  });

  it("sorts the months and keeps a missing month as null", () => {
    expect(entryFor("car").monthly).toEqual([
      { month: "2025-12", searches: null },
      { month: "2026-01", searches: 190 },
      { month: "2026-02", searches: 210 },
    ]);
  });

  it("finds a keyword that Google merged into a close variant", () => {
    expect(entryFor("cars")).toMatchObject({ matchedText: "car", avgMonthlySearches: 1500 });
  });

  it("ignores case and punctuation when it matches a keyword", () => {
    expect(entryFor("  CAR! ").matchedText).toBe("car");
  });

  it.each([["no metrics in the result", "unknown thing"], ["no result at all", "missing"]])("reports no data for %s", (_, query) => {
    expect(entryFor(query)).toMatchObject({ status: "no_data", avgMonthlySearches: null, competitionIndex: null });
  });
});

describe("parseMetricsResponse", () => {
  it("treats a response without results as empty", () => {
    expect(parseMetricsResponse("{}")).toEqual({ ok: true, value: [] });
  });

  it("rejects text that is not JSON", () => {
    expect(parseMetricsResponse("<html>").ok).toBe(false);
  });
});

describe("buildMetricsRequest", () => {
  it("sends resource names for the targeting", () => {
    expect(buildMetricsRequest(["a"], { geo: ["2840"], language: "1000" })).toEqual({
      keywords: ["a"],
      keywordPlanNetwork: "GOOGLE_SEARCH",
      geoTargetConstants: ["geoTargetConstants/2840"],
      language: "languageConstants/1000",
    });
  });

  it("leaves out the targeting for a worldwide search", () => {
    expect(buildMetricsRequest(["a"], WORLD)).toEqual({ keywords: ["a"], keywordPlanNetwork: "GOOGLE_SEARCH" });
  });
});

describe("describeApiError", () => {
  it("names the Google Ads error, its location and the request id", () => {
    const body = JSON.stringify({
      error: {
        message: "Request contains an invalid argument.",
        details: [{
          requestId: "abc",
          errors: [{
            errorCode: { queryError: "BAD_VALUE" },
            message: "Bad keyword",
            trigger: { stringValue: "bad!" },
            location: { fieldPathElements: [{ fieldName: "keywords", index: 3 }] },
          }],
        }],
      },
    });
    expect(describeApiError(400, body)).toBe('BAD_VALUE: Bad keyword: "bad!": at keywords[3] (request id abc)');
  });

  it("falls back to the HTTP status for a body that is not JSON", () => {
    expect(describeApiError(502, "<html>")).toBe("HTTP 502");
  });
});

describe("CredentialsFile", () => {
  const valid = { developerToken: "d", clientId: "c", clientSecret: "s", refreshToken: "r", customerId: "123-456-7890" };

  it("removes dashes and whitespace from a customer id", () => {
    const parsed = CredentialsFile.safeParse({ ...valid, customerId: " 123-456-7890\n" });
    expect(parsed.success && parsed.data.customerId).toBe("1234567890");
  });

  it("rejects a short customer id without printing the secrets", () => {
    const parsed = CredentialsFile.safeParse({ ...valid, customerId: "123", clientSecret: "TOP-SECRET" });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).not.toContain("TOP-SECRET");
  });
});

describe("openClient", () => {
  const credentials = {
    developerToken: "dev-token",
    clientId: "client",
    clientSecret: "secret",
    refreshToken: "refresh",
    customerId: "1234567890",
    loginCustomerId: "9876543210",
  };
  const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  /** Answers the token request, then gives each later request the given response. */
  const stubFetch = (metricsResponse: () => Response) => {
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) =>
      url.includes("oauth2") ? respond(200, { access_token: "access" }) : metricsResponse(),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };
  const fetchMetrics = async () => {
    const client = await openClient(credentials);
    if (!client.ok) throw new Error(client.error.message);
    return client.value.fetchMetrics(["car"], { geo: ["2840"], language: "1000" });
  };

  afterEach(() => vi.unstubAllGlobals());

  it("posts to the historical metrics endpoint with the required headers", async () => {
    const fetchMock = stubFetch(() => new Response(LIVE_SHAPED_RESPONSE));
    const result = await fetchMetrics();
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("https://googleads.googleapis.com/v26/customers/1234567890:generateKeywordHistoricalMetrics");
    expect(init.headers).toMatchObject({
      authorization: "Bearer access",
      "developer-token": "dev-token",
      "login-customer-id": "9876543210",
    });
    expect(result.ok && result.value.map((item) => item.text)).toEqual(["car", "unknown thing"]);
  });

  it.each([
    ["rate_limited", 429, { error: { status: "RESOURCE_EXHAUSTED", message: "slow down" } }],
    ["auth", 403, { error: { message: "token not approved" } }],
    ["bad_request", 400, { error: { message: "bad input" } }],
  ])("reports %s for HTTP %i", async (kind, status, body) => {
    stubFetch(() => respond(status, body));
    const result = await fetchMetrics();
    expect(!result.ok && result.error.kind).toBe(kind);
  });

  it("reports a failed token refresh by its error code and never by the secret", async () => {
    vi.stubGlobal("fetch", async () => respond(400, { error: "invalid_grant" }));
    const client = await openClient(credentials);
    expect(!client.ok && client.error).toEqual({ kind: "auth", message: "token refresh failed: invalid_grant" });
  });
});

describe("selectPending", () => {
  const items = [{ key: "a", query: "a" }, { key: "b", query: "b" }];
  const stored = { a: entryFor("car") };
  const selection = { targeting: WORLD, limit: undefined, force: false };
  const keys = (overrides = {}) => selectPending(items, stored, { ...selection, ...overrides }).map((item) => item.key);

  it("skips a keyword that has data for the same targeting", () => {
    expect(keys()).toEqual(["b"]);
  });

  it("looks up again when the targeting changed or force is set", () => {
    expect(keys({ targeting: { geo: ["2840"], language: null } })).toEqual(["a", "b"]);
    expect(keys({ force: true })).toEqual(["a", "b"]);
  });

  it("applies the limit after it skips", () => {
    expect(keys({ limit: 1 })).toEqual(["b"]);
  });
});

describe("runLookup", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "keyword-metrics-"));
  });
  afterEach(() => rm(dir, { recursive: true }));

  const items = ["a", "b", "c"].map((query) => ({ key: `key ${query}`, query }));
  const options = () => ({ targeting: WORLD, storePath: join(dir, "out.json"), batchSize: 2, paceMs: 0, backoffMs: [0] });
  const answer = (keywords: readonly string[]) => ({
    ok: true as const,
    value: keywords.map((text) => ({ text, keywordMetrics: { avgMonthlySearches: 10 } })),
  });
  const savedKeys = async () => Object.keys(JSON.parse(await readFile(options().storePath, "utf8")));

  it("sends batches and saves results under the key", async () => {
    const sent: (readonly string[])[] = [];
    const client: AdsClient = { fetchMetrics: async (keywords) => (sent.push(keywords), answer(keywords)) };
    const summary = await runLookup(client, items, {}, options());
    expect(sent).toEqual([["a", "b"], ["c"]]);
    expect(summary.counts).toEqual({ ok: 3, no_data: 0 });
    expect(await savedKeys()).toEqual(["key a", "key b", "key c"]);
  });

  it("retries a rate limited request", async () => {
    let calls = 0;
    const client: AdsClient = {
      fetchMetrics: async (keywords) =>
        ++calls === 1 ? { ok: false, error: { kind: "rate_limited", message: "slow" } } : answer(keywords),
    };
    expect((await runLookup(client, items.slice(0, 1), {}, options())).failure).toBeNull();
    expect(calls).toBe(2);
  });

  it("keeps earlier batches when a later batch fails", async () => {
    let calls = 0;
    const failure = { kind: "bad_request" as const, message: "bad keyword" };
    const client: AdsClient = {
      fetchMetrics: async (keywords) => (++calls === 2 ? { ok: false, error: failure } : answer(keywords)),
    };
    expect((await runLookup(client, items, {}, options())).failure).toEqual(failure);
    expect(await savedKeys()).toEqual(["key a", "key b"]);
  });
});
