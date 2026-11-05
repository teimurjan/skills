---
name: google-trends
description: Search any list of terms in Google Trends from any repo. One stealth Chromium window stays open for the whole run, and the scraper types each term into the Trends search box. It saves the trend line, a verdict (growing, steady, spiky, declining) and the related searches to a JSON file. Use it when the user asks to check Google Trends, check demand or search interest for a keyword, niche or product idea, or asks if a term is growing or declining.
---

# Google Trends

`{baseDir}` is the directory of this `SKILL.md`. The commands run from the current project directory, so a relative `--out` path stays in that project.

## How the scraper works

The CLI opens one Chromium window with the browser profile in `~/.cache/google-trends/profile`. All projects share this profile. Do not start two runs at the same time, because Chromium locks the profile.

For each term, the scraper types the query into the Trends search box. If Trends suggests a topic with the same name, the scraper picks the topic, because a topic groups related terms in all languages. It reads the data from the Trends API responses of the page, not from the chart. If typing does not start a search, the scraper loads the explore URL in the same tab for that search. Each output line shows `(typed)` or `(url)`.

The scraper saves the results file after each search. A stopped run continues where it stopped. It skips a term that already has data for the same region and date range.

## Steps

1. If `{baseDir}/node_modules` does not exist, install the dependencies once. The CLI needs Node 22.18 or later. CloakBrowser downloads about 200 MB on the first run.

   ```sh
   pnpm --dir {baseDir} install --frozen-lockfile
   ```

2. Choose the input. Give terms as arguments, or give `--input` with a JSON file for a long list. Use the `key` and `query` form if the results need a different name from the search text.

   ```json
   ["pickleball paddles", { "key": "Sports > Padel", "query": "padel" }]
   ```

3. For more than 10 terms, run a trial first with `--limit 3`, and read the 3 output lines. If every line shows `(url)`, typing does not work, and the selectors in `{baseDir}/src/session.ts` need an update. Tell the user.
4. Start the run. Each term takes about 22 seconds at the default pace. For more than 5 terms, start the command as a background shell command and wait for it to end.

   ```sh
   node {baseDir}/src/cli.ts "term one" "term two" [--input <file>] [--out trends.json] [--geo US]
   ```

5. If the output says that Google asks for cookie consent, tell the user to accept it in the browser window. The run waits 5 minutes.
6. If the run ends with `stopped early`, Google is rate limiting. Tell the user to wait about an hour and run the same command again.
7. Report the verdict and the growth for each term. Read `top` and `rising` from the results file if the user wants related searches. Say that Trends scales each search to its own peak of 100. A verdict compares a line with its own past, not with other terms.

If `node` in the project is older than 22.18, use a newer one for this command, for example `fnm exec --using=24 node {baseDir}/src/cli.ts ...`.

## Options

| Option | Effect |
| --- | --- |
| `--input <path>` | JSON array of terms or of `{ "key", "query" }` objects. |
| `--out <path>` | Results file. The default is `trends.json` in the current directory. |
| `--limit <n>` | Search at most N terms. |
| `--geo <code>` | Country code, such as `US`. Empty means worldwide. |
| `--timeframe <range>` | Trends date range. The default is `today 5-y`. |
| `--pace <seconds>` | Average time between two searches. The default is 12. |
| `--force` | Search terms again that already have data. |

## Results file

The file is a JSON object keyed by the term or by `key`. These fields are the most useful:

| Field | Meaning |
| --- | --- |
| `status` | `ok`, `no_data` or `failed`. |
| `summary` | `mean`, `growthPct`, `volatility` and `verdict`. |
| `values`, `from`, `to` | The trend line and its first and last dates. |
| `top`, `rising` | Up to 10 related searches of each type. |
| `kind`, `keyword` | `topic` or `term`, and what Trends searched. |

## Verdicts

`{baseDir}/src/summary.ts` compares the mean of the first fifth of the line with the mean of the last fifth.

| Verdict | Rule |
| --- | --- |
| `growing` | The line rose more than 15%. |
| `declining` | The line fell more than 15%. |
| `steady` | The change is 15% or less. |
| `spiky` | The mean week-to-week change is more than 25% of the mean. A small search often looks like this. |
| `no_data` | Trends has no data, or the mean is below 1. |

## Development

Run `pnpm typecheck` and `pnpm test` in `{baseDir}` after you change the source. The tests do not open a browser.
