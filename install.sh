#!/bin/sh
# Puts the suggestion box in place: links the suggest command into ~/.local/bin, and adds two
# entries to Claude Code's settings.json: a SessionStart hook that gives a session the agent
# instructions while collecting is on for its project, and a permission rule so a drop never stops
# an agent for a prompt. Run it again any time, after a pull too: what is set already stays as it
# is, and settings.json is kept beside it once before it changes.
#
#   ./install.sh
set -eu

here=$(cd "$(dirname "$0")" && pwd -P)
claude_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
settings="$claude_dir/settings.json"
bin_dir="$HOME/.local/bin"
link="$bin_dir/suggest"
hook_command="\"$link\" session-start"
rule='Bash(suggest:*)'
stamp=$(date +%Y%m%d-%H%M%S)

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

echo "suggestion box $(jq -r .version "$here/package.json")"
link_command
add_settings
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "note: $bin_dir is not on your PATH, so agents cannot find suggest; add it to your shell's PATH" >&2 ;;
esac
echo "New Claude sessions in a git repo now get the instructions. ./uninstall.sh takes it out again."
