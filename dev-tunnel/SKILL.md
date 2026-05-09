---
name: dev-tunnel
description: >
  Start a local JS/TS dev server and expose it through an ngrok tunnel so the user can test it from a phone, another machine, or while away from their laptop. Trigger when the user says things like "expose my dev server", "ngrok this", "tunnel localhost", "share my local app", "test on my phone", "make my app reachable from outside", "I want to test this remotely", "give me a public URL for my dev server", or any variant where they want a public URL pointing at their local JS app. Also trigger when they reference remote-connect / SSH-from-phone scenarios and need a way to hit their dev server. Don't wait for the exact word "ngrok" — any "expose / share / tunnel / public link / mobile preview" intent in a Node/JS project should trigger this.
---

# Dev Tunnel: Run + Expose a JS Project via ngrok

The user wants a public URL pointing at a local JS/TS dev server so they can test it from outside their laptop. This skill handles the whole flow: pick the right script, run it in the background, find the port, open an ngrok tunnel, and report the URL back.

The user is on macOS. ngrok is already installed and authenticated (`ngrok` on PATH, authtoken configured). Don't re-install or re-auth.

## The flow at a glance

1. **Pick the script** — read `package.json`, decide which script to run (or ask if ambiguous).
2. **Detect the package manager** — from the lockfile.
3. **Start the dev server** in the background.
4. **Find the port** — by reading the server's startup output.
5. **Start ngrok** in the background, pointing at that port.
6. **Fetch the public URL** from ngrok's local API.
7. **Report the URL** to the user, plainly and prominently, with stop instructions.

Each step is small. Don't skip the verification at each step (process running? port found? URL returned?) — silent failures in any of them ruin the experience.

## Step 1 — Pick the script

Read `package.json` in the current working directory. Look at `scripts`. The candidates, in priority order, are:

- `dev`
- `start:dev` / `dev:server` / `dev:web` / similar `dev:*`
- `start`
- `serve`

Decision rule:

- **One obvious candidate** (e.g. only `dev` exists, or `dev` + a clearly non-server script like `lint`/`build`/`test`): run it without asking.
- **Multiple plausible dev candidates** (e.g. both `dev` and `storybook`, or `dev` and `dev:server`, or `start` and `serve` for genuinely different things): list them and ask the user to pick.
- **No candidate**: tell the user no dev script was found and ask what command to run.

The bar for "ambiguous" is low — if there's any reasonable chance the user meant a different one, ask. A 3-second clarification beats tunneling the wrong thing.

## Step 2 — Detect the package manager

Check the lockfile in the project root:

| File | Manager | Run command |
|---|---|---|
| `bun.lockb` or `bun.lock` | bun | `bun run <script>` |
| `pnpm-lock.yaml` | pnpm | `pnpm <script>` |
| `yarn.lock` | yarn | `yarn <script>` |
| `package-lock.json` (or none) | npm | `npm run <script>` |

If multiple lockfiles exist, prefer the most recently modified one — that's typically the active manager.

## Step 3 — Start the dev server in the background

Use `Bash` with `run_in_background: true`. Capture the bash shell ID — you'll need it to read output and to kill it later.

Important: do NOT block on the dev server. It's a long-running process and won't exit on its own.

## Step 4 — Find the port

Use `BashOutput` to read the dev server's stdout. Most JS dev tools print the port within ~5 seconds. Look for one of these patterns:

- `Local:   http://localhost:5173/` (Vite)
- `localhost:3000` (Next, CRA, Express)
- `running at http://[::]:4321` (Astro)
- `On Your Network:  http://192.168.x.x:8080` (CRA-style)

Strategy:
1. Wait briefly (2–4s), then call `BashOutput` on the dev-server shell.
2. Regex the output for `localhost:(\d+)` or `:(\d{4,5})\b` after a "Local"/"Listening"/"running" cue.
3. If nothing yet, wait another 3s and re-read. Try this up to ~3 times (total ~10s).
4. If still nothing, fall back: `lsof -iTCP -sTCP:LISTEN -P -n | grep -E 'node|bun|deno'` and pick the highest-numbered port that wasn't already in use before starting. As a last resort, ask the user.

If the server crashes (output shows error, process exits), surface the error and stop — don't try to tunnel a dead server.

## Step 5 — Start ngrok

Once you have the port, start ngrok in the background:

```bash
ngrok http --host-header=rewrite <PORT> --log=stdout
```

The `--host-header=rewrite` flag rewrites the `Host` header to match the upstream. This is important: many dev servers (Vite especially) reject requests where the `Host` header doesn't match what they expect, and without this flag the user gets a confusing "Blocked request. This host is not allowed." error from their phone. The rewrite makes it look like a normal localhost request to the dev server.

`--log=stdout` makes the output captureable; without it ngrok's TUI swallows everything.

Capture the bash shell ID for ngrok separately from the dev server's.

## Step 6 — Fetch the public URL

ngrok exposes a local API at `http://localhost:4040/api/tunnels`. Wait ~2s after starting ngrok, then:

```bash
curl -s http://localhost:4040/api/tunnels | python3 -c 'import sys,json; print(json.load(sys.stdin)["tunnels"][0]["public_url"])'
```

If the API isn't up yet, wait another 2s and retry (up to ~3 times). If it never responds, read `BashOutput` from the ngrok shell — startup errors (auth issues, port conflicts) show up there.

## Step 7 — Report the URL

Print the URL in a way that's easy to spot on a phone screen. Plain and prominent — no fancy boxes, just clear text:

```
Public URL: https://abcd-1234.ngrok-free.app
  → forwarding to localhost:5173 (vite)

To stop: kill background shells <dev-shell-id> and <ngrok-shell-id>,
or run `pkill -f ngrok` and stop the dev server shell.
```

Include:
- The URL on its own line, easy to copy.
- What it points at (port + which script/framework).
- How to stop both processes when done.

Don't add "happy testing!" fluff. The user is on a phone trying to read this — get out of the way.

## Edge cases worth handling

- **Already-running dev server**: if the user says something like "tunnel my running server on :3000", skip steps 1–4 and go straight to ngrok with that port.
- **Port already in use**: the dev script will likely fail; surface the error and ask whether to kill the existing process or pick a different port.
- **ngrok session limit**: free accounts allow one tunnel at a time. If `ngrok` errors with "session limit", check for a previous ngrok process (`pgrep -fl ngrok`) and ask before killing it.
- **Monorepo with multiple `package.json`s**: ask which workspace/app to expose unless the user already specified.
- **Dev server binds only to `127.0.0.1`**: this is fine — ngrok connects locally, not over LAN. No `--host 0.0.0.0` needed.
- **Dev server is HTTPS** (rare for `dev`): use `ngrok http https://localhost:<port>` instead of plain port. ngrok will accept a URL form here.

## Why this skill exists

The user wants to keep working/testing while away from their laptop, via SSH or remote-connect. The "publish a tunnel" dance is mechanical but full of small gotchas (host-header rejections, picking the wrong script, missing the port in output, ngrok TUI eating logs). This skill collapses it into a single ask: **start the thing and give me a link**.
