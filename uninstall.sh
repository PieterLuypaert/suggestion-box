#!/bin/sh
# Takes the suggestion box out again: the suggest link in ~/.local/bin, and its SessionStart hook
# and permission rule in Claude Code's settings.json (kept beside it once before it changes).
# Your notes and switches in ~/.suggestion-box stay, unless you pass --purge.
#
#   ./uninstall.sh [--purge]
set -eu

here=$(cd "$(dirname "$0")" && pwd -P)
claude_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
settings="$claude_dir/settings.json"
link="$HOME/.local/bin/suggest"
box="${SUGGESTION_BOX_HOME:-$HOME/.suggestion-box}"
stamp=$(date +%Y%m%d-%H%M%S)
purge=no

fail() { echo "uninstall: $*" >&2; exit 1; }

for arg in "$@"; do
  case "$arg" in
    --purge) purge=yes ;;
    *) fail "unknown argument $arg; the only one is --purge" ;;
  esac
done
command -v jq >/dev/null 2>&1 || fail "needs jq on the PATH (brew install jq)"

# Only a link to a suggestion-box checkout's command, as install.sh made it: its target ends in
# bin/suggest and has the checkout's agent instructions beside it.
is_ours() {
  target=$(readlink "$1")
  case "$target" in
    */bin/suggest) [ -f "$(dirname "$(dirname "$target")")/agent-instructions.md" ] ;;
    *) return 1 ;;
  esac
}

if [ -L "$link" ] && is_ours "$link"; then
  rm "$link"
  echo "command: removed $link"
else
  echo "command: no suggestion-box link at $link"
fi

if [ -f "$settings" ]; then
  jq -f "$here/unsettings.jq" "$settings" >"$settings.tmp" || { rm -f "$settings.tmp"; fail "could not update $settings"; }
  if cmp -s "$settings" "$settings.tmp"; then
    rm -f "$settings.tmp"
    echo "settings: no hook or permission rule of the suggestion box"
  else
    cp "$settings" "$settings.backup-$stamp"
    cat "$settings.tmp" >"$settings" && rm -f "$settings.tmp"
    echo "settings: removed the SessionStart hook and the permission rule ($settings was kept as settings.json.backup-$stamp)"
  fi
fi

if [ "$purge" = yes ]; then
  # Only a folder that looks like a box: never a home folder or one with other things in it.
  if [ ! -d "$box" ]; then
    echo "notes: there is no $box"
  elif [ "$box" = "$HOME" ] || [ "$box" = "/" ] || [ -n "$(find "$box" -mindepth 1 -maxdepth 1 ! -name notes ! -name settings.json ! -name .DS_Store)" ]; then
    fail "$box holds more than notes and settings.json, so --purge leaves it alone; remove it yourself if you mean to"
  else
    rm -rf "$box"
    echo "notes: removed $box"
  fi
else
  echo "notes: kept in $box (./uninstall.sh --purge removes them)"
fi
