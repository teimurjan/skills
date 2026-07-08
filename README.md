# claude-skills

Custom [Claude Code](https://claude.ai/code) skills, symlinked into `~/.claude/skills/`.

Each skill is a directory with a `SKILL.md` (frontmatter + instructions) whose `description` controls when it triggers.

## Skills

Authored here:

- **browser-testing** — browser automation via the Agent Browser Protocol.
- **address-pr-review** — fetch and address GitHub PR review comments.
- **dev-tunnel** — run a local dev server and expose it via ngrok.
- **perf-engineering** — CPU/memory optimization guidance.

Vendored as submodules in `.vendor/`:

- **code-simplification**, **idea-refine** — [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
- **skill-creator** — [anthropics/skills](https://github.com/anthropics/skills)
- **motion-framer** — [freshtechbro/claudedesignskills](https://github.com/freshtechbro/claudedesignskills)

## Code graph

Code-graph analysis is a separate tool:

```sh
curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh
```

## Setup

```sh
git clone --recurse-submodules <repo>
git submodule update --remote   # pull latest vendored skills
```
