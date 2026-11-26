#!/bin/sh
# Puts the suggestion box in place: links the suggest command into ~/.local/bin, and adds two
# entries to Claude Code's settings.json: a SessionStart hook that gives a session the agent
# instructions while collecting is on for its project, and a permission rule so a drop never stops
# an agent for a prompt. With the Herdr app there, it also links the box's mod, adds its button to
# the tab bar and its panel to the right of your layout, and binds cmd-alt-s. Herdr replaces its own
# layouts on every start, so for one of those the button goes into a copy, <name>-suggestion-box.
# Run it again any time, after a pull too: what is set already stays as it is, and every file it
# changes is kept beside it once before it changes.
#
#   ./install.sh [layout]     the layout for the button and the panel; default: the one shown now
set -eu

here=$(cd "$(dirname "$0")" && pwd -P)
claude_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
settings="$claude_dir/settings.json"
bin_dir="$HOME/.local/bin"
link="$bin_dir/suggest"
hook_command="\"$link\" session-start"
rule='Bash(suggest:*)'
stamp=$(date +%Y%m%d-%H%M%S)
app_home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
mod_link="$app_home/mods/suggestion-box"

fail() { echo "install: $*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "needs node on the PATH"
command -v jq >/dev/null 2>&1 || fail "needs jq on the PATH (brew install jq)"

# A link to a suggestion-box checkout's command: its target ends in bin/suggest and has the
# checkout's agent instructions beside it, so another tool called suggest is never taken for it.
is_ours() {
  target=$(readlink "$1")
  case "$target" in
    */bin/suggest) [ -f "$(dirname "$(dirname "$target")")/agent-instructions.md" ] ;;
    *) return 1 ;;
  esac
}

link_command() {
  mkdir -p "$bin_dir"
  if [ -L "$link" ] && is_ours "$link"; then
    from=$(readlink "$link")
    [ "$from" = "$here/bin/suggest" ] && { echo "command: $link links here already"; return; }
    rm "$link"
  elif [ -e "$link" ] || [ -L "$link" ]; then
    fail "$link is there already and is not a suggestion-box command: move it aside first"
  fi
  ln -s "$here/bin/suggest" "$link"
  echo "command: linked $link"
}

# Both entries, each only when it is missing; a hook of an older checkout is pointed here.
add_settings() {
  mkdir -p "$claude_dir"
  [ -f "$settings" ] || echo '{}' >"$settings"
  jq -e . "$settings" >/dev/null 2>&1 || fail "$settings is not valid JSON; fix it first"
  jq --arg rule "$rule" --arg command "$hook_command" -f "$here/settings.jq" "$settings" >"$settings.tmp" \
    || { rm -f "$settings.tmp"; fail "could not update $settings"; }
  if cmp -s "$settings" "$settings.tmp"; then
    rm -f "$settings.tmp"
    echo "settings: the hook and the permission rule are there already"
    return
  fi
  cp "$settings" "$settings.backup-$stamp"
  # Written through, so a settings.json that links to your dotfiles stays a link.
  cat "$settings.tmp" >"$settings" && rm -f "$settings.tmp"
  echo "settings: added the SessionStart hook and $rule ($settings was kept as settings.json.backup-$stamp)"
}

# ---- the Herdr app: the mod, the button and panel, the key ----

# herdr-app, the Herdr app's command line: from the PATH, else from ~/.local/bin.
find_herdr() {
  herdr=$(command -v herdr-app 2>/dev/null || true)
  if [ -z "$herdr" ] && [ -x "$HOME/.local/bin/herdr-app" ]; then herdr="$HOME/.local/bin/herdr-app"; fi
  [ -n "$herdr" ] && [ -d "$app_home/layouts" ]
}

# A link to a suggestion-box checkout's mod: its target is called mods/suggestion-box and holds the
# box's own rules.js, so another project's mod of that name is never taken for it.
is_our_mod() {
  target=$(readlink "$1")
  case "$target" in
    */mods/suggestion-box) [ ! -e "$target" ] || [ -f "$target/rules.js" ] ;;
    *) return 1 ;;
  esac
}

can_link_mod() {
  if [ -L "$mod_link" ] && is_our_mod "$mod_link"; then return 0; fi
  if [ -e "$mod_link" ] || [ -L "$mod_link" ]; then fail "$mod_link is there already and is not a suggestion-box checkout's mod: move it aside first"; fi
}

# Linked again each time, because the app does not see edits behind a link it already has.
link_mod() {
  src="$here/mods/suggestion-box"
  if [ -L "$mod_link" ]; then rm "$mod_link"; fi
  ln -s "$src" "$mod_link"
  echo "mod: linked $mod_link"
}

shown_layout() {
  jq -r '.layout // "main"' "$app_home/shared.json" 2>/dev/null || echo main
}

# The layout the box goes into, in $layout: tried first, so one that cannot take it changes
# nothing. One of Herdr's own goes into a copy, made with layout.clone (which shows it) or shown
# when an earlier install made it; both need the app open.
own_layout() {
  layout=$1
  [ -f "$app_home/layouts/$layout.json" ] || fail "there is no layout $app_home/layouts/$layout.json"
  why=$(jq -f "$here/layout.jq" "$app_home/layouts/$layout.json" 2>&1 >/dev/null) \
    || fail "the box cannot go into $layout: $(echo "$why" | sed 's/^jq: error (at [^)]*): //')"
  jq -e --arg n "layout:$layout" 'has($n)' "$app_home/installed.json" >/dev/null 2>&1 || return 0
  copy="$layout-suggestion-box"
  "$herdr" status >/dev/null 2>&1 \
    || fail "$layout is one of Herdr's own layouts, which Herdr replaces on every start, so the box goes into a copy of it, $copy. Open the Herdr app and run this again."
  if [ -f "$app_home/layouts/$copy.json" ]; then
    "$herdr" "do" layout.switch "$(jq -nc --arg n "$copy" '{name: $n}')" >/dev/null || fail "could not show $copy"
  else
    "$herdr" "do" layout.clone "$(jq -nc --arg n "$layout" --arg c "$copy" '{name: $n, as: $c}')" >/dev/null || fail "could not copy $layout to $copy"
    tries=0
    while [ ! -f "$app_home/layouts/$copy.json" ] && [ "$tries" -lt 50 ]; do sleep 0.1; tries=$((tries + 1)); done
    [ -f "$app_home/layouts/$copy.json" ] || fail "Herdr did not write $copy"
  fi
  echo "layout: $layout is one of Herdr's own; the box goes into a copy, $copy, shown now"
  layout=$copy
}

add_to_layout() {
  file="$app_home/layouts/$1.json"
  jq -f "$here/layout.jq" "$file" >"$file.tmp" || { rm -f "$file.tmp"; fail "could not add the box to $1"; }
  if cmp -s "$file" "$file.tmp"; then
    rm -f "$file.tmp"
    echo "layout: $1 has the button and the panel already"
    return
  fi
  cp "$file" "$file.old-$stamp"
  mv "$file.tmp" "$file"
  echo "layout: added the button and the panel to $1 ($1.json was kept as $1.json.old-$stamp)"
}

# cmd-alt-s, when it is free or does this already; a key bound to something else is left alone.
add_key() {
  keys="$app_home/keys.json"
  if [ ! -f "$keys" ]; then
    echo "key: there is no $keys yet, so none was bound: add $(jq -c .global "$here/keys.json") to its \"global\" section yourself" >&2
    return
  fi
  for key in $(jq -r '.global | keys[]' "$here/keys.json"); do
    action=$(jq -r --arg k "$key" '.global[$k]' "$here/keys.json")
    bound=$(jq -r --arg k "$key" '.global[$k] // empty' "$keys")
    if [ "$bound" = "$action" ]; then echo "key: $key does $action already"; continue; fi
    if [ -n "$bound" ]; then echo "key: $key does $bound; bind $action to a free key in $keys yourself" >&2; continue; fi
    cp "$keys" "$keys.backup-$stamp"
    jq --arg k "$key" --arg a "$action" '.global[$k] = $a' "$keys" >"$keys.tmp" || { rm -f "$keys.tmp"; fail "could not set $key in $keys"; }
    mv "$keys.tmp" "$keys"
    echo "key: $key does $action (keys.json was kept as keys.json.backup-$stamp)"
  done
}

install_box() {
  if ! find_herdr; then
    echo "herdr: no Herdr app here, so only the command and the hook are in place"
    return
  fi
  can_link_mod
  own_layout "$1"
  link_mod
  add_to_layout "$layout"
  add_key
  "$herdr" check "$mod_link" || fail "herdr-app check did not pass for $mod_link"
}

echo "suggestion box $(jq -r .version "$here/package.json")"
link_command
add_settings
install_box "${1:-$(shown_layout)}"
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "note: $bin_dir is not on your PATH, so agents cannot find suggest; add it to your shell's PATH" >&2 ;;
esac
echo "New Claude sessions in a git repo now get the instructions. ./uninstall.sh takes it out again."
