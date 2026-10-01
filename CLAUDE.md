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
- **perf-engineering** - CPU/memory optimization guidance. Pure markdown, no runtime code.
- **ux-laws-audit** - Audits a UI against the Laws of UX. Markdown with `references/`, `assets/`, and `evals/`.

Vendored skills:

- **skill-creator** - `anthropics/skills`
- **grilling**, **wait-what** - `mattpocock/skills`
- **simple-english** - `AminBlg/SimpleEnglish`; its plugin hooks are merged into agent settings by `scripts/install.sh`

## Code Graph

Code-graph analysis is an external tool, not a skill. Install it with:

```sh
curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh
```

## Skill Anatomy

A `SKILL.md` has YAML frontmatter (`name`, `description`) followed by markdown instructions. The `description` field controls when the skill triggers. Reference files under `references/` are loaded lazily by the skill's instructions.

## Conventions

- Skills are referenced by directory name, such as `browser-testing` or `ux-laws-audit`.
- Vendored skills are updated via `git submodule update --remote --recursive`; do not edit them in place.
- Keep skill instructions agent-neutral unless a capability is truly agent-specific.
- Update `README.md` in the same change whenever a skill, setup step, or script option is added, removed, or renamed.
- Commit messages use conventional commits format (`feat:`, `chore:`, `fix:`).
- There is no project-wide build step, test suite, or linter; skills are authored markdown plus lightweight scripts.
