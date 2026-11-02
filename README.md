# agent-skills

Portable skills for code agents that understand the `SKILL.md` skill format, including OMP, Codex, and Claude Code.

Each skill is a directory with a `SKILL.md` file containing YAML frontmatter and Markdown instructions. The `description` field controls when an agent should load the skill.

## Skills

Authored here:

- **browser-testing** - browser automation via the Agent Browser Protocol.
- **address-pr-review** - fetch and address GitHub PR review comments.
- **perf-engineering** - CPU/memory optimization guidance.
- **app-scaffold** - scaffold a paid iOS app, landing site and Preact pain-point funnel (Next.js on Vercel, Supabase, StoreKit + Paddle or Dodo, Resend, fastlane) by copying the generic half of `~/Projects/takt`, `~/Projects/wait-professor` and the App Store screenshot scripts of `~/Projects/oyno` (zoomed widgets, photo frames, iPad and iPhone Duo slots), with the design requested from Claude Design. Keyword research, localized metadata and territory pricing come from the vendored vibe-aso skill, linked as `app-scaffold/aso`. Needs `bun` and all three reference repos checked out.

Vendored as submodules in `.vendor/` and symlinked at the repo root:

- **skill-creator** - anthropics/skills
- **grilling**, **wait-what** - mattpocock/skills
- **simple-english** - AminBlg/SimpleEnglish
- **vibe-aso** - Kronop/vibe-aso, linked inside `app-scaffold/aso` rather than at the repo root

## Setup

Clone with submodules, or initialize them after cloning:

```sh
git clone --recurse-submodules <repo>
git submodule update --init --recursive
```

To pull newer vendored skills later:

```sh
git submodule update --remote --recursive
```

## Install for Agents

Sync skills into Codex and Claude Code:

```sh
scripts/install.sh
```

Sync only one agent:

```sh
scripts/install.sh --agent codex
scripts/install.sh --agent claude
scripts/install.sh --agent omp
```

The script creates symlinks in:

- Codex: `~/.codex/skills/<skill-name>`
- Claude Code: `~/.claude/skills/<skill-name>`
- OMP: `~/.omp/agent/skills/<skill-name>`

Hooks declared by a vendored plugin (`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`) are merged into `~/.claude/settings.json` and `~/.codex/hooks.json`. Hooks that point into this repo are replaced on every run, so removed skills lose their hooks too. Codex asks you to trust new hooks in `/hooks`. This step needs `jq`.

To turn a vendored skill and its hooks off in one project, add this to the project's `.claude/settings.local.json`:

```json
{ "skillOverrides": { "simple-english": "off" } }
```

Claude hides the skill, and `scripts/skill-enabled.sh` skips its hooks in both Claude and Codex. Codex has no per-project skill toggle, so the skill itself stays visible there.

It will not overwrite real files or directories in those locations. If vendored skill symlinks are broken, initialize submodules with `git submodule update --init --recursive` and rerun the script.

After removing a skill from this repo, pass `--prune` to also delete its now-stale links from the target directories. Only links that point into this repo are touched:

```sh
scripts/install.sh --prune
```

## Repository Structure

```text
<skill-name>/
  SKILL.md              # Skill definition
  references/           # Optional deep-dive docs loaded on demand
  *.js, package.json    # Optional tooling
.vendor/                # Upstream skill repos as git submodules
scripts/                # Repo maintenance helpers
```

## Recommended Global Tools

These tools are not skills in this repo. Install them once, globally, for all projects.

- [codegraph](https://github.com/colbymchenry/codegraph) gives agents a code graph of the project:

  ```sh
  curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh
  ```

- [Impeccable](https://impeccable.style/) gives agents design commands and a hook that catches generic AI UI patterns. If the installer asks for a scope, choose all projects:

  ```sh
  npx impeccable install
  ```

  To use it in a project, run `/impeccable init` and `/impeccable hooks on` in the agent chat.
