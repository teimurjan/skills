#!/usr/bin/env bash
# Exits 1 when the current project sets every given skill to "off" in Claude's skillOverrides.
set -u

project_dir="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

skill_state() {
  local settings
  local state
  for settings in "$project_dir/.claude/settings.local.json" "$project_dir/.claude/settings.json"; do
    [ -f "$settings" ] || continue
    state="$(jq -r --arg skill "$1" '.skillOverrides[$skill] // empty' "$settings" 2>/dev/null)"
    if [ -n "$state" ]; then
      echo "$state"
      return
    fi
  done
}

for skill in "$@"; do
  [ "$(skill_state "$skill")" = "off" ] || exit 0
done
exit 1
