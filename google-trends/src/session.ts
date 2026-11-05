import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { launchPersistentContext } from "cloakbrowser";
import type { Page, Response } from "playwright-core";
import { err, ok, type Result } from "./types.ts";
import {
  parseExplore,
  parseRelated,
  parseTimeline,
  readExploreRequest,
  topicIdFor,
  type Related,
  type Timeline,
} from "./payload.ts";

export type SearchSpec = { geo: string; timeframe: string };

export type Capture = {
  keyword: string;
  timeline: Timeline | null;
  related: Related | null;
  via: "typed" | "url";
};

export type SearchFailure = {
  kind: "blocked" | "no_explore" | "wrong_search" | "timeout" | "bad_response";
  message: string;
};

export type TrendsSession = {
  search: (query: string) => Promise<Result<Capture, SearchFailure>>;
  close: () => Promise<void>;
};

const PROFILE_DIR = join(homedir(), ".cache", "google-trends", "profile");
const EXPLORE_URL = "https://trends.google.com/trends/explore";
const API = {
  explore: "/trends/api/explore",
  timeline: "/trends/api/widgetdata/multiline",
  related: "/trends/api/widgetdata/relatedsearches",
  autocomplete: "/trends/api/autocomplete/",
} as const;
// Trends has no stable ids, so match the search box by its accessible name first.
const SEARCH_INPUT = [
  'input[aria-label*="search term" i]',
  'input[placeholder*="search term" i]',
  'input[aria-label*="search" i]',
  'input[type="search"]',
].join(", ");
// The search box is an Angular Material autocomplete. Each item has a title and a type.
const SUGGESTION = {
  item: "li[md-virtual-repeat]",
  title: ".autocomplete-title",
  type: ".autocomplete-desc",
  plainTerm: "Search term",
} as const;
const EXPLORE_TIMEOUT_MS = 15_000;
const TIMELINE_TIMEOUT_MS = 20_000;
const RELATED_TIMEOUT_MS = 6_000;
const SUGGESTION_TIMEOUT_MS = 2_500;
const SUGGESTION_SETTLE_MS = 400;
const CONSENT_TIMEOUT_MS = 5 * 60_000;
const SETTLE_MS = 3_000;
const POLL_MS = 250;
const TYPE_DELAY_MS = 90;

export const exploreUrl = (spec: SearchSpec, query?: string): string => {
  const url = new URL(EXPLORE_URL);
  url.searchParams.set("date", spec.timeframe);
  if (spec.geo) url.searchParams.set("geo", spec.geo);
  if (query) url.searchParams.set("q", query);
  url.searchParams.set("hl", "en-US");
  return url.toString();
};

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const poll = async <T>(probe: () => T | undefined, timeoutMs: number): Promise<T | undefined> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = probe();
    if (found !== undefined || Date.now() > deadline) return found;
    await sleep(POLL_MS);
  }
};

/** Records every Trends API response from now on, so none is missed between two awaits. */
const collect = (page: Page) => {
  const responses: Response[] = [];
  const onResponse = (response: Response) => {
    if (response.url().includes("/trends/api/")) responses.push(response);
  };
  page.on("response", onResponse);
  return { responses, stop: () => page.off("response", onResponse) };
};

const findApi = (responses: readonly Response[], path: string, token?: string): Response | undefined =>
  responses.find((response) => {
    const url = new URL(response.url());
    return url.pathname === path && (token === undefined || url.searchParams.get("token") === token);
  });

const BLOCKED: SearchFailure = { kind: "blocked", message: "Google answered with 429 or a captcha page" };

const isBlocked = (page: Page, responses: readonly Response[]): boolean =>
  page.url().includes("/sorry/") || responses.some((response) => response.status() === 429);

const passConsent = async (page: Page): Promise<void> => {
  if (!page.url().includes("consent.")) return;
  console.log("  Google asks for cookie consent. Accept it in the browser window. Waiting up to 5 minutes.");
  await page.waitForURL(/trends\.google\.com/, { timeout: CONSENT_TIMEOUT_MS });
};

/** Types the query into the search box and picks a matching topic suggestion if Trends offers one. */
/** Returns how it submitted the search, or null when the page has no search box. */
const typeQuery = async (page: Page, query: string): Promise<"topic" | "enter" | null> => {
  const input = page.locator(SEARCH_INPUT).filter({ visible: true }).first();
  if (!(await input.isVisible())) return null;
  await input.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(query, { delay: TYPE_DELAY_MS });
  const topic = await findTopicSuggestion(page, query);
  if (!topic) {
    await page.keyboard.press("Enter");
    return "enter";
  }
  await topic.click();
  return "topic";
};

/** A suggestion with the same title that is not a plain search term is an entity, which Trends calls a topic. */
const findTopicSuggestion = async (page: Page, query: string) => {
  const title = new RegExp(`^\\s*${escapeRegExp(query)}\\s*$`, "i");
  // The plain search term row shows at once, so wait for an entity row, which comes from a later request.
  const entity = page
    .locator(SUGGESTION.item)
    .filter({ visible: true })
    .filter({ has: page.locator(SUGGESTION.title, { hasText: title }) })
    .filter({ hasNot: page.locator(SUGGESTION.type, { hasText: SUGGESTION.plainTerm }) })
    .first();
  const found = await entity.waitFor({ timeout: SUGGESTION_TIMEOUT_MS }).then(() => true, () => false);
  if (!found) return null;
  // More rows can still arrive and move the list, so let it settle before the click.
  await sleep(SUGGESTION_SETTLE_MS);
  return (await entity.count()) > 0 ? entity : null;
};

const readTopicId = async (responses: readonly Response[], query: string): Promise<string | null> => {
  for (const response of responses) {
    if (!new URL(response.url()).pathname.startsWith(API.autocomplete) || !response.ok()) continue;
    const id = topicIdFor(await response.text(), query);
    if (id) return id;
  }
  return null;
};

/** Returns null when the response never came or failed, so the term is searched again. */
const readRelated = async (page: Page, responses: readonly Response[], token: string | null): Promise<Related | null> => {
  if (token === null) return { top: [], rising: [] };
  const find = () => findApi(responses, API.related, token);
  let response = await poll(find, RELATED_TIMEOUT_MS);
  if (!response) {
    // The related queries widget can wait until it scrolls into view.
    await page.mouse.wheel(0, 1600);
    response = await poll(find, RELATED_TIMEOUT_MS);
    await page.mouse.wheel(0, -4000);
  }
  if (!response?.ok()) return null;
  const related = parseRelated(await response.text());
  return related.ok ? related.value : null;
};

const awaitCapture = async (
  page: Page,
  responses: readonly Response[],
  spec: SearchSpec,
  via: Capture["via"],
): Promise<Result<Capture, SearchFailure>> => {
  const explore = await poll(
    () => (isBlocked(page, responses) ? "blocked" : findApi(responses, API.explore)),
    EXPLORE_TIMEOUT_MS,
  );
  if (explore === "blocked") return err(BLOCKED);
  if (!explore) return err({ kind: "no_explore", message: "the page sent no explore request" });
  if (explore.status() === 429) return err(BLOCKED);
  if (!explore.ok()) return err({ kind: "bad_response", message: `explore returned ${explore.status()}` });

  const request = readExploreRequest(explore.url());
  if (!request.ok) return err({ kind: "bad_response", message: request.error });
  if (request.value.time !== spec.timeframe || request.value.geo !== spec.geo) {
    return err({ kind: "wrong_search", message: `page searched ${request.value.time} in "${request.value.geo}"` });
  }
  const tokens = parseExplore(await explore.text());
  if (!tokens.ok) return err({ kind: "bad_response", message: tokens.error });
  const capture = { keyword: request.value.keyword, via };
  if (tokens.value.timeseries === null) return ok({ ...capture, timeline: null, related: null });

  const timelineResponse = await poll(() => findApi(responses, API.timeline, tokens.value.timeseries!), TIMELINE_TIMEOUT_MS);
  if (!timelineResponse) return err({ kind: "timeout", message: "no timeline response" });
  if (timelineResponse.status() === 429) return err(BLOCKED);
  const timeline = parseTimeline(await timelineResponse.text());
  if (!timeline.ok) return err({ kind: "bad_response", message: timeline.error });
  if (timeline.value === null) return ok({ ...capture, timeline: null, related: null });

  const related = await readRelated(page, responses, tokens.value.relatedQueries);
  return ok({ ...capture, timeline: timeline.value, related });
};

/**
 * Opens one stealth Chromium window and keeps it for the whole run.
 * Each search types into the open page. It loads the explore URL only when typing does not work.
 */
export const openSession = async (spec: SearchSpec): Promise<TrendsSession> => {
  await mkdir(PROFILE_DIR, { recursive: true });
  const context = await launchPersistentContext({
    userDataDir: PROFILE_DIR,
    headless: false,
    humanize: true,
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(exploreUrl(spec), { waitUntil: "domcontentloaded" });
  await passConsent(page);
  await sleep(SETTLE_MS);

  // A failed typed search falls back to the URL for that search only. Loading the URL also resets the page.
  const searchByTyping = async (query: string): Promise<{ result: Result<Capture, SearchFailure> } | { fallback: string }> => {
    const collector = collect(page);
    try {
      const submitted = await typeQuery(page, query);
      if (!submitted) {
        console.log("  no search box on the page, loading the URL");
        return { fallback: query };
      }
      const result = await awaitCapture(page, collector.responses, spec, "typed");
      if (result.ok || (result.error.kind !== "no_explore" && result.error.kind !== "wrong_search")) return { result };
      // Keep the topic when its click did not search: the autocomplete response has its id.
      const topicId = submitted === "topic" ? await readTopicId(collector.responses, query) : null;
      console.log(`  typing did not search after ${submitted === "topic" ? "a topic click" : "Enter"} (${result.error.message}), loading the URL`);
      return { fallback: topicId ?? query };
    } finally {
      collector.stop();
    }
  };

  const searchByUrl = async (keyword: string): Promise<Result<Capture, SearchFailure>> => {
    const collector = collect(page);
    try {
      await page.goto(exploreUrl(spec, keyword), { waitUntil: "domcontentloaded" });
      return await awaitCapture(page, collector.responses, spec, "url");
    } finally {
      collector.stop();
    }
  };

  return {
    search: async (query) => {
      const typed = await searchByTyping(query);
      return "result" in typed ? typed.result : searchByUrl(typed.fallback);
    },
    close: () => context.close(),
  };
};
