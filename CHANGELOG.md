# Changelog

All notable changes to the suggestion box. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-26

### Added

- The box as a panel in the Herdr app, on the right like Quarterdeck, with its button at the end of
  the tab bar: the focused project's open notes and a green ✓ for notes to verify. The button wiggles
  when a note arrives while the panel is shut.
- One right-hand panel at a time: the box watches the layout and hides Quarterdeck, Chartroom or
  Files and Changes when it opens, and itself when one of those opens.
- The panel's groups, To verify and Open; a note's four sections, its file opened in Cursor at its
  line, its ticket's tab or issue; Bin with Undo; the history of 30 days with Restore and Reopen.
- A `changed on …` chip with Mark solved when a note's lines changed since the drop, on its branch or
  on the default branch, followed through moves, renames and rebases with plain git.
- The states table as code: each note state allows a fixed set of actions, and the box refuses any
  other, also a click that races an agent's claim.
- The Collecting switch for the project and for all projects, and keys like Quarterdeck's.
- `cli/box.js`, the box's own side, which agents never run; old filed, solved and binned notes
  become tombstones after 30 days.
- `install.sh` links the mod, adds the button and the panel to the layout (a copy for Herdr's own),
  and binds `cmd-alt-s`; `uninstall.sh` takes them out again.

## [0.1.0] - 2026-11-26

### Added

- The `suggest` command: an agent drops a note with a title, a file and line, and four sections
  (problem, evidence, current situation, desired situation) on stdin in a quoted heredoc, or as
  flags. It fills in the project, branch, ticket, commit, worktree, main checkout and terminal.
- One box per project, keyed by the repo's origin, so every worktree shares it.
- The same note again only counts, in any state: open, to verify, filed or binned. A note confirmed
  solved reopens when it is seen again.
- `suggest list`, and `suggest solved <number>` to claim a note the agent's own task fixed.
- Many agents at once: the command only creates files (notes, numbers, events), never rewrites one.
- Collecting off, for all projects or one, in `~/.suggestion-box/settings.json`: a drop answers
  calmly and writes nothing.
- A `SessionStart` hook (`suggest session-start`) that gives a session the agent instructions only
  in a git repo while collecting is on.
- `install.sh` and `uninstall.sh`: the command's link, the hook and the permission rule
  `Bash(suggest:*)`, with a backup of `settings.json`.
