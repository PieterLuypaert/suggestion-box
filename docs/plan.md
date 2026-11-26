# Suggestion box: plan

> The plan the box was built from (plan 16). The box has grown since: the code, the README and the
> CHANGELOG say what it does now, and file names in this plan are as they were planned.

Plan version 16 · 2026-11-26 · reviewed twice · one open question · Nothing built yet

The visual version of this plan is `docs/blueprint.html`. Its publish label "Plan N" matches the
plan version here.

## 1. What we are building

Team rules say an agent never fixes unrelated code while it works on a ticket. So problems it
spots outside its ticket get lost. The suggestion box keeps them: the agent drops a note in the
project's box and carries on, and you later turn each note into a GitHub issue or bin it, from a
button in the Herdr app's tab bar. Every issue follows one standard: Problem, Evidence, Current
situation, Desired situation. The agent fills them in when it drops the note, and before
anything is filed your own Claude checks them against the code and corrects what is wrong. A
filed issue can go straight to a new ticket tab where Claude fixes it.

Five parts:

| Part | What it is | Who uses it | Lives in |
| --- | --- | --- | --- |
| A. The `suggest` command | Drops a note in the current project's box | Agents (and you, in any terminal) | `bin/suggest` |
| B. The agent instructions | Tells a Claude session when and how to drop a note, only while collecting is on for its project | Claude Code | a session-start hook + a permission rule |
| C. The box | A button with the project's count, and a panel of its notes on the right, like Quarterdeck | You | `mods/suggestion-box/` |
| D. Filing | Checks a note against the code, then turns it into a GitHub issue after you edit it | You | `mods/suggestion-box/` |
| E. Fixing | Opens a filed issue as a new ticket tab, where Claude runs `/ship-issue` on it | You | `mods/suggestion-box/` |

## 2. Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| Name | Suggestion box, command `suggest` | Says what it is; `suggest` is free on the PATH |
| Key | `cmd-alt-s` opens and closes the panel | Free today; the user took the default |
| Repo | Public, `PieterLuypaert/suggestion-box`, like parrot; created when PR 1 is ready, that push on the user's ok | The user took the default; examples are made up, so nothing of work leaks |
| Final report | Agents list the notes they dropped and the ones they claimed solved | The user took the default |
| Fix stack | The launcher's default: a full stack in repos with `wt` | The user took the default; the fix can run its tests |
| After Fix | Stay in the box; `Fixing in …` jumps to the tab when you want | The user took the default; no tab switch you did not ask for |
| Scope | **One box per project**: the box follows the focused space; ticket worktrees share their repo's box | The user's call: a clearer UI than one box with every repo in it |
| Where it opens | **A panel on the right, like Quarterdeck and Chartroom**: a full-height column, opened and closed by its button at the end of the tab bar or `cmd-alt-s` | The user's call: room for the editor and the check, and it stays open beside your work while the check runs |
| One panel at a time | Whichever right-hand panel opened last stays; the others are hidden (`layout.hide`). The box's button watches the layout, so it works for every key and button, not only the box's own | Side by side, box and Quarterdeck leave the tabs and panes about 460 px on a 1512-pt laptop, all three about 4 px |
| How agents pass text | On stdin, in a quoted heredoc (`<<'EOF'`), one `key: value` per field | In double-quoted arguments an agent's Markdown backticks run as shell commands |
| Who drops notes | Only an agent's main session on a task; subagents, reviewers and read-only tasks report to whoever asked them | Keeps the box from flooding with every review finding |
| Issue text | **One standard**: Problem, Evidence, Current situation, Desired situation | The user's call: every issue reads the same way for the team |
| Who writes the sections | The agent, when it drops the note; all four are required | It knows the context best at that moment, so they are always filled in |
| Correct sections | When you open File issue, your own Claude checks the four sections against the code (read-only) and corrects what is wrong; each section shows Checked, Corrected or Unsure | The user's call: filled in automatically, but correct |
| Filing | Edit, then create: File issue opens the title and the four checked sections; Create issue files it | You shape every issue the team sees |
| Complete issues only | The command refuses a note without all four sections; Create issue needs all four and a finished check | What reaches GitHub is always complete and checked |
| Where an issue goes | Read from the project's own `.ai-tooling/config.yml`: the repo, the triage label, the board and its first column | The same file and the same way the team's skills (ship-issue, create-pr) already use, so the box files where the team expects |
| Fixing | Fix in new tab runs parallel-tickets' own `issues launch --ticket <n> --branch <b>` | The ticket starts exactly like your parallel tickets: a fresh branch, a hagent tab, the ticket prompt, plan first, no push, and it shows in `/parallel-tickets status` |
| When Fix shows | Only on a filed GitHub issue, and only when the parallel-tickets launcher and hagent are there | ship-issue needs an issue number; without the ticketflow there is no safe way to open the tab |
| New note | Badge only: with the panel closed the count goes up and the button wiggles once; in an open panel the note appears at the top | Agents never pull you out of your flow |
| Collecting on or off | A switch per project in the panel's header, and one for all projects in the panel's settings. Off: `suggest` refuses new drops with a calm answer; listing, claiming, checking and filing keep working. Only the box can flip it: there is no `suggest off` | The user's call: some projects and busy days need quiet; an agent must never be able to silence the box |
| Who files | Only you, from the box | The command only drops, lists and claims notes solved, all on this machine, so it is safe to allow without a prompt |
| Solved along the way | The agent claims a note solved when its own task fixes it after all; the box flags notes whose code changed; the check spots it before filing | A note never lingers, or becomes an issue for work that is already done |
| A solved note is never filed | Each note state allows a fixed set of actions (section 6c). A note claimed or confirmed solved has no File issue, and when the check finds the problem gone, Create issue is off | Filing done work makes noise for the team; the user's call |
| Proof before it leaves | A claimed solve waits in To verify until you confirm it, with three proofs: the change itself, an independent check by your own Claude, and the fix landed in main | The user's call: "an agent said so" is not proof; you see it before a note leaves the box |
| Check model | Sonnet | The check's whole job is to be right; it runs once per note you file, and you wait on it anyway |
| Teaching agents | A Claude Code session-start hook adds the instructions to a session only when collecting is on for its project, and only in a git repo | With collecting off, a new session never hears of the box: exactly as before it was installed (the user's call). A skill may not trigger mid-task; a fixed CLAUDE.md block could not be switched off |
| Storage | One JSON file per note, local only. The command never rewrites a note: a drop creates a new file, and a repeat or a claim adds an event file beside it; only the box folds events in and rewrites notes | Agents dropping at the same moment never clash, and no agent write can undo a filing; no lock to go stale |
| Claude calls | One per note you file (the check) and one per solve you verify (proof 2), on your own Claude subscription; read-only; none while notes sit in the box, and a re-check only when the file's code changed | Correctness is worth the calls; notes you bin cost nothing |

## 3. How a note travels

1. An agent working on ticket #8504 in a `shop` worktree sees a problem outside its ticket.
2. It runs `suggest` with the title, `src/invoices.ts:42` and the four sections on stdin
   (section 4).
3. The command writes `~/.suggestion-box/notes/github.com__acme__shop/<id>.json` and answers
   `Dropped in shop's suggestion box as note 7 (3 open). Carry on with your task.`
4. In the Herdr app, the button of every window showing a `shop` space goes from 2 to 3 and
   wiggles once.
5. You click it: the panel opens on the right and lists `shop`'s open notes.
6. You click File issue on the note. Your own Claude checks the four sections against the code
   and corrects what is wrong; you read them, adjust if you like, and press Create issue.
7. The issue is created in `acme/shop` with the triage label, in the standard layout, and put on
   the project's board in its Backlog column; the note shows `Filed #812`. Or you press Bin and
   it is gone (Undo for 5 seconds).
8. Optionally you press Fix in new tab: the ticket starts like your parallel tickets, in a new tab
   on `fix/formatdate-throws-null-date` with its own worktree and Claude running
   `/ship-issue 812`. It posts its plan and waits for your go.

## 4. Part A: the `suggest` command

The text comes on stdin, in a quoted heredoc, one `key: value` per field. The shell runs nothing
inside a quoted heredoc, so backticks, quotes and `$` in code are safe; in double-quoted arguments
an agent's Markdown backticks would run as commands.

```sh
suggest <<'EOF'
title: formatDate throws on a null date
at: src/invoices.ts:42
problem: Invoices without a due date crash the PDF export.
evidence: A fixture with `dueDate: null` made `exportPdf` throw
  `TypeError: Cannot read properties of null (reading 'getTime')`.
current: `formatDate(null)` throws, so the export answers with a 500.
desired: `formatDate(null)` returns a dash and the export works.
EOF

suggest list

suggest solved 7 <<'EOF'
how: formatDate returns a dash for null now
proof: invoices.test.ts: formats a missing due date as a dash
EOF
```

A line that starts with two spaces continues the field above it. For a quick note by hand, the
same fields work as flags: `suggest --title "…" --at … --problem "…"`.

**Dropping a note**

- `title` is required: one line, at most 100 characters.
- `at` is optional: `<file>[:<line>]`, relative to the repo root (an absolute path inside the repo
  is made relative). A path that doesn't exist is kept, with a warning. With a line, the command
  also keeps the five lines around it (`snippet`), so the box can find them again after the code
  moves (section 8).
- `problem`, `evidence`, `current` and `desired` are required, at most 500 characters each. The
  agent has the context when it drops the note, so it always fills them in; the box checks them
  later (Part D).
- The command fills in the rest itself: project, branch, ticket, commit, worktree, main checkout,
  the Herdr terminal and which agent (see section 8).

**What it answers**

| Case | Output | Exit |
| --- | --- | --- |
| Dropped | `Dropped in shop's suggestion box as note 7 (3 open). Carry on with your task.` | 0 |
| Collecting is off for this project, or for all | `The suggestion box is off for shop. Do not drop notes for the rest of this task; name findings in your final report instead.` Nothing is written | 0 |
| The same note is in the box | `Already in shop's box as note 7 (spotted 2×). Carry on with your task.` | 0 |
| The same note was filed or binned | `Already filed as #812 (note 7, spotted 3×). Carry on with your task.` or `Already binned by the user (note 7). Carry on with your task.` | 0 |
| The same note is waiting in To verify | `Note 7 is claimed solved and waits for the user to verify. Carry on with your task.` | 0 |
| The same note was confirmed solved | It is back: note 7 reopens with `spotted again after it was solved on feat/…`, and the command says `Note 7 was solved on feat/…; reopened it, as you see it again.` | 0 |
| A section missing or empty | `suggest: missing current, desired; the issue needs all four sections` | 2 |
| `at` file not found | the drop line, plus `warning: src/invoce.ts is not in the repo; kept as written` | 0 |
| Not in a git repo | `suggest: not in a git repo; the box is per project` | 2 |
| Title empty, longer than 100 characters or on several lines | `suggest: keep the title to one line of at most 100 characters; put the rest in the sections` | 2 |
| A section over 500 characters | `suggest: evidence is over 500 characters; keep it to the essentials` | 2 |
| Claimed solved | `Note 7 claimed solved on feat/8504-group-records (abc1234); it waits in the box for the user to verify.` | 0 |
| `how` or `proof` missing | `suggest: say what fixed it (how) and the test or check that shows it (proof)` | 2 |
| No such note | `suggest: shop's box has no open or filed note 7; suggest list shows them` | 2 |
| Claiming a note that is binned, waiting in To verify or solved | `suggest: note 7 is binned` (or `already claimed`, `already solved`); nothing changes | 2 |
| The note can't be written | `suggest: could not write the note: <reason>` | 1 |

**The same note** means: same project, same title after lowercasing, collapsing spaces and
dropping a trailing full stop, and the same file (or both without one), in any state the box
still keeps: open, to verify, solved, filed or binned. The line may differ. A repeat drop counts and
keeps the note's state, so a note you binned or filed never comes back as a new one. The one
exception is a note confirmed solved: seeing it again means the problem is back, so it reopens.

**Collecting off** (section 6) only stops new drops. `suggest list` and `suggest solved` keep
working, so an agent can still claim a note its task fixed. Exit 0, so an agent neither retries
nor reaches for another way to file.

**`suggest list`** prints the project's notes that are open, to verify or filed (with their issue),
newest first, so an agent can also claim a filed note:
`7  2m  invoices.ts:42  formatDate throws on a null date  (#8504)`. Agents run it before they
drop, to spot a near-duplicate the exact-title check misses.

**Note numbers** count up per project and are never reused, also after old notes are deleted (a
tombstone keeps each number, section 8). **`suggest solved`** claims an open or filed note of this
project solved, with the current branch, its commit, the how and the proof. The note then waits in
To verify until you confirm it (section 6b).

**Many agents at once**: the command never rewrites a note, so there is nothing to lock.
- A drop claims its number by creating `numbers/<n>` with exclusive create (`O_EXCL`), the next
  number up when that one is taken, then writes its note the same way.
- A repeat or a claim adds an event file, `events/<note id>/<time>-<random>.json`, also with
  exclusive create. To answer (`Already filed as #812`), the command reads the note and its events.
- Only the box rewrites notes: it folds events in, records your actions and writes each note with
  `writeTextFile`'s compare-and-swap (or through `exec`, whichever the PR 2 spike proves). So an
  agent's write can never turn a filed note back to open, and no stale lock can block a drop.

## 5. Part B: the agent instructions

**How they reach a session**: a Claude Code `SessionStart` hook. `install.sh` adds it to
`~/.claude/settings.json` (backup first) and `uninstall.sh` removes exactly that entry. At the start
of every session, and again after `/clear` and after a compaction, the hook runs
`suggest session-start`, which reads the session's folder from the hook's input and prints the
instructions below only when all of these hold:

- the folder is in a git repo;
- collecting is on for all projects and for this one (section 6).

Otherwise it prints nothing, so the session never hears of the box: with collecting off, an agent
works exactly as it did before the mod was installed. A session that was already running when you
turned collecting off keeps what it read; its next drop gets the calm "off" answer (section 4) and
it stops. Subagents most likely do not get session-start text, which keeps review and helper
agents out of the box; PR 1 checks this.

`suggest session-start` only reads; it writes nothing and changes no setting, so it is safe inside
the permission rule. The text lives in the repo as `agent-instructions.md`:

~~~markdown
## Suggestion box

When you notice a real problem outside your current task (a bug, a risky pattern, a missing
test, dead code, wrong docs), do not fix it and do not let it pull you off course. Drop a note
and carry on. Run `suggest list` first: dropping a note that is there already only counts.

```sh
suggest <<'EOF'
title: <what is wrong, one line>
at: <file>:<line>
problem: <what is wrong and who or what it hurts>
evidence: <what you actually saw: the failing test, the error text, the log line, the code path>
current: <what the code does now, as you saw it happen or read it; quote the error or output>
desired: <what should happen instead, from the code's own types, tests, docs or the ticket>
EOF
```

All four sections are required and become the issue, so write only what you checked, no
guesses. When you are not sure what should happen, write "Unsure: <the question>" as desired.
Write in plain English without any chat style, and leave out secrets, tokens, customer data and
personal paths: teammates read it, and the repo may be public. If `suggest` says the box is off,
drop no more notes in this task and name your findings in your final report instead.

Only drop what a teammate would want an issue for: no style nits, nothing your own task should
fix, at most a few per task. Only in your main session on a task: as a subagent, a reviewer or in
a read-only task, report findings to whoever asked you instead. Never file an issue yourself; if
`suggest` is missing or fails, name the finding in your report instead.

Every drop answers with the note's number. If your own task ends up fixing a note after all
(yours or another agent's), claim it, naming a real test or check; the user verifies it before
the note is closed:

```sh
suggest solved <number> <<'EOF'
how: <what fixed it, one line>
proof: <the test or check that shows it>
EOF
```

In your final report, list the notes you dropped and the ones you claimed solved.
~~~

**The permission rule**: `Bash(suggest:*)` in `permissions.allow` of `~/.claude/settings.json`
(backup first), so a drop never stops an agent for a prompt.

**How it fits the team flow**: ship-issue already puts out-of-scope things under "Risks and open
questions" in its plan. The note keeps them after the ticket is done. Nothing in a team skill
changes.

## 6. Part C: the box

### The button

At the end of the tab bar, after Quarterdeck's button (the last one today), like the others.

| State | Looks like |
| --- | --- |
| Focused space has no git repo, or is on another machine | Box icon, dimmed; tooltip says why |
| Project's box is empty | Box icon only |
| Project has open notes | Box icon and the count of open notes |
| Notes wait in To verify | A green `✓1` beside the count (or alone), because they need a different action: your proof |
| Panel open | The button shows it is on, as Quarterdeck's does |
| Collecting off for the focused project (or for all) | The box icon with a small slash; the counts still show |
| A note arrives for the focused project | Panel closed: the count goes up and the button wiggles once (native animation, no timer). Panel open: the note appears at the top of the list, lit up for a moment |

Notes for other projects show nothing until you switch to their space. Click, or `cmd-alt-s`,
opens and closes the panel.

### The panel

A column on the right of the window, the full height, like Quarterdeck (380 px) and Chartroom
(460 px): 400 px wide and hidden until you open it. It sits in the layout as a hidden block next
to theirs. One right-hand panel shows at a time: opening the box hides Quarterdeck and
Chartroom (`layout.hide`), and when one of those opens, the box hides itself; side by side they
would leave the tabs and panes almost no room on a 1512-pt laptop. It always shows the focused space's project: switching spaces switches the box. Header:
`SUGGESTION BOX · shop` and a summary such as `2 open · 1 to verify`. The list scrolls; the header
and the footer stay.

The list has one group per state that needs you, each with its count, in this order:

1. **To verify**: notes claimed solved, each with its three proofs (section 6b).
2. **Open**: new notes, newest first.
3. **Just filed**: notes you filed while the panel was open, with Fix in new tab; they move to
   the history when you close the panel or switch project.

A group without notes is left out. When a note leaves a group by itself (an agent claims it, the
watch reopens it), a one-line notice shows at the top for a few seconds, such as
`Note 7 moved to To verify: an agent claimed it solved on feat/8504-…. Your draft is kept.`, so a
note never vanishes from under you.

| What you do | What happens |
| --- | --- |
| Click a note | Its four sections open under it; click again to close |
| Click `invoices.ts:42` | The file opens at that line in Cursor, in the ticket's worktree while it exists, else in the main checkout |
| Click `#8504` | Jumps to the tab that dropped it while it is open, else opens the ticket on GitHub |
| `2×` | Shown when agents spotted the same note more than once |
| `changed on feat/8504-…` | The note's lines changed since it was dropped; Mark solved shows next to File issue and Bin, and sends it to To verify (section 6b) |
| The To verify group | Notes claimed solved, above the open notes, each with its three proofs, until you confirm them (section 6b) |
| `spotted again after it was solved` | A note confirmed solved that an agent dropped again: the problem is back |
| File issue | The note turns into the editor (Part D), in place in the panel |
| Bin | The note goes at once; an Undo stays in its place for 5 seconds |
| `Filed 4 · Solved 2 · Binned 1 ▸` | Opens the history of the last 30 days: filed notes link to their issue, solved ones show their proofs and whether the fix landed, binned and solved ones can be reopened |
| The button or `cmd-alt-s` | Closes the panel; your work in it (an open editor, a running check) is kept |

### Collecting on or off

- **Per project**: a switch in the panel's header, `Collecting` on or off, for the focused
  project. Off for a client repo, say, while the box keeps working for the others.
- **For all projects**: one switch in the panel's settings (the ⚙ in the header), for a quiet day.
- **What off does**: new sessions in that project get no instructions at all (section 5), so their
  agents work as before the mod was installed. A session that was already running and still tries
  gets the calm answer from `suggest` (section 4), and nothing is written. Notes already in the box stay, and listing, claiming, the check, filing,
  To verify and Fix in new tab all keep working.
- **Who can flip it**: only you, in the box. The setting lives in `~/.suggestion-box/settings.json`,
  which only the box writes; there is no `suggest off`, because `Bash(suggest:*)` lets agents run
  any `suggest` command. Without the app (the herdr TUI), the file can be edited by hand.
- **What you see**: the header says `Collecting off: agents are told to carry on`, and the
  button's icon gets a small slash while it is off for the focused project.

**Keyboard**, as in Quarterdeck: the panel takes the keyboard with `pane.go` (`"focusable": true`).
↑ and ↓ pick a note, enter opens its sections, `f` opens File issue, `s` marks it solved, `x`
bins it, `u` undoes a bin, and esc leaves the editor. In To verify: `c` confirms solved, `n`
marks it not solved, `d` shows the diff. Typing in the editor's fields works as in any field.

Empty box: "Nothing in shop's box. Agents drop notes here when they spot a problem outside their
ticket."

## 6b. Solved along the way, and proven

Sometimes the agent's own task ends up fixing what it noted: the fix turned out to be needed after
all, or you asked for it. Then the note must not linger, or become an issue for work that is
already done. But "an agent said so" is not proof. So a note claimed solved does not leave the box
until you have seen the proof and confirmed it.

### How a note gets claimed solved

All three land in the same place, the To verify group:

1. **The agent says so.** Every drop answers with the note's number (`as note 7`). When the agent's
   work fixes a note after all, its own or another agent's, it runs:

   ```
   suggest solved 7 <<'EOF'
   how: formatDate returns a dash for null now
   proof: invoices.test.ts: formats a missing due date as a dash
   EOF
   ```

2. **The box sees the code move.** For each open note, plain git maps the note's lines forward:
   the hunks of `git diff -U0 -M <note commit> <tip> -- <path>` shift them as code above moves,
   `-M` follows a rename, and the snippet anchors them (and is searched for instead when the note's
   commit is gone after a rebase). When the mapped lines changed on the note's own branch or on the
   default branch, the note gets a `changed on feat/8504-…` (or `changed on main`, or
   `file removed`) chip and a Mark solved button. No Claude.
3. **The check spots it.** When you open File issue, the check (Part D) looks at the default branch
   and the note's own branch; when the problem is gone, its banner offers Mark solved.

### To verify: three proofs

Claimed notes sit in their own group at the top of the panel, above the open notes, until you
decide. Opening one shows who claimed it, on which branch, the how and the named proof, and three
proofs, each with its own state:

| Proof | What it shows | Green when |
| --- | --- | --- |
| 1. The change | The commits since the drop whose diff touches the note's mapped lines, with that diff inline in red and green; Open in Cursor opens the file at the solving commit | At least one commit changed those lines |
| 2. An independent check | Your own Claude, in a fresh session (not the agent that claimed it), reads the note, the change, the code on that branch and the named test; read-only and Sonnet, like the check of Part D. It answers Verified, Partly or Not fixed with its reason, and says whether the named test really asserts the fix | Verified |
| 3. Landed | The branch's PR (`gh pr list --head <branch> --state all`) and its state. Merged PR: landed, whatever the merge style. No PR: the solving commit in the fresh default branch (`git merge-base --is-ancestor`), else a same patch there (`git cherry`), so squash and rebase merges count | The fix is in main |

- Proof 2 runs when you open the note, once, and runs again only when the diff of the note's file
  changed since. Proofs 1 and 3 are plain git and gh, and refresh each time the panel shows the
  project.
- **To verify** means: the note has a claim you have not confirmed. Its own state does not change
  while it waits: an open note stays open underneath, a filed one stays filed.
- **Confirm solved** (one click) moves the note to the history as solved, with the three proofs as
  they stood. **Not solved** drops the claim, so the note is back where it was (open, or filed:
  a filed note can never be filed twice), marked `claimed solved on <branch>, not verified`, with
  the reason from the check or from you.
- Confirm works at any time, also before the fix landed. Then the box keeps watching: once the
  fix is in main, the history entry shows `landed in main`. Only when the PR is closed without a
  merge, or the branch is gone with no merged PR and no same patch in main, does the note come back
  to To verify with `the fix never landed`.
- A filed note claimed solved goes through the same three proofs, and also shows the hint to put
  `Closes #812` (the config's `pr.link_keyword`) in that branch's PR (you open PRs yourself), with a Copy button for that line. Fix
  in new tab is gone for it.

| Where the note is | What you see |
| --- | --- |
| Claimed, not confirmed | In To verify, with the three proofs; nowhere else |
| Confirmed, not landed yet | In the history as `Solved on feat/… · waiting to land`, still watched |
| Confirmed and landed | In the history as `Solved · landed in main (9f3e21c)` |
| The fix never landed | Back in To verify with `the fix never landed` |

`suggest solved` changes only a local note file, like a drop, so it stays inside the permission
rule. It never touches GitHub, and only you confirm.

## 6c. Note states: what you can do with each

Every note is in exactly one state, and each state allows a fixed set of actions. The box shows
only the buttons of the state, and refuses any other action, also one that races in (an agent's
claim while you edit, say).

| State | Where it shows | File issue | Mark solved | Bin | Confirm / Not solved | Fix in new tab | Reopen / Restore |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Open | Open group | yes | only with a `changed on …` chip | yes | no | no | no |
| Open, being edited | Open group, as the editor | Create issue, unless the check finds the problem gone | from the check's banner | yes | no | no | no |
| Claimed (to verify) | To verify group | **no** | no | no | yes | no | no |
| Solved (confirmed) | History | **no** | no | no | no | no | Reopen |
| Filed | Open group until the panel closes, then history | no (it is filed) | no | no | no | yes, unless a fix runs | no |
| Filed, then claimed | To verify group | no | no | no | yes | no | no |
| Filed, then solved | History, with the `Closes #812` hint | no | no | no | no | no | no |
| Binned | History | no | no | no | no | no | Restore |

Moves between states:

- **Open → Claimed**: an agent runs `suggest solved`, you press Mark solved, or the check's banner
  says the problem is gone and you press Mark solved there.
- **Claimed → Solved**: Confirm solved. **Claimed → back where it was** (open, or filed): Not solved; the
  note then carries `claimed solved on <branch>, not verified`, and File issue works again.
- **Solved → Open**: Reopen in the history, an agent dropping the same note again (the problem is
  back), or the watch finding that the fix never landed (then it goes to Claimed, with
  `the fix never landed`).
- **Open → Filed**: Create issue. **Open → Binned**: Bin. **Binned → Open**: Restore.
- **An agent claims a note while you edit it**: the editor closes with
  `An agent claimed this solved on feat/…; see To verify`, your draft is kept, and the note moves
  to To verify. Create issue cannot go through for it.

**Create issue never goes off without saying why**: one line under the buttons names the reason,
such as `Waiting for the check`, `The check says this is solved`, `Fill in: Desired situation`
or `Remove 1 sensitive item: this repo is public`.

**When the check finds the problem gone**, the editor shows the banner
`Looks solved on main (abc1234): <why>` and Create issue is off. You choose Mark solved (to To
verify), Bin, or, when you disagree with the check, `It is not solved` under the banner, which
turns Create issue back on and keeps your reason in the note.

## 7. Part D: filing

**File issue** turns the note into an editor in place: a Title field, one field per section
(Problem, Evidence, Current situation, Desired situation), each with its check label, the target
line (`→ acme/shop (public) · needs-triage · board Shop › Backlog`), similar open issues, and Cancel and
Create issue.

### The check: filled in automatically, but correct

The agent wrote the sections while it was busy with another ticket, and code moves on. So the
moment you open File issue, the box asks your own Claude to check them against the code, the same
way parrot and Chartroom ask it (`claude -p` on your subscription).

**How it runs**
- `claude -p` with the flags parrot already uses for its own calls: `--model sonnet`, its own
  `--system-prompt`, `--json-schema` for the answer, `--setting-sources ""`,
  `--strict-mcp-config` and `--no-session-persistence`.
- It reads code from snapshots, never the working tree, which can be stale, dirty or on another
  branch: the box fetches origin, then exports the tree of `origin/<default>` and of the note's
  branch into two temporary folders (`git archive`), and runs Claude there. Its only tools are
  Read, Grep and Glob. No git and no shell, because `git grep -O` can start a program and
  `--output` can write a file, and the check reads text written by agents. It cannot edit, run
  anything or reach the network. When the ticket's worktree still exists, its uncommitted diff of
  the file is passed in too. The folders are removed afterwards.
- It gets the note (title, four sections, file, line, snippet, the commit it was seen on) and the
  diff of that file from the note's commit to the default branch and to the tip of the note's own
  branch, which the box computes first, so Claude sees whether the code moved.
- It answers in JSON: per section a verdict and, when needed, a text; plus whether the problem is
  already gone, and on which branch.
- The result is kept and reused until the diff of the note's file changes, not on every move of
  the default branch.

**What it checks**

| Section | Checked against |
| --- | --- |
| Problem | Still a problem on the default branch and on the note's own branch, not already solved |
| Evidence | The file, line, test or error it names exist and say what the note claims |
| Current situation | What the code at that place does now, read from the code |
| Desired situation | What the code's own types, tests, docs or callers expect; an `Unsure:` from the agent gets an answer when the code settles it |

**What you see in the editor**

| Verdict | Label | Field |
| --- | --- | --- |
| Matches the code | `Checked` | The agent's text, unchanged |
| Wrong or out of date | `Corrected` | Claude's text is put in the field; `Use the agent's text` swaps back |
| The code can't settle it | `Unsure` | The agent's text, with Claude's question under it; you decide |
| Problem gone on the default branch or on the note's own branch | A banner: `Looks solved on main (abc1234): <why>`, with Mark solved (to To verify) and Bin; Create issue is off unless you press `It is not solved` (section 6c) | Unchanged |

- While it runs (usually 10 to 30 seconds), each label says `Checking…` and Create issue says
  `Checking…` and waits.
- After 90 seconds, or when Claude fails, the labels say `Not checked: <reason>`, Create issue
  works again, and a Check again link runs it once more.
- The result is kept in the note. Opening the editor again uses it, unless the code of the note's
  file changed since; then it checks again.
- You can still change any field yourself; a field you edit loses its label.

### Where the issue goes

The box reads the project's `.ai-tooling/config.yml` (or `.claude/project.yml` in a repo the team
sync has not moved yet) from the freshly fetched `origin/<default>`, as the launcher does, when the
editor opens. These keys decide it:

```yaml
tracker:
  kind: github                         # github: Create issue; monday: Copy issue
  repo: acme/shop                      # the repo the issue is created in
  project: { owner: acme, number: 41 } # the board it is put on
  status:
    field: Status                      # the board's column field
    todo: Backlog                      # the column a new issue goes to
labels:
  needs-triage: triage                 # the label it gets
```

| The project has | Repo | Label | Board |
| --- | --- | --- | --- |
| The config, tracker on GitHub, with `project` and `status` | `tracker.repo` | what `labels` maps `needs-triage` to | `tracker.project`, column `tracker.status.todo` |
| The config without `project` or `status` | `tracker.repo` | as above | none; the editor says `no board in the config` |
| The config, tracker on monday or asana | none: Copy issue puts the title and text on the clipboard | | |
| No config | the `origin` repo | none | none |

The editor's target line shows exactly this before you press Create issue, with the repo's
visibility (public or private), so you always see where it lands.

**Create issue then runs three steps**, the same way the team's skills do (ids are read by name
each time, never stored):

1. `gh issue create --repo <repo> --title … --body-file - --label <label>`
2. `gh project item-add <number> --owner <owner> --url <issue url>`
3. `gh project field-list` to find the `Status` field and its `Backlog` option by name, then
   `gh project item-edit` to set it.

Steps 2 and 3 need the `project` scope on your gh login. Without it, or when a step fails, the
issue still exists: the note shows `Filed #812 ↗ · not on the board: <reason>` with an Add to
board button that tries steps 2 and 3 again. For a missing scope the reason says to run
`gh auth refresh -s project`.

### The issue text

The standard for every issue the box files:

```markdown
## Problem
Invoices without a due date crash the PDF export.

## Evidence
A fixture with `dueDate: null` made `exportPdf` throw
`TypeError: Cannot read properties of null (reading 'getTime')`.

https://github.com/acme/shop/blob/abc1234/src/invoices.ts#L40-L44

## Current situation
`formatDate(null)` throws, so the export answers with a 500.

## Desired situation
`formatDate(null)` returns a dash and the export works.

---
Spotted while working on #8504.
```

- The title starts as the note's title.
- The code link is added under Evidence by the box, not typed by the agent. The box looks for
  the note's snippet on the freshly fetched default branch and links those lines at that commit
  (`blob/<sha>/src/invoices.ts#L40-L44`), on a line of its own, which GitHub shows as the code.
  Ticket commits are often not on GitHub yet, so the note's own commit is used only when GitHub has
  it and the snippet is gone from main. When neither works, it is `Where: src/invoices.ts`, without
  a line. No `at`: no link.
- **Secrets and customer data**: before Create, the box scans the title and sections. Known token
  shapes (GitHub, AWS, Slack, OpenAI and Anthropic keys, private key blocks, bearer tokens in
  headers) block Create in any repo until they are gone. Other hits are highlighted and each has
  `Fine to publish`: email addresses (not `@example.com`), home paths like `/Users/<name>`, IP
  addresses (not `127.0.0.1`), long random strings. Commit SHAs, UUIDs and version numbers never
  count. In a public repo Create waits until each other hit is removed or marked fine; in a
  private repo they only show.
- `Spotted while working on #8504.` only when the note knows its ticket (section 8).
- No mention of Claude or agents, as in your commits.
- **Complete issues only**: Create issue stays disabled until the title and all four sections
  have text and the check has finished (or given up), and never while the check says the problem
  is gone (section 6c). A section you emptied says `Fill this in before creating`.
- **Similar issues**: when the editor opens, up to three open issues whose titles match
  (`gh issue list --search`), as links, so you can bin a duplicate instead. A failed search shows
  `Could not look for similar issues` in dim text.
- **Your draft** is kept in the note when you leave a field or close the panel, so nothing is
  lost.
- **Success**: the note shows `Filed #812 ↗` with a Fix in new tab button (Part E), and stays in
  the list until you close the panel or switch to another project; then it moves to the history. **Failure** of step 1: gh's
  message in red under the buttons, and the draft stays.

## 7b. Part E: fixing in a new tab

**Fix in new tab** starts the filed issue as a ticket exactly the way your parallel tickets start:
through `issues launch` of the parallel-tickets skill
(`~/.claude/skills/parallel-tickets/scripts/issues`). So the branch, the worktree and stack (via
hagent and `wt`), the ticket prompt and the record behind `/parallel-tickets status` and `plans`
are all the ticketflow's own. The box builds nothing by hand.

Where it shows:
- on a filed note right after Create issue, and on filed notes in the history;
- only for an issue on GitHub (not monday: ship-issue needs the issue number);
- only when the launcher and its hagent are both there and the launcher knows `--space`, and the
  project's config has a GitHub tracker whose repo is the `origin` repo: ship-issue stops on
  anything else. Without the ticketflow the button is not shown, so the public mod works without
  it.

What one click does:
1. Picks the branch the way parallel-tickets names them: a type and three to five words from the
   title, lowercase, no number: `fix/formatdate-throws-null-date`. The type is `fix`, or `docs`
   or `chore` when the note is about those. `issues branch` checks the name: taken gets `-2`,
   `ci:` or `invalid` gets another name.
2. Runs, in a background terminal of herdr-core in the project's main checkout:

   ```
   issues launch --space <space> --ticket 812 --branch fix/formatdate-throws-null-date
   ```

   `--space` is new, and it has to reach hagent too. Today the launcher reads the space only from
   the label of the app terminal it runs in, which a background terminal does not have; it unsets
   `HERDR_ACTIVE_*`; and its hagent reads the space only from those or that label. So `--space`
   sets `HAGENT_HOST=app` and hands the space to hagent as `HERDR_ACTIVE_WORKSPACE_ID`. Where this
   change is made is the one open question (section 12): the launcher that runs today is the local
   `~/.claude/skills/parallel-tickets` repo, which has no remote, while herdr-ticketflow keeps an
   older copy that its install.sh links over that folder.
3. The launcher fetches origin, bases the branch on the fresh default branch, opens the tab through
   hagent (a worktree, and a stack where the repo has `wt`) and sends the ticket prompt, which
   starts with `/ship-issue 812`.
4. The note shows `Fixing in fix/formatdate-throws-null-date ↗`; a click jumps to that tab.

From there it is your normal ticket flow, with the launcher's defaults: ship-issue verifies the
problem, posts its plan and waits for your go; after the build and review it stops, without a push
or a PR, which you open yourself. The ticket shows in `/parallel-tickets status` and `plans` like
any other, so you can also give your go from there. The box itself never pushes or opens a PR.

| Case | What you see |
| --- | --- |
| Started | `Fixing in fix/… ↗` on the note; the new tab is in the space's tab bar |
| The launcher fails (uncommitted work in the primary checkout, no network, …) | Its last line in red on the note; Fix in new tab stays, to try again |
| A fix already started for this note | `Fixing in fix/… ↗` instead of the button, so it never starts twice |
| The issue gets closed | The note shows `Issue #812 closed` and moves to the history |
| No ticketflow, or a monday tracker | No button |

## 8. Data

**Where**: `~/.suggestion-box/notes/<project folder>/<id>.json`, one file per note.

**The project key** is the repo's `origin`, lowercased, without protocol, user or `.git`. Every
worktree of a repo has the same `origin`, so all of them share one box. A repo without `origin` is
keyed by its main checkout's path.

| origin | Key | Folder |
| --- | --- | --- |
| `git@github.com:Acme/shop.git` | `github.com/acme/shop` | `github.com__acme__shop` |
| `https://github.com/Acme/shop` | `github.com/acme/shop` | `github.com__acme__shop` |
| none, checkout `~/code/scratch` | `local/Users/you/code/scratch` | `local__Users__you__code__scratch` |

**A note**

```json
{
  "id": "20261126-104512-k3f9",
  "number": 7,
  "project": "github.com/acme/shop",
  "title": "formatDate throws on a null date",
  "sections": {
    "problem": "Invoices without a due date crash the PDF export.",
    "evidence": "A fixture with dueDate: null made exportPdf throw TypeError: …",
    "current": "formatDate(null) throws, so the export answers with a 500.",
    "desired": "formatDate(null) returns a dash and the export works."
  },
  "at": { "path": "src/invoices.ts", "line": 42 },
  "from": {
    "branch": "feat/8504-group-records",
    "ticket": 8504,
    "sha": "abc1234",
    "worktree": "/Users/you/.herdr/worktrees/shop/feat-8504-group-records",
    "checkout": "/Users/you/code/shop",
    "terminal": "t7",
    "agent": "claude"
  },
  "spotted": 1,
  "status": "open",
  "draft": null,
  "issue": null,
  "created": "2026-11-26T10:45:12Z",
  "updated": "2026-11-26T10:45:12Z"
}
```

- `check`, once the check ran: `{base, fixed, sections: {<name>: {verdict, text?, question?}}, at}`,
  where `base` is the default branch's commit it checked against, and `text` keeps Claude's
  correction while the field holds the agent's own text after `Use the agent's text`.
- `number`: the note's number in its project, counting up, never reused.
- `solved`, once claimed: `{branch, sha, how, proof, by: "agent" | "you" | "check", at}`.
- `verify`, while in To verify: `{change: [commits], check: {verdict, reason, test, base, at},
  landed: {pr, state, inMain, at}}`. `confirmed`: `{at, proofs}` once you confirm.
- `status`: `open`, `filed`, `binned` or `solved` (confirmed). A note is in To verify while it has
  a `solved` claim without `confirmed`; its status stays what it was (open or filed), so Not solved
  puts it back exactly there. `issue`: `{number, url}` once filed. `draft`:
  `{title, sections}` while you edit. `fix`: `{branch, started}` once Fix in new tab ran.
- `ticket`: the ticket this branch was launched for, from parallel-tickets' records in
  `<git-common-dir>/herdr-parallel-issues/*.json`; else the number in a `<type>/<number>-…`
  branch name; else null. Any other number in a branch name proves nothing (`chore/bump-node-20`).
- `snippet`: the five lines around `at.line` when the note was dropped, used to find them again.
- Next to the notes: `numbers/` (one empty file per number taken) and `events/<note id>/` (repeats
  and claims, each its own file). The box folds events into the note and removes them.
- `~/.suggestion-box/settings.json`: `{ "collecting": true, "off": ["github.com/acme/shop"] }`,
  written only by the box; the command reads it on every drop.
- `terminal`: `HC_TERMINAL_ID`, set in the Herdr app's terminals. `agent`: `claude` when
  `CLAUDECODE` is set, else null.
- Only the box rewrites a note, with compare-and-swap: when the file changed in the meantime, it
  reads it again instead of overwriting.
- Filed, solved and binned notes are cut down to a tombstone 30 days after their last change: the
  number, the normalised title, the file, the final state and the issue. Tombstones stay, so a
  binned note never comes back as new and a number is never reused.

## 9. Install and uninstall

`./install.sh`, rerunnable like parrot's; every file it changes is kept beside it first:

1. Links the mod to `~/.config/herdr-app/mods/suggestion-box`.
2. Adds to your layout (`layout.jq`; a copy for Herdr's own layouts, as parrot does): the button
   at the end of the tab bar, after Quarterdeck's, and the panel as a hidden 400 px column on the
   right, next to Quarterdeck's and Chartroom's.
3. Binds `cmd-alt-s` to `layout.toggle:suggestion-box` in `keys.json` when it is free.
4. Links `bin/suggest` to `~/.local/bin/suggest`.
5. Adds the `SessionStart` hook (`suggest session-start`) to `~/.claude/settings.json`.
6. Adds `Bash(suggest:*)` to `~/.claude/settings.json`.
7. Runs `herdr-app check` on the mod.

`./uninstall.sh` undoes each step. It keeps the notes and the settings in `~/.suggestion-box`
unless you pass `--purge`.

**Code layout**: logic both sides need (project key, note shape, the same-note check, ticket from
branch, the issue text) sits in pure modules in `mods/suggestion-box/` with no Herdr imports. The
command imports them from there, because a mod can't import from outside its folder. Tests run
with `bun test`, like parrot.

## 10. Build order

Each PR is one version, reviewed and merged before the next starts.

### How each PR is built

The folder is not a git repo yet. On your go for PR 1, it becomes one: `git init`, with this plan
and the sketch as the first commit on `main`, then PR 1's branch.

The way you work, for every PR below:
- Each PR is built in its own worktree, opened as a ticket tab through hagent. The linked checkout
  that every agent's `suggest` and the live mod run from stays on `main`, so half-done code never
  reaches them.
- Its plan is posted first in your format (`Single PR: [title] — [files] — ~[lines]`) and waits
  for your "go", even though this plan lists it already.
- The branch (`feat/…`, `docs/…`) is made before the first edit; nothing is edited on `main`.
- Several logical commits, each with its own conventional-commit message; no Claude in them and no
  `Co-Authored-By`.
- Before the report: `bun test`, `herdr-app check` on the mod, and a local review (`/code-review`)
  whose real findings are fixed.
- Then a report, and stop. Nothing is pushed and no PR is opened without your ok for that one push
  or PR. Bringing a branch up to date is a rebase onto `origin/main`; its force-push needs its own
  ok.
- Merges, tags (`vX.Y.Z`, the number only in `package.json`) and GitHub releases happen on your ok,
  as with parrot. CHANGELOG.md follows Keep a Changelog.
- The installed mod runs from this checkout through a link, as parrot's does, so the checkout goes
  back to `main` after each merge and `./install.sh` runs again to load it.

Tests and live checks:
- PR 2 starts with a short spike on a throwaway branch, as parrot's did, to prove what the mod API
  does not promise: writing and watching `~/.suggestion-box` from the mod (`writeTextFile` or
  `exec`; `watchFolder` on a folder the box makes first), `exec` with a 90-second timeout, render
  running again when `layout()` changes (for the one-panel rule), and the button's icon: icons
  reached through the install link do not draw, as Quarterdeck found, so it uses one of Herdr's
  own (`mods/workspace-chrome/…`) unless the spike shows otherwise.
- PR 3 starts by checking that the check's `claude -p` call loads none of your CLAUDE.md, so no
  chat style reaches an issue.
- Tests never touch your real setup: install and uninstall tests run with a temporary `HOME` and
  `HERDR_APP_HOME`; `claude`, `gh`, `hagent` and the launcher are stand-ins. No test files a real
  issue, opens a tab or calls Claude.
- Live checks use this tool's own repo (with a test board of your own) and the safepath project,
  never a work repo. A live check before a merge runs `./install.sh` from the PR's worktree, so the
  link points there for the check, and runs it again from `main` right after. The instructions are tried in safepath first; `./install.sh` on your machine
  runs only on your ok, because it changes what every agent does from then on.
- A live check in the Herdr app is announced before it starts, makes sure the app is in front, and
  never changes zoom or appearance.
- What agents and the check write for an issue is plain English: the instructions ask for it, and the
  check runs without your CLAUDE.md, so no pirate talk reaches the team.
- Examples in code, tests and docs use made-up projects (`acme/shop`), so the repo can be public.
- README screenshots come from live data, light and dark through `<picture>`, with text under each.

### PR 1 (0.1.0): feat: drop notes with the suggest command

Files: `bin/suggest`, `mods/suggestion-box/{notes,project,events}.js`, `install.sh`, `uninstall.sh`,
`tests/`, `README.md`, `package.json`, `CHANGELOG.md` · ~730 lines

Done when:
- [ ] A drop with a title, `at` and the four sections in a repo writes one note and prints its
      number and the open count.
- [ ] Text comes on stdin as `key: value` lines; backticks, quotes and `$` in it arrive unchanged;
      the same fields work as flags.
- [ ] A drop with a section missing or empty is refused and names the missing fields.
- [ ] A note that matches a binned or filed one only counts, and says so.
- [ ] Twenty drops started at once give twenty notes with twenty different numbers; the command
      only ever creates files (notes, numbers, events), never rewrites one.
- [ ] The ticket comes from parallel-tickets' record for the branch, else a `<type>/<n>-` name,
      else none.
- [ ] The same note twice gives one note with `spotted: 2`; the first note's sections stay.
- [ ] Outside git, a long title, a title on several lines or a section over 500 characters are
      refused with the messages in section 4.
- [ ] A worktree and the main checkout of one repo land in the same box.
- [ ] `suggest list` prints the project's open notes with their numbers.
- [ ] With collecting off in `settings.json` (for all, or this project), a drop answers calmly,
      exits 0 and writes nothing; `suggest list` and `suggest solved` still work; no subcommand
      changes the setting.
- [ ] A repeat drop of a note confirmed solved reopens it; of one in To verify, filed or binned,
      only counts.
- [ ] `suggest solved <n>` with `how` and `proof` claims an open or filed note of this project
      solved with the branch, commit, how and proof; a missing `how` or `proof`, an unknown number,
      or a binned, claimed or solved note is refused.
- [ ] `install.sh` links the command and adds the `SessionStart` hook and the permission rule to
      `settings.json`, with a backup; running it again changes nothing; `uninstall.sh` takes out
      exactly those.
- [ ] `suggest session-start` prints the instructions in a git repo with collecting on, and
      nothing outside git or with collecting off (for all, or this project); it runs on start,
      `/clear` and compaction.
- [ ] Live: a new session with collecting off never runs `suggest` and never mentions the box; a
      subagent of a session with collecting on does not get the instructions (or, if it does,
      the instructions keep it out).
- [ ] `bun test` is green.
- [ ] Live: a Claude session in a real ticket worktree drops a note with all four sections,
      without a permission prompt.

Not yet: anything in the Herdr app. Agents start filling boxes right away, so PR 2 is designed
against real notes.

### PR 2 (0.2.0): feat: the box as a panel, with its button in the tab bar

Files: `mods/suggestion-box/{main,button,panel,store}.js`, `mod.json`, `box.svg`, `layout.jq`,
`unlayout.jq`, `keys.json`, install and uninstall steps, `tests/` · ~760 lines

Done when:
- [ ] The button sits after Quarterdeck's and shows the focused project's open count.
- [ ] A drop shows within a second or two: the button wiggles once with the panel closed; with
      the panel open the note appears at the top, lit up for a moment.
- [ ] The button is dim outside a git repo and on another machine.
- [ ] Switching spaces switches the box.
- [ ] Click and `cmd-alt-s` open and close the panel, a full-height 400 px column on the right;
      whichever right-hand panel opened last stays, whatever key or button opened it (Quarterdeck,
      Chartroom, Files and Changes, the box).
- [ ] The keyboard works as in section 6 once the panel has it.
- [ ] Notes newest first; the four sections open on click; the file opens in Cursor at its line;
      `#8504` jumps to its tab or opens the ticket.
- [ ] Bin with a 5-second Undo; the history with Restore.
- [ ] A note whose mapped lines changed on its branch or on main since the drop shows the
      `changed on …` chip (or `file removed`) and Mark solved; renames and rebases are followed.
- [ ] Claimed notes sit in To verify above the open notes with Confirm solved and Not solved;
      confirmed ones go to the history and can be reopened. (The three proofs come in PR 5.)
- [ ] The header's `Collecting` switch turns drops off and on for the focused project, the ⚙
      switch for all projects; the button's icon gets its slash while off.
- [ ] The list groups To verify, Open and Just filed with their counts; the header shows the
      summary; the button shows the open count and a green `✓n` for notes to verify.
- [ ] A note that leaves a group by itself shows the one-line notice.
- [ ] Each state shows exactly the actions of the table in section 6c, and the store refuses any
      other, also a click that races an agent's claim; tests cover every row.
- [ ] `herdr-app check` passes and `bun test` is green.

### PR 3 (0.3.0): feat: check a note against the code

Files: `mods/suggestion-box/{check,claude,snapshot}.js`, `main.js`, `tests/` · ~420 lines

Starts by proving that the check's `claude -p` call loads none of your CLAUDE.md.

Done when:
- [ ] Check, on an open note, fetches, exports the two snapshots and runs your own Claude there with
      Read, Grep and Glob only; the snapshots are removed afterwards.
- [ ] Each section shows `Checking…`, then `Checked`, `Corrected` (Claude's text, with
      `Use the agent's text` to swap back) or `Unsure` (with Claude's question).
- [ ] A problem already gone on the default branch or on the note's own branch shows the
      `Looks solved` banner with Mark solved and Bin.
- [ ] After 90 seconds or a failure the labels say `Not checked`, with Check again.
- [ ] The result is kept in the note and reused until the diff of the note's file changes.
- [ ] `bun test` covers the prompt, reading Claude's JSON answer (with a stand-in for `claude`),
      the timeout and the reuse rule.
- [ ] Live: in this tool's own repo, a note with a wrong Current situation comes back
      `Corrected`, and one about code fixed since comes back with the banner.

Filing comes next, so every issue that is ever filed has been checked.

### PR 4 (0.4.0): feat: file a checked note as a GitHub issue

Files: `mods/suggestion-box/{draft,issue,tracker,board,scan}.js`, `main.js`, `tests/` · ~680 lines

Done when:
- [ ] File issue runs the check (PR 3) and opens the editor with the title and the four checked
      sections; Create issue waits for the check; the draft survives
      closing the panel.
- [ ] Create issue stays disabled until the title and all four sections have text, and the line
      under the buttons always names why it is off.
- [ ] While the check says the problem is gone, Create issue is off until you press
      `It is not solved`; an agent's claim while the editor is open closes it, keeps the draft and
      moves the note to To verify.
- [ ] A field you edit yourself loses its check label.
- [ ] The issue text follows section 7 exactly: the four headings in order, the code link under
      Evidence, the ticket line at the end.
- [ ] Repo, label, board and column come from the project's config as in the table of section 7;
      the editor's target line shows them before you create.
- [ ] A created issue is on the board in the `todo` column; without the `project` scope or on a
      failed board step, the issue stays, the note says why, and Add to board tries again.
- [ ] Up to three similar open issues show as links.
- [ ] A filed note solved later shows `solved on <branch>` with the `Closes #n` hint and its Copy
      button, and no Fix in new tab.
- [ ] Create issue files it; the note shows `Filed #n ↗` and stays until the panel closes or you
      switch project, then moves to the history; a failure shows gh's message and keeps the draft.
- [ ] The scan highlights tokens, emails, home paths and IP addresses; in a public repo Create
      waits until they are gone.
- [ ] The code link points at the snippet found on the fresh default branch, else at the note's
      commit when GitHub has it, else at the file without a line.
- [ ] `bun test` covers the issue text, reading the config, the target for each row of the table,
      and the link choice.
- [ ] Live: one note filed in this tool's own repo (with a test board of your own), never in a
      work repo: GitHub shows the code under Evidence and the issue sits in the board's first
      column.

### PR 5 (0.5.0): feat: prove a solved note before it leaves the box

Files: `mods/suggestion-box/{verify,diff,landed}.js`, `main.js`, `tests/` · ~420 lines

Done when:
- [ ] Opening a note in To verify shows who claimed it, the how, the named proof and the three
      proofs of section 6b, each with its state.
- [ ] The change: the commits since the drop whose diff touches the note's mapped lines, with that
      diff inline in red and green; Open in Cursor at the solving commit.
- [ ] The independent check: a fresh read-only Sonnet session answers Verified, Partly or Not
      fixed with its reason and whether the named test asserts the fix; it runs again only when
      the file's diff changed.
- [ ] Landed: a merged PR counts first, whatever the merge style; else the solving commit in the
      fresh default branch, else the same patch there (`git cherry`).
- [ ] Confirm solved and Not solved work as in section 6b; a confirmed note is watched until it
      lands, and comes back with `the fix never landed` only when its PR closes unmerged or its
      branch is gone with no merged PR and no same patch in main.
- [ ] Not solved puts a filed note back as filed, never as open.
- [ ] `bun test` covers mapping lines through diffs (moves, renames, deletes, a rebase), the landed
      rules (merge, squash, rebase, closed unmerged), and the check's answer, with stand-ins.
- [ ] Live: in this tool's own repo, a note solved on a branch shows its diff, gets Verified, shows
      `waiting to land`, and `landed in main` after the merge.

### PR 6 (0.6.0): feat: fix a filed issue in a new tab

Needs first: `issues launch --space`, handing the space to hagent; where it goes is question 7.

Files: `mods/suggestion-box/{fix,background}.js`, `main.js`, `tests/` · ~250 lines

Done when:
- [ ] Fix in new tab shows on filed GitHub issues only, and only when the launcher is there and
      hagent knows the repo.
- [ ] One click runs `issues launch --ticket <n> --branch <b>` in a background terminal from the
      main checkout, with the space passed on.
- [ ] The note shows `Fixing in <branch> ↗`, which jumps to the tab; a second start for the same
      note is not offered.
- [ ] A failing launch shows its last line on the note and opens nothing.
- [ ] `bun test` covers the branch name from a title and the launch arguments, with a stand-in
      launcher.
- [ ] Live: a note filed in this tool's own repo opens as a tab where Claude posts the ship-issue
      plan and waits for go, and the ticket shows in `/parallel-tickets status`.

### PR 7 (1.0.0): docs: README with screenshots

Files: `README.md`, `docs/screenshots/`, `CHANGELOG.md` · ~100 lines

Done when:
- [ ] Light and dark screenshots of the button, the panel, the editor with its check labels, a
      note in To verify with its three proofs, and a fix starting, with text under each.
- [ ] Tag `v1.0.0` and a GitHub release, on your ok.

## 11. Not in v1

- Spaces on another machine: notes dropped there stay there; the button is dim there.
- Board fields other than the column (priority, iteration, assignee).
- Filing to monday or asana (Copy issue only).
- Following a repo's own issue template (`.github/ISSUE_TEMPLATE`) instead of the standard one.
- A Sharpen button where your own Claude rewrites a whole issue from scratch (the check only
  corrects what is wrong).
- Codex and other agents (their `AGENTS.md`), and a count in the Quarterdeck.
- Dropping a note by hand from the box (`suggest` in a terminal works meanwhile).

## 12. Questions

Settled on 2026-11-26; the user took the defaults (also in section 2):

1. Key: `cmd-alt-s`.
2. Agents list the notes they dropped and claimed solved in their final report.
3. A public repo, `PieterLuypaert/suggestion-box`, created when PR 1 is ready; that push waits
   for the user's ok at that moment.
4. Fix in new tab uses the launcher's default: a full stack in repos with `wt`.
5. After Fix in new tab the box stays; `Fixing in …` jumps to the tab.
6. One right-hand panel at a time.

Open, from the second review:

7. Where does the launcher's `--space` change go? Recommended: a local commit in
   `~/.claude/skills/parallel-tickets`, the launcher that runs today (it has no remote, so no PR),
   and later the same change in herdr-ticketflow's copy when that one catches up. Only PR 6
   needs it.

Nothing is built yet: PR 1 starts only on the user's "go".

## 13. Review

An independent review of plan 9 against the real code found these; each is handled above.

| # | Finding | Where it is handled |
| --- | --- | --- |
| 1 | Fix in new tab could not find its space: the launcher reads it only from the app terminal's label | `issues launch --space`, a small PR in herdr-ticketflow before PR 6; the gate is the launcher's own dry run |
| 2 | Box plus Quarterdeck leave about 460 px on a 1512-pt laptop; all three about 4 px | One right-hand panel at a time |
| 3 | Backticks in double-quoted arguments run as shell commands | Text on stdin in a quoted heredoc |
| 4 | Ticket numbers from branch digits are mostly wrong (parallel-tickets branches carry no number) | parallel-tickets' records first, then only the `<type>/<n>-` shape |
| 5 | Two drops at once could get the same number; an agent's write could undo a filing | Counter file, a lock both sides take, temp file and rename |
| 6 | Binned or filed notes came back as new ones | The same-note check covers every state the box keeps |
| 7 | A global block reaches subagents, reviewers and read-only tasks | Main session only; `suggest list` first; never file yourself |
| 8 | The check read a working tree that may be stale, dirty or on another branch | Fetch first; read through revisions only; the worktree's diff passed in |
| 9 | Line numbers drift between the drop and filing | A five-line snippet, found again on the fresh default branch |
| 10 | Secrets or customer data could reach a public issue | Visibility in the target line; a scan; Create waits in public repos; agents told to redact |
| 11 | Mod writes outside `~/.config/herdr-app`, the 30-second exec default and a watch on a missing folder are unproven | A spike at the start of PR 2 |
| 12 | The linked checkout is live for every agent and the mod | Each PR in its own hagent worktree; the checkout stays on `main` |
| 13 | Smaller: a contradiction about filed notes, `pr.link_keyword`, asana, branch types | Fixed in sections 6b, 7, 7b and the PRs |
| 14 | Found by you: a note the check found solved could still be filed | Section 6c: a fixed set of actions per state; Create issue is off while the check says the problem is gone |

A second independent review of plan 10, also checked against the code, found these; each is
handled above:

| # | Finding | Where it is handled |
| --- | --- | --- |
| 15 | Fix in new tab: the launcher lives in a local repo without a remote; `--space` must also reach hagent; the dry run does not check hagent; ship-issue needs a GitHub tracker on the origin repo | Section 7b: the space handed to hagent, a stricter gate, question 7 |
| 16 | The landed proof fails on squash and rebase merges | A merged PR counts first; `git cherry` as the fallback |
| 17 | `git log -L` cannot tell what changed since the drop | Lines mapped forward through `git diff -U0 -M`, anchored on the snippet |
| 18 | The lock and compare-and-swap disagreed; a stale lock could be broken twice | The command never rewrites: new files and event files with exclusive create; only the box rewrites |
| 19 | Nothing triggered one panel at a time: the panel keys are bare toggles | The box's button watches the layout; whichever panel opened last stays |
| 20 | A filed note that got claimed had no clear state; Not solved could file it twice | To verify means an unconfirmed claim; the state underneath does not change |
| 21 | The secret scan could block Create forever | Only known token shapes block; other hits can be marked fine one by one |
| 22 | The check was not read-only: `git grep -O` runs a program, `--output` writes a file | Snapshots via `git archive`; only Read, Grep and Glob |
| 23 | Smaller: heredoc against the permission rule, tombstones, snippet search, optional config keys, a second Claude call, live checks before a merge, a closed issue, the button's icon | Sections 4, 6b, 7, 8, 10, and the PR notes below |
| 24 | Found by you: with collecting off, agents still knew about the box, because a CLAUDE.md block is always read | The instructions come from a session-start hook, only while collecting is on: off works as if the mod was not installed |

Settle during the PRs: the live drop in PR 1 includes backticks, `$(…)` and quotes (your settings
run in auto mode); the snippet search normalises whitespace and takes the unique match nearest the
old line; a missing `tracker.status.todo` means no column is set, and a label the repo lacks is
named in the target line and left off; PR 6 still needs question 7 answered.

Checked and fine: `cmd-alt-s` is free, the config keys exist in the team's schema, and parrot
already keeps clear of any panel on the right, so it needs no change.
