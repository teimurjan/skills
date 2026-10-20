import { watch } from "node:fs";
import path from "node:path";

/**
 * `bun run dev`: `next dev`, and beside it the funnel rebuilt on every change to what it is
 * built from. One process rather than `a & b` in the script line, because a shell ignores
 * SIGINT for a command it put in the background, and Ctrl-C would then take Next and leave
 * the watcher running for good. This process lives exactly as long as `next dev` does.
 *
 * `next dev` serves whatever is under `public/funnel/` at the moment of the request and never
 * notices the files change, so the reload is the page's own (`devReload` in the build), keyed
 * on the build id each run stamps into the HTML.
 *
 * A fresh process per build, not a re-run in this one: the prerender is `renderToString`
 * over imported modules, and an imported module is cached for the life of the process — the
 * bundle would pick an edit up off disk while the HTML kept the old render, and the two must
 * be one render or hydration tears the first screen apart. It is also why this is not
 * `bun --watch`: that restarts on changes to the import graph, and a step the shell loads
 * with `lazy()` is not in the graph until it is rendered, so an edit to the paywall step
 * would never have fired.
 */

const ROOT = path.resolve(import.meta.dir, "..");
const PORT = "7071";
/** What the funnel build reads, directly or through an import: the funnel and the auth copies
 * it shares with the site, the `lib/` they lean on, the stylesheet and its token partial at
 * the top of `app/`, and the build itself under `scripts/`. Directories throughout, the last
 * two without descending, because a file watched on its own misses a save that changes only
 * its timestamp where its directory reports it. The fonts are not here; nobody edits a font. */
const WATCHED = [
  { dir: "components/funnel", recursive: true },
  { dir: "components/auth", recursive: true },
  { dir: "lib", recursive: true },
  { dir: "app", recursive: false },
  { dir: "scripts", recursive: false },
];

let building: Bun.Subprocess | undefined;
let pending: ReturnType<typeof setTimeout> | undefined;

function buildFunnel() {
  // An edit that lands mid-build restarts it; the half-written output was never going to be
  // served for more than the moment the next run takes to overwrite it.
  building?.kill();
  building = Bun.spawn(["bun", path.join(ROOT, "scripts/build-funnel.tsx"), "--dev"], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
}

for (const { dir, recursive } of WATCHED) {
  // One editor save is several filesystem events; the delay folds them into one build.
  watch(path.join(ROOT, dir), { recursive }, () => {
    clearTimeout(pending);
    pending = setTimeout(buildFunnel, 50);
  });
}
buildFunnel();

// Node's `next`, not bun's: the shebang decides, and this is the same command the script
// line used to run.
const next = Bun.spawn([path.join(ROOT, "node_modules/.bin/next"), "dev", "--port", PORT], {
  cwd: ROOT,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
const code = await next.exited;
building?.kill();
process.exit(code);
