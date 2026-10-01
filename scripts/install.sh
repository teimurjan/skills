#!/usr/bin/env bash
set -eu

usage() {
  cat <<'USAGE'
Usage: scripts/install.sh [--agent codex|claude|omp|both] [--prune]

Links top-level skill directories from this repo into local agent skill directories.
Hooks declared by vendored plugins are merged into ~/.claude/settings.json (claude)
and ~/.codex/hooks.json (codex). Requires jq.

Targets:
  codex   ~/.codex/skills
  claude  ~/.claude/skills
  omp     ~/.omp/agent/skills
  both    both targets (default)

Options:
  --prune  remove links in the target directories that point into this repo
           but no longer match a skill here (stale or broken)
USAGE
}

agent="both"
prune=false

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
    --prune)
      prune=true
      shift
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
pruned=0
skill_names=()
plugin_roots=()

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

is_current_skill() {
  local candidate
  for candidate in ${skill_names[@]+"${skill_names[@]}"}; do
    [ "$candidate" = "$1" ] && return 0
  done
  return 1
}

points_into_repo() {
  local link_path="$1"
  local link_target
  local resolved
  link_target="$(readlink "$link_path")"

  case "$link_target" in
    "$repo_root"/*) return 0 ;;
  esac

  resolved="$(resolve_link_target "$link_path" "$link_target")" || return 1
  case "$resolved" in
    "$repo_root"/*) return 0 ;;
  esac
  return 1
}

prune_target() {
  local target_dir="$1"
  local entry
  local name

  [ -d "$target_dir" ] || return 0

  for entry in "$target_dir"/*; do
    [ -L "$entry" ] || continue
    name="$(basename "$entry")"
    is_current_skill "$name" && continue
    points_into_repo "$entry" || continue

    rm "$entry"
    echo "prune: $entry"
    pruned=$((pruned + 1))
  done
}

vendor_root_of() {
  case "$1" in
    "$repo_root"/.vendor/*)
      local rest="${1#"$repo_root"/.vendor/}"
      echo "$repo_root/.vendor/${rest%%/*}"
      ;;
    *) return 1 ;;
  esac
}

add_plugin_root() {
  local root
  for root in ${plugin_roots[@]+"${plugin_roots[@]}"}; do
    [ "$root" = "$1" ] && return 0
  done
  plugin_roots+=("$1")
}

plugin_skills() {
  local name
  for name in ${skill_names[@]+"${skill_names[@]}"}; do
    [ "$(vendor_root_of "$(cd "$repo_root/$name" && pwd -P)")" = "$1" ] && printf " '%s'" "$name"
  done
  return 0
}

# Prints a plugin's hook map with absolute paths, each command skipped in projects
# that turn all of the plugin's skills off (see scripts/skill-enabled.sh).
plugin_hooks() {
  local plugin_root="$1"
  local manifest="$1/$2"
  local root_var="$3"
  local hooks_file
  local guard

  [ -f "$manifest" ] || return 0

  guard="'$repo_root/scripts/skill-enabled.sh'$(plugin_skills "$plugin_root")"
  hooks_file="$(jq -r 'if (.hooks | type) == "string" then .hooks else empty end' "$manifest")"
  if [ -n "$hooks_file" ]; then
    jq '.hooks // empty' "$plugin_root/$hooks_file"
  else
    jq '.hooks // empty' "$manifest"
  fi | jq --arg var "\${$root_var}" --arg root "$plugin_root" --arg guard "$guard" '
    walk(if type == "string" then split($var) | join($root) else . end)
    | map_values(map(.hooks |= map(
        if .command then .command = "if \($guard); then \(.command); fi" else . end
      )))'
}

# Replaces every hook that points into this repo with the current plugin hooks.
install_hooks() {
  local settings_file="$1"
  local manifest="$2"
  local root_var="$3"
  local plugin_root
  local new_hooks
  local merged

  new_hooks="$(
    for plugin_root in ${plugin_roots[@]+"${plugin_roots[@]}"}; do
      plugin_hooks "$plugin_root" "$manifest" "$root_var"
    done | jq -s 'reduce (.[] | to_entries[]) as $e ({}; .[$e.key] += $e.value)'
  )"

  if [ "$new_hooks" = "{}" ] && [ ! -f "$settings_file" ]; then
    return 0
  fi

  if ! merged="$(
    { [ -f "$settings_file" ] && cat "$settings_file" || echo '{}'; } |
      jq --arg repo "$repo_root/" --argjson add "$new_hooks" '
        .hooks = (
          (.hooks // {})
          | map_values(
              map(.hooks |= map(select((.command // "") | contains($repo) | not)))
              | map(select(.hooks | length > 0))
            )
          | reduce ($add | to_entries[]) as $e (.; .[$e.key] += $e.value)
          | with_entries(select(.value | length > 0))
        )
        | if .hooks == {} then del(.hooks) else . end'
  )"; then
    echo "error: cannot update hooks in $settings_file" >&2
    exit 1
  fi

  if [ -f "$settings_file" ] && [ "$merged" = "$(jq . "$settings_file")" ]; then
    echo "ok: $settings_file hooks up to date"
    return 0
  fi

  mkdir -p "$(dirname "$settings_file")"
  # Redirect instead of mv to keep the file's permissions and any symlink.
  printf '%s\n' "$merged" > "$settings_file"
  echo "hooks: updated $settings_file"
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

  skill_names+=("$name")
  skill_path="$(cd "$entry" && pwd -P)"
  for target in "${targets[@]}"; do
    link_skill "$skill_path" "$name" "$target"
  done

  if plugin_root="$(vendor_root_of "$skill_path")"; then
    add_plugin_root "$plugin_root"
  fi
done

for target in "${targets[@]}"; do
  case "$target" in
    "$HOME/.claude/skills")
      install_hooks "$HOME/.claude/settings.json" .claude-plugin/plugin.json CLAUDE_PLUGIN_ROOT
      ;;
    "$HOME/.codex/skills")
      install_hooks "$HOME/.codex/hooks.json" .codex-plugin/plugin.json PLUGIN_ROOT
      ;;
  esac
done

if [ "$prune" = true ]; then
  for target in "${targets[@]}"; do
    prune_target "$target"
  done
fi

echo
echo "Summary: linked=$linked skipped=$skipped broken=$broken pruned=$pruned"

if [ "$broken" -gt 0 ]; then
  echo "Some vendored skill links are broken. Run:"
  echo "  git submodule update --init --recursive"
fi
