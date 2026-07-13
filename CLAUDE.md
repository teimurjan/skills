# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository. The repo is intentionally compatible with both Claude Code and Codex.

## What This Repo Is

A collection of portable code-agent skills. Each skill is a self-contained directory with a `SKILL.md` file containing YAML frontmatter and Markdown instructions, plus optional reference files or tooling. Some skills are authored here; others are vendored from upstream repos as git submodules under `.vendor/` and symlinked into place.

Use `scripts/install.sh --agent claude` to link these skills into `~/.claude/skills/`. Use `scripts/install.sh --agent codex` to link them into `~/.codex/skills/`.

## Repository Structure

```text
<skill-name>/
  SKILL.md              # Skill definition (frontmatter: name, description, trigger conditions)
  references/           # Deep-dive docs the skill loads on demand
  *.js, package.json    # Tooling (if the skill ships a CLI tool)
.vendor/                # Upstream skill repos as git submodules
scripts/                # Repo maintenance helpers
```

Authored skills:

- **browser-testing** - ABP (Agent Browser Protocol) CLI wrapper in Deno (`browser.js`). Has npm deps for Readability/Markdown extraction (`@mozilla/readability`, `jsdom`, `turndown`).
- **address-pr-review** - Fetches and addresses GitHub PR review comments. Pure markdown, no runtime code.
- **dev-tunnel** - Runs a local JS/TS dev server and exposes it via ngrok. Pure markdown, no runtime code.
- **perf-engineering** - CPU/memory optimization guidance. Pure markdown, no runtime code.

Vendored skills:

- **code-simplification**, **idea-refine** - `addyosmani/agent-skills`
- **skill-creator** - `anthropics/skills`
- **motion-framer** - `freshtechbro/claudedesignskills`

## Code Graph

Code-graph analysis is an external tool, not a skill. Install it with:

```sh
curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh
```

## Skill Anatomy

A `SKILL.md` has YAML frontmatter (`name`, `description`) followed by markdown instructions. The `description` field controls when the skill triggers. Reference files under `references/` are loaded lazily by the skill's instructions.

## Conventions

- Skills are referenced by directory name, such as `browser-testing` or `dev-tunnel`.
- Vendored skills are updated via `git submodule update --remote --recursive`; do not edit them in place.
- Keep skill instructions agent-neutral unless a capability is truly agent-specific.
- Commit messages use conventional commits format (`feat:`, `chore:`, `fix:`).
- There is no project-wide build step, test suite, or linter; skills are authored markdown plus lightweight scripts.
