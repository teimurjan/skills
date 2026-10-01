# agent-skills

Portable skills for code agents that understand the `SKILL.md` skill format, including OMP, Codex, and Claude Code.

Each skill is a directory with a `SKILL.md` file containing YAML frontmatter and Markdown instructions. The `description` field controls when an agent should load the skill.

## Skills

Authored here:

- **browser-testing** - browser automation via the Agent Browser Protocol.
- **address-pr-review** - fetch and address GitHub PR review comments.
- **dev-tunnel** - run a local dev server and expose it via ngrok.
- **perf-engineering** - CPU/memory optimization guidance.
- **ux-laws-audit** - audit a UI (web or mobile) against the Laws of UX and produce a prioritized, actionable fix report.

Vendored as submodules in `.vendor/` and symlinked at the repo root:

- **skill-creator** - anthropics/skills
- **grilling**, **wait-what** - mattpocock/skills
- **simple-english** - AminBlg/SimpleEnglish

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

## Code Graph

Code-graph analysis is a separate tool:

```sh
curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh
```
