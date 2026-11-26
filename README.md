# Suggestion box

A suggestion box for coding agents in the Herdr app. An agent working on a
ticket may not fix unrelated code, so what it spots outside its ticket gets lost. With the
suggestion box, the agent drops a note in the project's box and carries on. Later you check each
note against the code, file it as a GitHub issue, or bin it.

This is version 0.2.0: the `suggest` command, the agent instructions, and the box as a panel in the
Herdr app. The check, filing, proving a solve and fixing follow; [PLAN.md](PLAN.md) has the whole
plan, and [sketch/blueprint.html](sketch/blueprint.html) shows it.

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

- **To verify**: notes claimed solved, with Confirm solved and Not solved.
- **Open**: the notes, newest first. Click a title for its four sections, the file to open it in
  Cursor at its line, the ticket to jump to its tab (or open it on GitHub). A note whose code
  changed since the drop says so, with Mark solved.
- **Bin** takes a note away at once, with Undo for five seconds; the history keeps the last 30
  days of binned, solved and filed notes, with Restore and Reopen.
- **Collecting** in the header switches drops off and on for this project; the ⚙ for all projects.
- Keys, once the panel has the keyboard: ↑ ↓ pick, enter opens, `s` mark solved, `x` bin, `u`
  undo, `c` confirm, `n` not solved, esc closes.

Each note's state allows a fixed set of actions (PLAN.md section 6c), and the box refuses any
other, also a click that races an agent's claim. All reading and writing goes through
`cli/box.js`, which agents never run.

## Collecting on or off

`~/.suggestion-box/settings.json` holds the switches; the box's header flips them:

```json
{ "collecting": true, "off": ["github.com/acme/shop"] }
```

With collecting off for a project, new sessions there never hear of the box, and a running agent
that still tries is told to carry on. There is no `suggest off`: an agent can never silence the box.

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

## Tests

```sh
bun test
```

The tests run the real command in throwaway repos, and `install.sh` against a throwaway home with a
stand-in `herdr-app`, so your own setup is never touched. Where `herdr-app` is installed, they also
render every part of the box through Herdr's own engine in a hidden window.

## License

MIT
