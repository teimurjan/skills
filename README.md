# agent-skills

Portable skills for code agents that understand the `SKILL.md` skill format, including Codex and Claude Code.

Each skill is a directory with a `SKILL.md` file containing YAML frontmatter and Markdown instructions. The `description` field controls when an agent should load the skill.

## Skills

Authored here:

- **browser-testing** - browser automation via the Agent Browser Protocol.
- **address-pr-review** - fetch and address GitHub PR review comments.
- **dev-tunnel** - run a local dev server and expose it via ngrok.
- **perf-engineering** - CPU/memory optimization guidance.

Vendored as submodules in `.vendor/` and symlinked at the repo root:

- **code-simplification**, **idea-refine** - addyosmani/agent-skills
- **skill-creator** - anthropics/skills
- **motion-framer** - freshtechbro/claudedesignskills

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
```

The script creates symlinks in:

- Codex: `~/.codex/skills/<skill-name>`
- Claude Code: `~/.claude/skills/<skill-name>`

It will not overwrite real files or directories in those locations. If vendored skill symlinks are broken, initialize submodules with `git submodule update --init --recursive` and rerun the script.

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
