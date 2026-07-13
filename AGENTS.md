# AGENTS.md

This file provides guidance to Codex and other code agents working in this repository.

## What This Repo Is

This is a portable skills collection for agents that understand the `SKILL.md` format. Skills should remain usable from both Codex (`~/.codex/skills`) and Claude Code (`~/.claude/skills`).

Each skill lives in its own top-level directory with a `SKILL.md` file. Some top-level skills are symlinks into vendored git submodules under `.vendor/`.

## Setup

Initialize vendored skills before checking availability:

```sh
git submodule update --init --recursive
```

Link skills into local agent skill directories:

```sh
scripts/install.sh --agent codex
scripts/install.sh --agent claude
scripts/install.sh --agent both
```

## Skill Maintenance

- Keep authored `SKILL.md` files agent-neutral unless the behavior depends on a specific agent capability.
- Prefer generic instructions like "start a background shell command and poll its output" over naming one agent's tool API.
- Reference files under `references/` should be loaded only when the skill says they are relevant.
- Do not edit vendored skills in place; update their submodules instead.
- If adding a new authored skill, create a top-level directory with `SKILL.md` and optional supporting files.

## Repository Notes

- `browser-testing` includes a Deno CLI wrapper in `browser.js`.
- `address-pr-review`, `dev-tunnel`, and `perf-engineering` are markdown-only skills.
- There is no project-wide build step, test suite, or linter.
