# Changelog

All notable changes to the suggestion box. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- One card design across the panel, as Settings' Collecting everywhere card: every note, claim, filed
  note, history entry and project is a raised card with its title, a calm line under it and its
  buttons; the main action is filled and last, Bin sits quiet on the far left; the header takes two
  lines so the project's name is never cut off; the footer shows only the keys of the picked note.
- A pixel icon for the box, as Parrot has: a wooden box with a note going into its slot, in colour,
  grey while collecting is off, and larger in an empty box.
- A checked note says who checked it, when and what it found ("Checked by your Claude · 2m ago · 3
  hold, 1 corrected"), and every button says on hover what it does.
- The change proof shows a fix that is not in the note's lines: the claim branch's own other changes
  (never the default branch's in between), also after the branch is merged, and the independent
  check reads them too.

- Settings (the ⚙ in the panel's header): collecting everywhere, and a switch per project for the
  projects of your open spaces and every project with notes, each with its notes and On or Off in
  words, and what a switch does written above them.

### Changed

- What needs you comes first: a Needs you group under To verify holds every filed issue you have to
  act on, also one filed long ago that the history would hide (a fix that did not start or never
  reported back, not on the board, a fix that landed while the issue stayed open), and the header
  counts it: `shop · 1 to verify · 1 needs you · 3 open`. Just filed keeps the rest.
- One colour language across the panel: amber only for what needs you, blue under way (also
  waiting to land, in a claim's proofs and the history), green ready or landed, grey done. Links are
  plain text that underlines on hover instead of the theme's accent, which can be as orange as
  amber; Corrected is blue, and `seen 3×` is no longer amber.
- The footer shows only the keys of the note you picked (↑↓ and enter are in its hover text), "↑↓
  pick a note" while none is picked, and nothing when there is nothing to pick.
- A filed issue without Fix in new tab (no launcher, or issues in another repo) no longer says
  "start the fix whenever you like"; a board error counts no more once GitHub shows the issue on a
  board, and the header counts what was just filed, never saying "empty" above it.
- Fix in new tab names the branch the way the repo's tickets are named: your own Claude proposes a
  type and three to five words (`fix/invoice-editor-duplicate-patch-save` rather than
  `fix/save-invoice-editor-can-send`), with the repo's earlier parallel tickets as examples.
  The title's words still name it when Claude cannot.
- A claim to verify leads with its verdict: one coloured line with what its three proofs add up to
  ("Looks fixed · 3 of 3 proofs hold", "Your Claude says it is not fixed", "Looks fixed, but it never
  landed"), each proof in a few words under it, and the claim, its commits and its issue under
  Details. Claude's independent check starts by itself, one claim at a time.
- The history is compact rows by state: Solved, Filed · still open, Closed on GitHub and Binned, each
  row a dot and one line on how it stands; a click opens its details and the rest of its buttons.
- Just filed leads each card with what it still needs and a dot: amber when it needs you, blue while
  its fix is under way, green when it is ready for a fix, grey once closed (with the PR that fixed
  it). What needs you comes first, and the group title counts it.
- A merged PR shows within a minute while the panel is open: a claim's proofs are looked at again
  every 30 seconds until its fix landed, and the watch of fixes and filed issues runs every minute
  (every five while the panel is closed) and at once when the panel opens. Claims are looked at one
  at a time, and looks within 20 seconds share one fetch, so the box never fetches over and over in
  a repo where agents fetch too.

### Fixed

- Mark solved on main (from the check's banner or a change on main) for a note from a ticket with
  its own commits found no commit of the fix, so the note waited to land forever. The change is now
  looked for where main and the note's commit met, and a note you marked solved on main itself has
  landed.
- An agent that claimed before committing had its starting commit taken for the fix: Landed said
  `in main`. The claimed commit now counts only when it came after the drop and is its branch's own
  work.
- A note from a ticket with its own commits showed `changed on main` for the ticket's own edits,
  and `file removed` for a file only the ticket has or a mistyped path, right after the drop.
- Confirm on a claim whose fix never landed was accepted, then sent back by the watch, again and
  again. Such a claim now leads with `Its fix never landed`, offers Not solved instead, and box.js
  refuses the Confirm with what to do.
- A filed issue with two things to do (a fix that did not start, and not on the board) showed the
  board's Add to board button without saying why.
- A test run no longer leaves its throwaway repos and folders in the temporary folder (gigabytes
  after a few hundred runs): it keeps them in one folder of its own and removes it at the end.
- A file opened from a claim's commit in the editor is a copy in the temporary folder; the daily
  prune now removes the copies a day after they were last written, instead of keeping them forever.
- A new claim on a note never shows the proofs of the claim before it.
- A check the panel started by itself that fails reads "not checked" with Check again on the card,
  never as an error you did not ask for.
- The words that close an issue with the fix's PR are no longer offered once the issue closed or the
  fix landed, and a fix confirmed before its landing was known reads "waiting to land".
- Text that fits the panel: a claim's branch stays whole, the proofs put their answer under their
  name at full width, and the footer no longer cuts off its keys.
- Moving between tabs of a project no longer flashes the panel or closes what you opened; every
  button acts on the box shown.
- A note just filed stays in sight through a reload of the box, per project.
- File issue did nothing: the link to a note's file had the same element id as the button.
- A button whose action fails says why in the panel, and the editor no longer closes on a read that
  is missing for a moment.
- A filed issue says which boards it is on, also when a board's own auto-add workflow put it there;
  without a project config the editor no longer claims there is no board.
- A ticket the parallel-tickets launcher started for a filed issue, however it was started, counts as
  its fix, so Fix in new tab never starts a second one.
- The tab bar's Box button sits next to the button before it.

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
