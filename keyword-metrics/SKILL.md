---
name: keyword-metrics
description: Get monthly search volume, ad competition (0 to 100) and top-of-page bids for any list of keywords from the Google Ads API, from any repo. It saves the results to a JSON file. Use it when the user asks for keyword volume, search volume, keyword competition, keyword complexity or difficulty, cost per click, or Keyword Planner data.
---

# Keyword metrics

`{baseDir}` is the directory of this `SKILL.md`. The commands run from the current project directory, so a relative `--out` path stays in that project.

The CLI calls `KeywordPlanIdeaService.GenerateKeywordHistoricalMetrics` in the Google Ads API. This is the same data as Keyword Planner.

## What the numbers mean

Google does not publish an SEO difficulty score. The competition values measure paid ads only. The index is the share of ad slots that advertisers fill. A keyword can have low ad competition and still be hard to rank for in organic results. Always say this when you report competition as complexity or difficulty.

| Field | Meaning |
| --- | --- |
| `avgMonthlySearches` | Approximate searches for each month, averaged over the past 12 months. |
| `competitionIndex` | Ad competition from 0 to 100. |
| `competition` | `LOW`, `MEDIUM` or `HIGH`. |
| `lowTopOfPageBid`, `highTopOfPageBid` | The 20th and 80th percentile of top-of-page bids, in the currency of the Google Ads account. |
| `monthly` | Approximate searches for each month. |
| `matchedText`, `closeVariants` | The text that Google reports. Google merges close variants, so "cars" can report as "car". |
| `status` | `ok`, or `no_data` if Google returned no volume. |

Google updates these metrics once a month, so results stay useful for that time. The CLI skips a keyword that already has data for the same location and language. Give `--force` to look up the keyword again.

## Setup

The user must do this setup, because it needs their Google sign-in. Do not read or print the credentials file. If the file does not exist, show the user these steps.

1. Get a Google Ads manager account and a developer token. The token page is in the API Center of the manager account.
2. In the Google Ads API Overview page of the Google Cloud project, apply for Explorer access, and then for Basic access. The Test level reads test accounts only, and the Explorer level blocks `KeywordPlanIdeaService`. Basic access needs a verified OAuth brand. For this, the user must own a domain and verify it in Google Search Console. The domain must host a home page that describes the app and links to a privacy policy on the same domain. On the Branding page of the Google Auth Platform, add the domain, the home page and the privacy policy, click Verify Branding, and then click Publish branding.
3. Create an OAuth consent screen with the scope `https://www.googleapis.com/auth/adwords`, and an OAuth client. Save the client JSON file as `client.json`.
4. Make sure that the Google account has a passkey. Google requires a passkey for a refresh token, and a new passkey can take up to 7 days to become trusted.
5. Get the refresh token. `CLOUDSDK_CONFIG` keeps this command from overwriting the application default credentials of the user.

   ```sh
   CLOUDSDK_CONFIG=~/.config/keyword-metrics/gcloud gcloud auth application-default login \
     --scopes=https://www.googleapis.com/auth/adwords,https://www.googleapis.com/auth/cloud-platform \
     --client-id-file=client.json
   ```

6. Copy `client_id`, `client_secret` and `refresh_token` from `~/.config/keyword-metrics/gcloud/application_default_credentials.json` into `~/.config/keyword-metrics/credentials.json`, then delete the `gcloud` directory. Give `loginCustomerId` only if access goes through a manager account.

   ```json
   {
     "developerToken": "...",
     "clientId": "...",
     "clientSecret": "...",
     "refreshToken": "...",
     "customerId": "123-456-7890",
     "loginCustomerId": "111-222-3333"
   }
   ```

7. Protect the file.

   ```sh
   chmod 600 ~/.config/keyword-metrics/credentials.json
   ```

Google documents the steps at https://developers.google.com/google-ads/api/docs/oauth/single-user-authentication.

## Steps

1. If `{baseDir}/node_modules` does not exist, install the dependencies once. The CLI needs Node 22.18 or later.

   ```sh
   pnpm --dir {baseDir} install --frozen-lockfile
   ```

2. Choose the input. Give keywords as arguments, or give `--input` with a JSON file for a long list. Use the `key` and `query` form if the results need a different name from the search text.

   ```json
   ["pickleball paddles", { "key": "Sports > Padel", "query": "padel" }]
   ```

3. Run the command.

   ```sh
   node {baseDir}/src/cli.ts "keyword one" "keyword two" [--input <file>] [--out keywords.json] [--geo 2840] [--language 1000]
   ```

4. Report the volume and the competition index for each keyword, and include the warning about SEO difficulty. Read the other fields from the results file if the user wants them.

If `node` in the project is older than 22.18, use a newer one for this command, for example `fnm exec --using=24 node {baseDir}/src/cli.ts ...`.

## Options

| Option | Effect |
| --- | --- |
| `--input <path>` | JSON array of keywords or of `{ "key", "query" }` objects. |
| `--out <path>` | Results file. The default is `keywords.json` in the current directory. |
| `--limit <n>` | Look up at most N keywords. |
| `--geo <ids>` | Comma-separated location ids, at most 10. The US is `2840`. The default is worldwide. |
| `--language <id>` | Language id. English is `1000`. The default is all languages. |
| `--force` | Look up keywords again that already have data. |
| `--credentials <path>` | Credentials file. The default is `~/.config/keyword-metrics/credentials.json`. |

Find location ids at https://developers.google.com/google-ads/api/data/geotargets and language ids at https://developers.google.com/google-ads/api/data/codes-formats#languages.

## Errors

The CLI saves each finished batch of 1000 keywords. After you fix the cause, run the same command again, and it continues where it stopped.

| Error | Cause and fix |
| --- | --- |
| `cannot read ...credentials.json` | The setup is not done. Show the user the setup steps. |
| `invalid_grant` | The refresh token expired or Google revoked it. Tell the user to do setup steps 5 and 6 again. |
| `DEVELOPER_TOKEN_NOT_APPROVED` | The token does not have the correct access level. Tell the user to apply for Basic access. |
| `USER_PERMISSION_DENIED` | The Google account cannot read `customerId`. If access goes through a manager account, tell the user to set `loginCustomerId`. |
| An error that names a keyword | Google rejected that keyword, and the batch failed. Remove the keyword from the input. |
| `RESOURCE_EXHAUSTED` | The CLI waits and tries again 3 times. If it stops, tell the user to wait and run it again. Basic access allows 15,000 operations each day. |

## Development

Run `pnpm typecheck` and `pnpm test` in `{baseDir}` after you change the source. The tests do not call Google. When Google sunsets the API version, update `API_VERSION` in `{baseDir}/src/ads-api.ts`.
