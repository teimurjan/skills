# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A collection of Claude Code custom skills (`~/.claude/skills/`). Each skill is a self-contained directory with a `SKILL.md` (frontmatter + instructions) and optional reference files or tooling. Some skills are authored here; others are vendored from upstream repos as git submodules under `.vendor/` and symlinked into place.

## Repository Structure

```
<skill-name>/
  SKILL.md              # Skill definition (frontmatter: name, description, trigger conditions)
  references/           # Deep-dive docs the skill loads on demand
  *.js, package.json    # Tooling (if the skill ships a CLI tool)
.vendor/                # Upstream skill repos as git submodules
```

Authored skills:
- **browser-testing** — ABP (Agent Browser Protocol) CLI wrapper in Deno (`browser.js`, 750 LOC). Has npm deps for Readability/Markdown extraction (`@mozilla/readability`, `jsdom`, `turndown`).
- **address-pr-review** — Fetches and addresses GitHub PR review comments. Pure markdown, no runtime code.
- **dev-tunnel** — Runs a local JS/TS dev server and exposes it via ngrok. Pure markdown, no runtime code.
- **perf-engineering** — CPU/memory optimization guidance. Pure markdown, no runtime code.

Vendored skills (submodules in `.vendor/`, symlinked):
- **code-simplification**, **idea-refine** — `addyosmani/agent-skills`
- **skill-creator** — `anthropics/skills`
- **motion-framer** — `freshtechbro/claudedesignskills`

## Code Graph

Code-graph analysis is an external tool, not a skill. Install it with:

```
curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh
```

## Skill Anatomy

A `SKILL.md` has YAML frontmatter (`name`, `description`) followed by markdown instructions. The `description` field controls when the skill triggers — it doubles as the matching criteria shown to Claude Code. Reference files under `references/` are loaded lazily by the skill's instructions (not auto-loaded).

## Conventions

- Skills are referenced by directory name (e.g. `browser-testing`, `dev-tunnel`)
- Vendored skills are updated via `git submodule update --remote`; don't edit them in place
- Commit messages use conventional commits format (`feat:`, `chore:`, `fix:`)
- No build step, no tests, no linter — skills are authored markdown + lightweight scripts
