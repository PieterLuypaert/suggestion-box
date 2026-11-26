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
app_home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
mod_link="$app_home/mods/suggestion-box"
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

# The Herdr app: the mod's link, the button and panel in every layout that has them, and the key.
mod_target=$(readlink "$mod_link" 2>/dev/null || true)
if [ -L "$mod_link" ] && case "$mod_target" in */mods/suggestion-box) [ ! -e "$mod_target" ] || [ -f "$mod_target/rules.js" ] ;; *) false ;; esac; then
  rm "$mod_link"
  echo "mod: removed $mod_link"
fi
for file in "$app_home"/layouts/*.json; do
  [ -f "$file" ] || continue
  jq -e '[.. | objects | select(.id? == "suggestion-box-button" or .id? == "suggestion-box")] | length > 0' "$file" >/dev/null 2>&1 || continue
  cp "$file" "$file.old-$stamp"
  jq -f "$here/unlayout.jq" "$file.old-$stamp" >"$file.tmp" || { rm -f "$file.tmp"; fail "could not take the box out of $file"; }
  mv "$file.tmp" "$file"
  echo "layout: took the box out of $(basename "$file" .json) (kept as $(basename "$file").old-$stamp)"
done
keys="$app_home/keys.json"
if [ -f "$keys" ] && [ "$(jq -r '.global["cmd-alt-s"] // empty' "$keys")" = "layout.toggle:suggestion-box" ]; then
  cp "$keys" "$keys.backup-$stamp"
  jq 'del(.global["cmd-alt-s"])' "$keys.backup-$stamp" >"$keys"
  echo "key: cmd-alt-s is free again (keys.json was kept as keys.json.backup-$stamp)"
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
