import { Command } from "commander";
import { fail, nonNegativeNumber, positiveInt } from "./cli-args.ts";
import { itemsFromTerms, readItems, uniqueByKey } from "./items.ts";
import { runFill, selectPending, type FillSummary } from "./run.ts";
import { openSession } from "./session.ts";
import { loadStore } from "./store.ts";

// The related queries call answers 429 to bursts. 12 s between searches stays well clear of that.
const DEFAULT_PACE_S = 12;
const TOP_GROWING = 10;

type Flags = {
  input?: string;
  out: string;
  limit?: number;
  geo: string;
  timeframe: string;
  pace: number;
  force?: boolean;
};

const printSummary = ({ counts, blocked, store }: FillSummary): void => {
  console.log(`\nok: ${counts.ok}, no_data: ${counts.no_data}, failed: ${counts.failed}`);
  const growing = Object.entries(store)
    .filter(([, entry]) => entry.summary?.verdict === "growing")
    .toSorted(([, a], [, b]) => (b.summary?.growthPct ?? Infinity) - (a.summary?.growthPct ?? Infinity))
    .slice(0, TOP_GROWING);
  if (growing.length > 0) {
    console.log("fastest growing so far:");
    for (const [key, entry] of growing) {
      const growth = entry.summary?.growthPct ?? null;
      console.log(`  ${growth === null ? "new" : `+${growth}%`}  ${key}`);
    }
  }
  if (blocked) {
    console.log(
      "\nstopped early: Google kept answering 429. Wait about an hour, then run the same command again. " +
        "It continues where it stopped. A larger --pace makes the next block less likely.",
    );
  }
};

const program = new Command()
  .name("google-trends")
  .description("Search terms in Google Trends from one open browser window and save the trend line and related queries.")
  .argument("[terms...]", "terms to search")
  .option("--input <path>", 'JSON array of terms or of { "key", "query" } objects')
  .option("--out <path>", "results file, keyed by term or key", "trends.json")
  .option("--limit <n>", "search at most N terms", positiveInt)
  .option("--geo <code>", "country code such as US, empty for worldwide", "")
  .option("--timeframe <range>", "Trends date range", "today 5-y")
  .option("--pace <seconds>", "average seconds between two searches", nonNegativeNumber, DEFAULT_PACE_S)
  .option("--force", "search terms again that already have data")
  .action(async (terms: string[], flags: Flags) => {
    const fromFile = flags.input ? await readItems(flags.input) : null;
    if (fromFile && !fromFile.ok) fail(fromFile.error);
    const items = uniqueByKey([...itemsFromTerms(terms), ...(fromFile?.value ?? [])]);
    if (items.length === 0) fail("give at least one term, or --input with at least one item");

    const store = await loadStore(flags.out);
    if (!store.ok) fail(store.error);

    const spec = { geo: flags.geo, timeframe: flags.timeframe };
    const selection = { spec, limit: flags.limit, force: flags.force ?? false };
    const pending = selectPending(items, store.value, selection);
    if (pending.length === 0) {
      console.log(`nothing to search: every term already has data in ${flags.out}`);
      return;
    }
    console.log(`searching ${pending.length} term(s), about ${Math.ceil((pending.length * (flags.pace + 10)) / 60)} min`);

    const controller = new AbortController();
    process.once("SIGINT", () => {
      console.log("\nstopping after this search. Press Ctrl+C again to quit now.");
      controller.abort();
    });

    const session = await openSession(spec);
    try {
      const summary = await runFill(session, pending, store.value, {
        ...selection,
        storePath: flags.out,
        paceMs: flags.pace * 1000,
        signal: controller.signal,
      });
      printSummary(summary);
      if (summary.blocked) process.exitCode = 1;
    } finally {
      await session.close();
    }
  });

await program.parseAsync();
