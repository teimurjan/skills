import { Command } from "commander";
import { openClient, type AdsFailure } from "./ads-api.ts";
import { criterionId, fail, geoIds, positiveInt } from "./cli-args.ts";
import { CREDENTIALS_PATH, loadCredentials } from "./credentials.ts";
import { itemsFromTerms, readItems, uniqueByKey } from "./items.ts";
import { runLookup, selectPending } from "./run.ts";
import { loadStore } from "./store.ts";

// The API takes 10,000 keywords in one request. Smaller batches lose less when one keyword is rejected.
const BATCH_SIZE = 1000;
const PACE_MS = 1100;
const BACKOFF_MS = [5_000, 30_000, 120_000];

const HINTS: Record<AdsFailure["kind"], string> = {
  rate_limited: "Wait, then run the same command again. It continues where it stopped.",
  auth: "Read the setup and error sections of the keyword-metrics SKILL.md.",
  bad_request: "Fix the input that the error names, then run the same command again.",
  bad_response: "Run the same command again. If it fails again, the response format changed.",
};

type Flags = {
  input?: string;
  out: string;
  limit?: number;
  geo: string[];
  language?: string;
  force?: boolean;
  credentials: string;
};

const program = new Command()
  .name("keyword-metrics")
  .description("Get monthly search volume and ad competition for keywords from the Google Ads API.")
  .argument("[keywords...]", "keywords to look up")
  .option("--input <path>", 'JSON array of keywords or of { "key", "query" } objects')
  .option("--out <path>", "results file, keyed by keyword or key", "keywords.json")
  .option("--limit <n>", "look up at most N keywords", positiveInt)
  .option("--geo <ids>", "comma-separated location ids such as 2840 for the US, default worldwide", geoIds, [])
  .option("--language <id>", "language id such as 1000 for English, default all languages", criterionId)
  .option("--force", "look up keywords again that already have data")
  .option("--credentials <path>", "credentials file", CREDENTIALS_PATH)
  .action(async (keywords: string[], flags: Flags) => {
    const fromFile = flags.input ? await readItems(flags.input) : null;
    if (fromFile && !fromFile.ok) fail(fromFile.error);
    const items = uniqueByKey([...itemsFromTerms(keywords), ...(fromFile?.value ?? [])]);
    if (items.length === 0) fail("give at least one keyword, or --input with at least one item");

    const store = await loadStore(flags.out);
    if (!store.ok) fail(store.error);

    const targeting = { geo: flags.geo, language: flags.language ?? null };
    const pending = selectPending(items, store.value, { targeting, limit: flags.limit, force: flags.force ?? false });
    if (pending.length === 0) {
      console.log(`nothing to look up: every keyword already has data in ${flags.out}`);
      return;
    }

    const credentials = await loadCredentials(flags.credentials);
    if (!credentials.ok) fail(`${credentials.error}\nRead the setup section of the keyword-metrics SKILL.md.`);
    const client = await openClient(credentials.value);
    if (!client.ok) fail(`${client.error.message}\n${HINTS[client.error.kind]}`);

    console.log(`looking up ${pending.length} keyword(s)`);
    const summary = await runLookup(client.value, pending, store.value, {
      targeting,
      storePath: flags.out,
      batchSize: BATCH_SIZE,
      paceMs: PACE_MS,
      backoffMs: BACKOFF_MS,
    });
    console.log(`\nok: ${summary.counts.ok}, no_data: ${summary.counts.no_data}. Results are in ${flags.out}`);
    if (summary.failure) fail(`${summary.failure.message}\n${HINTS[summary.failure.kind]}`);
  });

await program.parseAsync();
