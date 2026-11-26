# Changelog

All notable changes to the suggestion box. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

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
