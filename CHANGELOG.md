# Changelog

All notable changes to the suggestion box. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [0.6.0] - 2026-11-26

### Added

- Fix in new tab: a filed GitHub issue of the project's own repo starts as a ticket through the
  parallel-tickets launcher (`issues launch --space`), in the space you are in, on a branch named
  as parallel-tickets names them and checked with `issues branch` (`-2` when taken). The note shows
  `Fixing in <branch> ↗`, which jumps to the tab, so a fix never starts twice; a failing launcher
  leaves its last line on the note.
- The button shows only where the launcher, its hagent and `--space` are there and the project's
  config, if any, names GitHub and this repo.
- The watch also asks GitHub about the filed issues: a closed one says so and gets no fix, and one
  opened again gets its button back.
- A fix never starts twice: the note is marked before the launcher runs, also against a second
  panel or window; a start that never reported back is called out after ten minutes.

## [0.5.0] - 2026-11-26

### Added

- Proving a solve: a note claimed solved shows three proofs in To verify. The change: the commits
  since the drop that changed its lines, with those lines in red and green and Open at that commit,
  followed through moves, renames and a rebase. An independent check: your own Claude, read-only
  on a snapshot of the claim's branch, answers Verified, Partly or Not fixed, and whether the named
  test asserts the fix; it is kept until the branch's diff of the file changes. Landed: a merged PR
  first, then the solving commit in main, then the same patch there.
- Confirm solved keeps the proofs; the box watches the fix every few minutes until it lands
  (`waiting to land`, then `landed`), and brings the note back to To verify with `the fix never
  landed` only when its PR closed unmerged or its branch is gone on origin with nothing in main.
- Not solved keeps the independent check's reason.

### Changed

- The check and the independent check share one runner for Claude and the code snapshots.

### Fixed

- The scan no longer calls macOS's shared folder `/Users/Shared` a home path. Found through the box
  itself: noted, fixed, claimed and proven on this version's own branch.

## [0.4.0] - 2026-11-26

### Added

- Filing: File issue (or `f`) turns an open note into an editor with the title and the four
  sections, filled from the check (Claude's text where it corrected the agent, with Use the agent's
  text to swap back), each with its check label until you change it.
- Create issue waits for the check and never goes off without saying why on the line under it; it
  stays off while the check says the problem is gone, until you press It is not solved.
- Where the issue goes comes from the project's `.ai-tooling/config.yml` (or `.claude/project.yml`)
  on the fetched default branch: repo, `needs-triage` label, board and column; without a config, the
  origin repo. The editor shows it, with the repo's visibility, before anything is created. A
  tracker on monday or asana gets Copy issue instead.
- The issue text: Problem, Evidence with the code linked so GitHub shows it, Current situation,
  Desired situation, and the ticket the note was spotted on.
- A scan before anything goes out: tokens always block; emails, home paths, IP addresses and long
  random strings block in a repo that is not private until marked Fine to publish.
- Similar open issues, the board step with Add to board when it fails, drafts kept in the note, a
  Just filed group, and the `Closes #n` words with Copy once a filed note is solved.
- Filing never makes the same issue twice: a filing cut off after gh created the issue is found
  again by the next Create issue and recorded instead.

### Changed

- Filed notes are part of the history; the panel keeps the ones it just filed in sight until it closes.
- Every write of a note reads it again when something else wrote it in between, so a check
  finishing and a click at the same moment no longer fail with "the note changed meanwhile".

### Fixed

- The `changed on …` chip read a file's text trimmed, so in a file starting with blank lines it
  looked for the note's lines in the wrong place.

## [0.3.0] - 2026-11-26

### Added

- The check: Check (or `k`) on an open note asks your own Claude (`claude -p`, Sonnet) whether its
  four sections hold against the code, and shows Checked, Corrected (with the agent's text under
  Claude's) or Unsure (with Claude's question) per section.
- Looks solved: when the problem is gone on the default branch or the note's branch, a banner says
  why, with Mark solved and Bin.
- The check reads read-only snapshots of both branches (`git archive` after a fetch that never waits
  on a prompt) in a temporary folder, with only Read, Grep and Glob and none of the person's
  settings, CLAUDE.md, memory or MCP servers; the folder is removed afterwards.
- A check is kept on the note and reused until the note's file changes; a timeout or a failure is
  kept as not checked, with why and Check again.

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
