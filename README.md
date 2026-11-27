# Suggestion box

A suggestion box for coding agents in the Herdr app. An agent working on a
ticket may not fix unrelated code, so what it spots outside its ticket gets lost. With the
suggestion box, the agent drops a note in the project's box and carries on. Later you check each
note against the code, file it as a GitHub issue, or bin it.

This is version 0.6.0: the `suggest` command, the agent instructions, the box as a panel in the
Herdr app, the check, filing, proving a solve, and fixing in a new tab. [docs/plan.md](docs/plan.md)
is the plan it was built from, and [docs/blueprint.html](docs/blueprint.html) shows it.

## How an agent drops a note

```sh
suggest <<'EOF'
title: formatDate throws on a null date
at: src/invoices.ts:42
problem: Invoices without a due date crash the PDF export.
evidence: A fixture with `dueDate: null` made `exportPdf` throw a TypeError.
current: `formatDate(null)` throws, so the export answers with a 500.
desired: `formatDate(null)` returns a dash and the export works.
EOF
```

```
Dropped in shop's suggestion box as note 7 (3 open). Carry on with your task.
```

The text comes on stdin in a quoted heredoc, so backticks, quotes and `$` in it are never run by
the shell. A line starting with two spaces continues the field above it. All four sections are
required. The command fills in the rest: the project, branch, ticket, commit and terminal.

- `suggest list` shows the project's notes that are open, waiting to be verified, or filed.
- `suggest solved <number>` (with `how:` and `proof:` on stdin) claims a note solved when the
  agent's own task fixed it after all. You verify it before the note is closed.
- The same note again only counts, so a note you binned or filed never comes back as a new one.

## One box per project

A project is its repo's `origin`, so every worktree and clone of a repo shares one box. Notes live
in `~/.suggestion-box/notes/<project>/`, one file per note. The command only ever creates files,
so many agents can drop at the same moment.

## How agents learn about it

`install.sh` adds a `SessionStart` hook to Claude Code's `settings.json`. When a session starts in
a git repo, the hook gives it the instructions in [agent-instructions.md](agent-instructions.md),
but only while collecting is on for that project. It also adds the permission rule
`Bash(suggest:*)`, so a drop never stops an agent for a prompt. The command can only drop, list and
claim; it never files or confirms anything.

## The box in the Herdr app

A button at the end of the tab bar, after Quarterdeck's, shows the focused space's project: its open
notes, and a green ✓ for notes an agent claims solved. It wiggles once when a note arrives while
the panel is shut. Click it or press `cmd-alt-s` and the panel opens on the right, like
Quarterdeck: one right-hand panel shows at a time, whichever opened last.

The header says what waits for you, in the order the groups come: `shop · 1 to verify · 1 needs you
· 3 open`. Under it, four filters, each with its count:

- **Now**, where the panel opens: what waits for you, below.
- **Filed**: every issue still open on GitHub, also one whose fix is solved or landed.
- **Done**: solved notes and issues closed on GitHub, the last 30 days.
- **Binned**: binned notes, the last 30 days.

Filed, Done and Binned show one quiet line per note: a dot, its title, and a word on how it stands
(`needs you`, `starting`, `fixing`, `ready`, `waiting to land`, `solved`, `landed`, `closed`). A
click opens its details and its buttons: Fix in new tab, Restore, Reopen. Now holds:

- **To verify**: notes claimed solved, with their three proofs, Confirm solved and Not solved (see
  below).
- **Needs you**: a filed issue you have to act on, also one filed long ago: its fix did not start
  or never reported back, it is not on the board (with **Add to board**), or its fix landed while
  the issue stayed open.
- **Open**: the notes, newest first. The one you picked (the newest until you pick another) is a
  card with its buttons; the others are one quiet line each, amber when one asks for a look. Click
  a card's title for its four sections, the file to open it in
  Cursor at its line, the ticket to jump to its tab (or open it on GitHub). A note whose code
  changed since the drop says so, with Mark solved; for a note from a ticket with its own commits,
  main only counts what changed there since the ticket left it.
- **Check** (or `k`) asks your own Claude to check the note's four sections against the code (see
  below).
- **File issue** (or `f`) turns the note into an editor and files it as a GitHub issue (see below).
- **Bin** takes a note away at once, with Undo for five seconds; Binned keeps it for 30 days, with
  Restore.
- **Just filed**: the issues filed while the panel is open, each with its next step, until the
  panel closes; then they are under Filed.
- **Collecting** in the header switches drops off and on for this project; the ⚙ for all projects.
- One colour language: a dot or line in amber needs you, blue is under way, green is ready or
  landed, grey is done. Links are plain text that underlines on hover.
- Keys, once the panel has the keyboard: ↑ ↓ pick, enter opens, `f` file, `k` check, `s` mark
  solved, `x` bin, `u` undo, `c` confirm, `n` not solved, `1` to `4` pick a filter, esc goes back
  to Now, and there closes. The footer shows the keys of
  the note you picked.

Each note's state allows a fixed set of actions (docs/plan.md section 6c), and the box refuses any
other, also a click that races an agent's claim. All reading and writing goes through
`cli/box.js`, which agents never run.

## The check

An agent writes its note while it is busy with another ticket, and code moves on. **Check** asks
your own Claude Code (`claude -p`, Sonnet, on your own login) whether each section still holds:

- **Checked**: it matches the code. **Corrected**: it was wrong or out of date; Claude's text shows,
  with the agent's under it. **Unsure**: the code cannot settle it; Claude's question shows.
- **Looks solved on main** (or on the note's branch): the problem is gone, with why, and Mark
  solved or Bin, so no issue is filed for work that is already done.
- It reads read-only snapshots: the box fetches, exports the default branch and the note's branch
  with `git archive` into a temporary folder, and runs Claude there with only Read, Grep and Glob.
  No git or shell for Claude, none of your settings, CLAUDE.md, memory or MCP servers, no session
  kept; the folder is removed afterwards.
- A check is kept on the note and reused until the code of the note's file changes. After 90
  seconds, or when Claude cannot answer, it says why, with Check again.

## Filing an issue

**File issue** turns the note into an editor in place: the title and the four sections as fields.
The check runs first (or is reused while it holds), and its texts go into the fields: Claude's where
it corrected the agent, with **Use the agent's text** to swap back. A field you change loses its
label. Create issue waits for the check, and the line under it always says why it is off:
`Waiting for the check`, `Fill in: Desired situation`, `The check says this is solved` (until you
press **It is not solved**), or what the scan found.

- **Where it goes** comes from the project's `.ai-tooling/config.yml` (or `.claude/project.yml`) on
  the fetched default branch, and the editor shows it before anything is created:
  `→ acme/shop (public) · triage · board Shop › Backlog`.

  | The project has | Repo | Label | Board |
  | --- | --- | --- | --- |
  | The config, tracker on GitHub, with `project` and `status` | `tracker.repo` | `labels.needs-triage` | `tracker.project`, column `tracker.status.todo` |
  | The config without `project` or `status` | `tracker.repo` | as above | none |
  | The config, tracker on monday or asana | Copy issue puts the title and text on your clipboard | | |
  | No config | the `origin` repo | none | none |

- **The issue text** is always Problem, Evidence, Current situation and Desired situation. Under
  Evidence the box adds the code: the note's lines found on the default branch, linked so GitHub
  shows them, else the note's own commit when GitHub has it, else the file. A last line names the
  ticket the note was spotted on. No mention of Claude or agents.
- **Before it goes out**, the title and sections are scanned. A token (GitHub, AWS, Slack, OpenAI,
  Anthropic, a private key, a bearer token) blocks Create anywhere. Email addresses, home paths, IP
  addresses and long random strings block it in a repo that is not private, until each is removed
  or marked **Fine to publish**.
- **Similar open issues** show as links, so you can bin a duplicate instead.
- **The board**: the issue is added to the board and put in its `todo` column, finding the field
  and column by name, as the team's skills do. When that fails, the issue stays, the note says why,
  and **Add to board** tries again; without the `project` scope it says `run gh auth refresh -s
  project`.
- **Your draft** is kept in the note when you leave a field, close the editor or close the panel.
- A filed note sits in **Just filed** with its next step until the panel closes, then under
  **Filed**; whenever it needs you, it shows under **Needs you**. Once it is solved, the box gives
  you the words for the fix's PR, such as `Closes #812`, with Copy.

## Proving a solve

An agent saying a note is solved is not proof. A claimed note waits in **To verify** until you
confirm it, and opening it shows three proofs, each with a dot for how it stands:

- **The change**: the commits since the drop that changed the note's lines, with those lines in
  red and green, and **Open** for the file as that commit has it. The lines are followed through
  moves and renames with plain git, and found again by their snippet after a rebase.
- **Independent check**: your own Claude, in a fresh read-only session on a snapshot of the claim's
  branch (Sonnet, as for the check), answers **Verified**, **Partly** or **Not fixed** with why,
  and says whether the test the claim names really asserts the fix. It is kept until the branch's
  diff of the note's file changes.
- **Landed**: the branch's merged PR counts first, whatever the merge style; else the solving
  commit in the fetched main, else the same patch there (`git cherry`), for squash and rebase merges.
  The commit an agent claimed on only counts when it came after the drop and, on a branch, was that
  branch's own work when the agent claimed (suggest records it), so a claim made before committing
  is never taken for the fix. On a branch, main's own commits never count as the change either. A
  note you marked solved on main itself (from the check's banner or a change there) has landed
  already.

**Confirm solved** keeps the proofs as they stood and moves the note to **Done**, where it says
`waiting to land` until the fix is in main, then `landed: PR #44 merged`. The box looks again every
few minutes. Only when the PR is closed without a merge, or the branch is gone (asked of origin
itself) with nothing in main, does the note come back to To verify with `the fix never landed`.
A claim whose fix never landed says so first (`Its fix never landed`, or `Looks fixed, but it never
landed` when your Claude found the fix on its branch) and offers **Not solved** instead of Confirm.
**Not solved** drops the claim with the check's reason (or yours), and the note is back where it
was: open, or filed.

## Fixing in a new tab

**Fix in new tab** on a filed issue starts it as a ticket, exactly the way your parallel tickets
start: through `issues launch` of the parallel-tickets launcher
(`~/.claude/skills/parallel-tickets/scripts/issues`). The branch, the
worktree and stack, the ticket's prompt (`/ship-issue <n>`) and the record behind
`/parallel-tickets status` are the launcher's own; the box builds nothing by hand.

- The branch is named the way your repo's tickets are: your own Claude (Sonnet, no tools, none of
  your settings or memory, in an empty folder) proposes a type and three to five words, such as
  `fix/format-date-throws-null`, with the titles and branches of the repo's earlier
  parallel tickets as examples. The type is a Conventional Commits one (`fix`, `feat`, `refactor`,
  `perf`, `docs`, `chore`, `ci`), or `cleanup` where your tickets use it. When Claude cannot, or
  its name breaks those rules, the title's words name it (`fix/formatdate-throws-null-date`). The
  launcher's `issues branch` checks it; a name that is taken gets `-2`.
- The launcher runs through your login shell from the project's main checkout, with
  `--space <id>`, so the tab opens in the space you are in, and the box stays where it is.
- The note then says it is being fixed in its own tab, with its branch and **Go to its tab ↗**, and
  the fix never starts twice.
  A launcher that fails (uncommitted work in the main checkout, no network) leaves its last line
  on the note, and the button stays to try again.
- The button shows only for an issue on GitHub in the project's own repo, when the launcher and
  its `hagent` are installed and the launcher knows `--space`, and when a project config, if there
  is one, names GitHub and that repo. Without the launcher there is no button; the rest of the box
  works the same.
- The box asks every few minutes whether a filed issue was closed; a closed one says so and gets
  no fix, and one opened again gets the button back. A start that never reported back (the
  launcher was cut off) says so after ten minutes: look for its tab before starting again.

## Collecting on or off

Which projects use the box is up to you. The **⚙** in the panel's header opens Settings:

- **Collecting everywhere**: one switch for every project. Off, no project's agents hear of the box,
  and the switches per project keep what you chose for when you turn it back on.
- **Projects**: the projects of your open spaces and every project with notes, the one you are in
  first, each with its notes and its own On or Off.
- The **Collecting** switch in the header flips the project you are in.

When a project is on, its new Claude sessions get the box's instructions, and agents drop the
problems they find outside their task. When it is off, its agents never hear of the box, exactly
as before it was installed. A switch counts for new sessions at once; an agent that is already
running hears that the box is off on its next note, and names what it found in its final report
instead. There is no `suggest off`: an agent can never silence the box.

The switches live in `~/.suggestion-box/settings.json`:

```json
{ "collecting": true, "off": ["github.com/acme/shop"] }
```

## Install

Needs `node`, `jq`, and `~/.local/bin` on your `PATH`.

```sh
./install.sh [layout]   # the command, the hook and the rule; with the Herdr app, also the box
./uninstall.sh         # takes exactly those out again; --purge also removes your notes
```

With the Herdr app there, `install.sh` also links the mod, adds the button and the panel to your
layout (to a copy, `<name>-suggestion-box`, when the layout is one of Herdr's own) and binds
`cmd-alt-s` when it is free. Every file they change is kept beside it first, and both can run
again at any time.

## How it is built

```
bin/suggest            the agents' command (a link to it sits in ~/.local/bin)
cli/suggest/           its code: drop, list, solved, session-start; it only ever creates files
cli/box.js             the box's own side, which the panel runs; it alone rewrites notes
cli/box/               one module per group of the box's commands (read, act, filing, claims,
                       fixing, settings, note-files) and their libraries (check, claude, file,
                       proofs, fix, changes)
cli/shared/            what both sides use: git, and the box's folder and switches
mods/suggestion-box/   the Herdr mod
  main.js              the view: init and render, with its parts in view-*.js
  view-*.js            reading, the button, the panel, the editor, the proofs, Fix in new tab
  panel.js             the panel's drawing, with its parts in panel-*.js
  rules.js events.js notes.js lines.js check.js config.js issue.js scan.js editor.js
  proofs.js fix.js     pure modules: no Herdr and no Node, shared by the panel and cli/box, and
                       tested on their own
scripts/               the pixel icon's drawing
tests/                 one test file per module, the panel drawn by Herdr's own engine
docs/                  the plan the box was built from, and its blueprint
```

The mod's files sit flat in one folder, as Herdr loads a mod by its folder.

## Tests

```sh
bun test
```

The tests run the real command in throwaway repos, and `install.sh` against a throwaway home with a
stand-in `herdr-app`, so your own setup is never touched. Where `herdr-app` is installed, they also
render every part of the box through Herdr's own engine in a hidden window. Run them from the repo's
root: Bun reads `bunfig.toml` there, which preloads `tests/run-folder.js`, so a run keeps all of it
in one temporary folder of its own and removes that folder when it ends. Started anywhere else, the
tests stop at once.

## License

MIT
