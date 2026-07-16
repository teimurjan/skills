#!/usr/bin/env bash
set -eu

usage() {
  cat <<'USAGE'
Usage: scripts/install.sh [--agent codex|claude|omp|both]

Links top-level skill directories from this repo into local agent skill directories.

Targets:
  codex   ~/.codex/skills
  claude  ~/.claude/skills
  omp     ~/.omp/agent/skills
  both    both targets (default)
USAGE
}

agent="both"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --agent)
      if [ "$#" -lt 2 ]; then
        echo "error: --agent requires codex, claude, omp, or both" >&2
        exit 2
      fi
      agent="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$agent" in
  codex|claude|omp|both) ;;
  *)
    echo "error: --agent must be codex, claude, omp, or both" >&2
    exit 2
    ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/.." && pwd -P)"

targets=()
case "$agent" in
  codex)
    targets+=("$HOME/.codex/skills")
    ;;
  claude)
    targets+=("$HOME/.claude/skills")
    ;;
  omp)
    targets+=("$HOME/.omp/agent/skills")
    ;;
  both)
    targets+=("$HOME/.codex/skills" "$HOME/.claude/skills")
    ;;
esac

linked=0
skipped=0
broken=0

is_skill() {
  [ -f "$1/SKILL.md" ]
}

resolve_link_target() {
  local link_path="$1"
  local link_target="$2"
  local absolute_target

  if [[ "$link_target" = /* ]]; then
    absolute_target="$link_target"
  else
    absolute_target="$(cd "$(dirname "$link_path")" && cd "$(dirname "$link_target")" 2>/dev/null && pwd -P)/$(basename "$link_target")"
  fi

  if [ -d "$absolute_target" ]; then
    (cd "$absolute_target" && pwd -P)
  elif [ -e "$absolute_target" ]; then
    echo "$(cd "$(dirname "$absolute_target")" && pwd -P)/$(basename "$absolute_target")"
  else
    return 1
  fi
}

link_skill() {
  local skill_path="$1"
  local skill_name="$2"
  local target_dir="$3"
  local target_path="$target_dir/$skill_name"

  mkdir -p "$target_dir"

  if [ -L "$target_path" ]; then
    local current_target
    local current_real
    current_target="$(readlink "$target_path")"

    if [ "$current_target" = "$skill_path" ]; then
      echo "ok: $target_path already linked"
      linked=$((linked + 1))
      return 0
    fi

    if ! current_real="$(resolve_link_target "$target_path" "$current_target")"; then
      echo "skip: $target_path is a broken symlink"
      skipped=$((skipped + 1))
      return 0
    fi

    case "$current_real" in
      "$repo_root"|"$repo_root"/*)
        rm "$target_path"
        ;;
      *)
        echo "skip: $target_path is a symlink outside this repo"
        skipped=$((skipped + 1))
        return 0
        ;;
    esac
  elif [ -e "$target_path" ]; then
    echo "skip: $target_path exists and is not a symlink"
    skipped=$((skipped + 1))
    return 0
  fi

  ln -s "$skill_path" "$target_path"
  echo "link: $target_path -> $skill_path"
  linked=$((linked + 1))
}

for entry in "$repo_root"/*; do
  [ -e "$entry" ] || [ -L "$entry" ] || continue

  name="$(basename "$entry")"
  case "$name" in
    scripts)
      continue
      ;;
  esac

  if [ -L "$entry" ] && [ ! -e "$entry" ]; then
    echo "broken: $name points to missing vendored content"
    broken=$((broken + 1))
    continue
  fi

  if ! is_skill "$entry"; then
    continue
  fi

  skill_path="$(cd "$entry" && pwd -P)"
  for target in "${targets[@]}"; do
    link_skill "$skill_path" "$name" "$target"
  done
done

echo
echo "Summary: linked=$linked skipped=$skipped broken=$broken"

if [ "$broken" -gt 0 ]; then
  echo "Some vendored skill links are broken. Run:"
  echo "  git submodule update --init --recursive"
fi
