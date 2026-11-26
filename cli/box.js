#!/usr/bin/env node
// The box's own side, run by the Herdr mod: reading a project's notes for the panel, the user's
// actions on them, the collecting switches, and turning old notes into tombstones. Only this side
// rewrites a note; the suggest command only ever creates files. It is not on the PATH and not
// under the agents' permission rule: agents never run it. Every answer is one line of JSON.
//
//   node cli/box.js read <folder> [--changes]
//   node cli/box.js act <folder> <note id> <action> [--branch b] [--sha s] [--reason r]
//   node cli/box.js check <folder> <note id> [--again]
//   node cli/box.js target <folder> <note id>
//   node cli/box.js draft <folder> <note id> <{"title","sections","fine","notGone"} as JSON, or null>
//   node cli/box.js file <folder> <note id> <{"title","sections","fine","notGone","repo"} as JSON>
//   node cli/box.js board <folder> <note id>
//   node cli/box.js proofs <folder> <note id>
//   node cli/box.js verify <folder> <note id> [--again]
//   node cli/box.js watch <folder>
//   node cli/box.js show <folder> <sha> <path> [line]
//   node cli/box.js fix <folder> <note id> <space id>
//   node cli/box.js collecting <folder> on|off [--all | --key <project key>]
//   node cli/box.js projects <folder> [<space folder>...]
//   node cli/box.js prune <folder>
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fold, stateOf } from "../mods/suggestion-box/events.js";
import { age } from "../mods/suggestion-box/notes.js";
import { projectFolder, projectKey, projectName } from "../mods/suggestion-box/project.js";
import { stillHolds } from "../mods/suggestion-box/check.js";
import { ACTS, allows, applyAction, buttonsFor, isWatched, recordFix, recordIssue, recordIssueState, recordLanded, startFix, withStaleFix } from "../mods/suggestion-box/rules.js";
import { freeBranch, gateFor, launchFix } from "./fix.js";
import { verifyHolds } from "../mods/suggestion-box/proofs.js";
import { changeProof, fileAt, landedProof, runVerify } from "./proofs.js";
import { fetch } from "./claude.js";
import { fillProblem, isPublicTarget, scanTexts } from "../mods/suggestion-box/editor.js";
import { githubRepo, issueText } from "../mods/suggestion-box/issue.js";
import { scanBlock } from "../mods/suggestion-box/scan.js";
import { runCheck, stopRunning } from "./check.js";
import { addToBoard, boardsOf, codeLinkFor, createIssue, gh, issueSince, similarIssues, targetFor } from "./file.js";
import { changeFor, defaultRef } from "./changes.js";
import { repoAt, ticketRecords } from "./git.js";
import { boxRoot, collecting, readSettings } from "./store.js";

const DAY = 86400000;
const KEEP_DAYS = 30;

export async function run(args, env = process.env, now = new Date()) {
  const [command, folder, ...rest] = args;
  const project = projectAt(folder, env);
  if (command === "read") return read(project, rest.includes("--changes"), now, env);
  if (command === "projects") return projects(project, rest, env);
  if (!project.dir) return { error: project.why };
  if (command === "act") return act(project, rest, now, env);
  if (command === "check") return check(project, rest[0], env, now, rest.includes("--again"));
  if (command === "target") return target(project, rest[0], env);
  if (command === "draft") return draft(project, rest[0], rest[1], now);
  if (command === "file") return file(project, rest[0], rest[1], env, now);
  if (command === "board") return board(project, rest[0], env, now);
  if (command === "proofs") return proofs(project, rest[0], env);
  if (command === "verify") return verify(project, rest[0], env, now, rest.includes("--again"));
  if (command === "watch") return watch(project, env, now);
  if (command === "show") return fileAt(project.repo.top, rest[0], rest[1], Number(rest[2]) || null);
  if (command === "fix") return fix(project, rest[0], rest[1], env, now);
  if (command === "collecting") return switchCollecting(project, rest, env);
  if (command === "prune") return prune(project, now);
  return { error: `unknown command ${command}` };
}

// The project around a folder, or { why } outside a git repo.
function projectAt(folder, env) {
  const repo = folder ? repoAt(folder) : null;
  if (!repo) return { why: "no git repo here" };
  const key = projectKey(repo.origin, repo.checkout);
  const root = boxRoot(env);
  return { repo, key, name: projectName(key), root, dir: join(root, "notes", projectFolder(key)) };
}

function read(project, withChanges, now, env) {
  if (!project.dir) return { project: null, why: project.why };
  // Only the notes folder is made: a project's own folder appears with its first note, so reading
  // a repo that never had one leaves nothing behind. The box watches the notes folder until then.
  mkdirSync(join(project.root, "notes"), { recursive: true });
  const settings = readSettings(project.root);
  const mainRef = withChanges ? defaultRef(project.repo.top) : null;
  const notes = existsSync(project.dir) ? notesOf(project.dir) : [];
  // Whether the launcher can start a fix here, and the tickets it started, matter only once a note is filed.
  const hasFiled = notes.some((note) => stateOf(note) === "filed");
  const fixing = hasFiled ? gateFor(project.repo.top, project.key, env) : null;
  const tickets = hasFiled ? ticketRecords(project.repo.common) : [];
  const views = notes.map((note) => describe(project, withTicket(withStaleFix(note, now.toISOString()), tickets), withChanges, mainRef, now, fixing));
  // A filed note is history; the panel keeps the ones it just filed in sight until it closes.
  const live = views.filter((v) => ["open", "to verify"].includes(v.state));
  // A fix still watched stays in sight, however long it waits to land.
  const recent = views.filter((v) => !live.includes(v) && (now - Date.parse(v.updated) < KEEP_DAYS * DAY || isWatched(v)));
  return {
    project: { key: project.key, name: project.name, dir: project.dir, exists: existsSync(project.dir), notes: join(project.root, "notes"), top: project.repo.top, checkout: project.repo.checkout, origin: project.repo.origin },
    collecting: { all: settings.collecting !== false, project: collecting(settings, project.key) },
    fixing,
    notes: live.sort((a, b) => b.number - a.number),
    history: recent.sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated)),
    counts: { open: views.filter((v) => v.state === "open").length, toVerify: views.filter((v) => v.state === "to verify").length },
  };
}

// A filed note whose issue already has a ticket from the parallel-tickets launcher, however it was
// started (Fix in new tab, /parallel-tickets, hagent by hand): that ticket is its fix, so it is shown
// and never started a second time.
function withTicket(note, tickets) {
  if (note.fix?.branch || note.status !== "filed" || !note.issue?.number) return note;
  const record = tickets.find((one) => Number(one.ticket) === Number(note.issue.number) && (!one.repo || !note.issue.repo || String(one.repo).toLowerCase() === String(note.issue.repo).toLowerCase()));
  if (!record?.branch) return note;
  return { ...note, fix: { branch: record.branch, tab: record.tab ?? null, pane: record.pane ?? null, space: record.workspace ?? null, byLauncher: true } };
}

// Fix in new tab only where the launcher can start it, and for an issue in this very repo.
function describe(project, note, withChanges, mainRef, now, fixing) {
  const view = { ...note, state: stateOf(note), age: age(note.created, now.getTime()) };
  if (withChanges && view.state === "open") view.changed = changeFor(project.repo.top, note, mainRef);
  const canFix = fixing?.can && String(note.issue?.repo ?? "").toLowerCase() === githubRepo(project.key);
  view.actions = buttonsFor(view).filter((action) => action !== "fix" || canFix);
  return view;
}

// Every note with a file, its events folded in, each with the names of the event files it holds.
function notesOf(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => loadNote(dir, name.slice(0, -5)))
    .filter(Boolean)
    .map(({ note, events }) => ({ ...fold(note, events.map((e) => e.event)), eventFiles: events.map((e) => e.file) }));
}

function loadNote(dir, id) {
  const file = join(dir, `${id}.json`);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  return { note: JSON.parse(text), text, events: eventsOf(dir, id) };
}

function eventsOf(dir, id) {
  const folder = join(dir, "events", id);
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ file: join(folder, name), event: JSON.parse(readFileSync(join(folder, name), "utf8")) }));
}

// One of the user's actions: the note with its events folded in, the action applied, written over
// the note at once, then the folded event files removed. An event that arrives meanwhile stays.
function act(project, rest, now, env) {
  const [id, action, ...options] = rest;
  if (!ACTS.includes(action) || action === "file") return { error: `${action} is not something the box does here` };
  const details = flags(options);
  // Confirm keeps the proofs as they stand: the change and whether it landed, as last fetched.
  if (action === "confirm") {
    const loaded = loadNote(project.dir, id);
    const view = loaded && fold(loaded.note, loaded.events.map((e) => e.event));
    if (view?.solved) details.proofs = keptProofs(project, view, env);
  }
  const result = update(project, id, ({ view }) => applyAction(view, action, now.toISOString(), details), { foldEvents: true });
  return result.error ? result : { ok: true, state: stateOf(result.note) };
}

// The check of an open note, kept on the note. A note that is no longer open when the check ends
// (binned, claimed, gone) keeps that, and the check is dropped.
async function check(project, id, env, now, again) {
  const loaded = loadNote(project.dir, id);
  if (!loaded) return { error: `there is no note ${id}` };
  const view = fold(loaded.note, loaded.events.map((e) => e.event));
  if (!allows(view, "check")) return { error: `note ${view.number} is ${stateOf(view)}; only an open note is checked` };
  const result = await runCheck({ top: project.repo.top, note: view, env, now, stillHolds, again });
  if (result.reused) return { ok: true, reused: true };
  const written = update(project, id, ({ note, view: fresh }) => (allows(fresh, "check") ? { note: { ...note, check: result.check, updated: now.toISOString() } } : { skip: true }));
  if (written.error) return written;
  return written.skipped ? { ok: true, dropped: true } : { ok: true, check: result.check };
}

// For the editor: where the issue goes, similar open issues (null when gh could not look), and
// the code link under Evidence.
function target(project, id, env) {
  const loaded = loadNote(project.dir, id);
  if (!loaded) return { error: `there is no note ${id}` };
  const note = fold(loaded.note, loaded.events.map((e) => e.event));
  const where = targetFor(project.repo.top, project.key, env);
  return {
    ok: true,
    target: where,
    similar: where.kind === "github" && !where.why ? similarIssues(where.repo, note.title, env) : [],
    link: where.codeRepo ? codeLinkFor(project.repo.top, note, where.codeRepo, env) : null,
  };
}

// What the person typed in the editor, kept on the note so closing the panel loses nothing. null
// drops the draft.
function draft(project, id, text, now) {
  const value = JSON.parse(text ?? "null");
  const kept = value ? { title: value.title, sections: value.sections, fine: value.fine ?? [], notGone: value.notGone ?? null } : null;
  const result = update(project, id, ({ note }) => ({ note: { ...note, draft: kept, updated: now.toISOString() } }));
  return result.error ? result : { ok: true };
}

// Files the note as an issue, under the rules the editor shows (editor.js): an open note, a check
// that finished and does not say the problem is gone (unless the person said it is not solved),
// the target the editor showed, every field filled in, no token, and in a repo that is not
// private nothing sensitive left unmarked. Then the board, and the note records the issue.
//
// Filing never makes the same issue twice: the note says a filing started before gh is asked, so a
// filing cut off after gh created the issue (the panel gave up, the note could not be written) is
// found again by its title the next time, and recorded instead of created anew.
function file(project, id, text, env, now) {
  const loaded = loadNote(project.dir, id);
  if (!loaded) return { error: `there is no note ${id}` };
  const view = fold(loaded.note, loaded.events.map((e) => e.event));
  const value = JSON.parse(text ?? "{}");
  const title = String(value.title ?? "").trim();
  const where = targetFor(project.repo.top, project.key, env);
  const why = refuseFiling(view, value, where);
  if (why) return { error: why };
  let issue = view.filing ? issueSince(where.repo, title, view.filing.at, env) : null;
  if (!issue) {
    const started = update(project, id, ({ note }) => ({ note: { ...note, filing: { at: note.filing?.at ?? now.toISOString(), repo: where.repo } } }));
    if (started.error) return started;
    const link = where.codeRepo ? codeLinkFor(project.repo.top, view, where.codeRepo, env) : null;
    const body = issueText({ sections: value.sections }, { link, ticket: view.from?.ticket ?? null });
    issue = createIssue({ repo: where.repo, title, body, label: where.labelMissing ? null : where.label }, env);
    if (issue.error) return { error: `gh could not create the issue: ${issue.error}` };
  }
  const board = where.board ? addToBoard(where.board, issue.url, env) : null;
  // Where it is now, as GitHub says: also a board that adds new issues itself. The watch asks again.
  const boards = boardsOf(where.repo, issue.number, env);
  const ref = where.repo.toLowerCase() === githubRepo(project.key) ? `#${issue.number}` : `${where.repo}#${issue.number}`;
  const details = { issue: { ...issue, boards }, repo: where.repo, closes: `${where.linkKeyword} ${ref}`, title, sections: value.sections, notGone: value.notGone ?? null, board };
  return { ok: true, issue, board, ...record(project, id, now, details) };
}

// The issue exists: the note records it. When that fails, the filing marker stays, so Create
// issue finds this issue again instead of making another.
function record(project, id, now, details) {
  try {
    const written = update(project, id, ({ view: fresh }) => ({ note: recordIssue(fresh, now.toISOString(), details) }), { foldEvents: true });
    if (!written.error) return {};
    return { warning: `#${details.issue.number} exists, but the note could not record it: ${written.error}` };
  } catch (error) {
    return { warning: `#${details.issue.number} exists, but the note could not record it: ${error.message}. Create issue finds it again.` };
  }
}

function refuseFiling(view, value, where) {
  if (!allows(view, "file")) return `note ${view.number} is ${stateOf(view)}; only an open note is filed`;
  if (!view.check) return "check the note first";
  if (where.kind !== "github" || where.why) return where.why;
  if (String(value.repo ?? "").toLowerCase() !== where.repo.toLowerCase()) return `the project's config now files in ${where.repo}; open the editor again to see it`;
  if (view.check.gone && !value.notGone) return "the check says the problem is gone; say it is not solved to file it anyway";
  const texts = { title: value.title, sections: value.sections };
  return fillProblem(texts) ?? scanBlock(scanTexts(texts), { isPublic: isPublicTarget(where), fine: value.fine ?? [] });
}

// The board step again, for a filed note it failed on.
function board(project, id, env, now) {
  const loaded = loadNote(project.dir, id);
  if (!loaded?.note.issue) return { error: `note ${id} has no issue` };
  const where = targetFor(project.repo.top, project.key, env);
  if (!where.board) return { error: "this project's config names no board" };
  const placed = addToBoard(where.board, loaded.note.issue.url, env);
  update(project, id, ({ note }) => ({ note: { ...note, board: placed, updated: now.toISOString() } }));
  return placed.error ? { error: placed.error } : { ok: true };
}

// Writes a note over itself with what `change` makes of it: `change({ note, view })` gets the note
// as on disk and with its events folded in, and returns { note } to write, { skip } or { error }.
// When something else wrote the note in between (a check finishing, a draft), it reads it again and
// asks once more. With foldEvents the written note holds the events, so their files go.
function update(project, id, change, { foldEvents = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    const loaded = loadNote(project.dir, id);
    if (!loaded) return { error: `there is no note ${id}` };
    const result = change({ note: loaded.note, view: fold(loaded.note, loaded.events.map((e) => e.event)) });
    if (result.error) return { error: result.error };
    if (result.skip) return { ok: true, skipped: true };
    try {
      writeOver(join(project.dir, `${id}.json`), loaded.text, result.note);
    } catch (error) {
      if (attempt < 5 && error.message.startsWith("the note changed")) continue;
      throw error;
    }
    if (foldEvents) for (const { file: event } of loaded.events) rmSync(event, { force: true });
    return { ok: true, note: result.note };
  }
}

// Proofs 1 and 3 of a claim, after a fetch: the change and whether it landed. Not kept: git and gh
// say it anew each time the panel shows the project.
function proofs(project, id, env) {
  const loaded = loadNote(project.dir, id);
  if (!loaded) return { error: `there is no note ${id}` };
  const view = fold(loaded.note, loaded.events.map((e) => e.event));
  if (!view.solved) return { error: `note ${view.number} has no claim` };
  const fetched = fetch(project.repo.top);
  return { ok: true, fetched, ...proofsOf(project, view, env) };
}

// The proofs Confirm keeps, or null when they could not be found: Confirm never fails over them.
function keptProofs(project, view, env) {
  try {
    return proofsOf(project, view, env);
  } catch (error) {
    process.stderr.write(`box.js: kept no proofs for note ${view.number}: ${error.message}\n`);
    return null;
  }
}

function proofsOf(project, view, env) {
  const top = project.repo.top;
  const mainRef = defaultRef(top);
  const change = changeProof(top, view, view.solved, mainRef);
  const landed = landedProof(top, project.key, view.solved, change, env, { mainRef, since: view.created });
  const commits = (change.commits ?? []).map(({ sha, subject }) => ({ sha, subject }));
  return { change, landed, verify: view.verify ?? null, commits };
}

// Proof 2, kept on the note: the independent check of a claim waiting to be verified. A claim that
// was confirmed or dropped meanwhile keeps that, and the check is dropped.
async function verify(project, id, env, now, again) {
  const loaded = loadNote(project.dir, id);
  if (!loaded) return { error: `there is no note ${id}` };
  const view = fold(loaded.note, loaded.events.map((e) => e.event));
  if (stateOf(view) !== "to verify") return { error: `note ${view.number} is ${stateOf(view)}; only a claim waiting to be verified is checked` };
  const top = project.repo.top;
  const change = changeProof(top, view, view.solved);
  const result = await runVerify({ top, note: view, change, env, now, again, holds: verifyHolds });
  if (result.reused) return { ok: true, reused: true };
  const claim = JSON.stringify(view.solved);
  const written = update(project, id, ({ note, view: fresh }) => (stateOf(fresh) === "to verify" && JSON.stringify(fresh.solved) === claim ? { note: { ...note, verify: result.verify, updated: now.toISOString() } } : { skip: true }));
  if (written.error) return written;
  return written.skipped ? { ok: true, dropped: true } : { ok: true, verify: result.verify };
}

// Fix in new tab: a free branch, then `issues launch --space` opens the ticket's tab. The note
// keeps the branch, so the fix never starts twice, or the launcher's last line when it failed.
function fix(project, id, space, env, now) {
  const loaded = loadNote(project.dir, id);
  if (!loaded) return { error: `there is no note ${id}` };
  const view = fold(loaded.note, loaded.events.map((e) => e.event));
  if (String(view.issue?.repo ?? "").toLowerCase() !== githubRepo(project.key)) return { error: `issue #${view.issue?.number} is not in this repo, so a ticket cannot start here` };
  const gate = gateFor(project.repo.top, project.key, env);
  if (!gate.can) return { error: gate.why };
  if (!space) return { error: "say which space of the Herdr app the tab opens in" };
  // The marker goes on with the state checked under the same write, so a second start, from
  // another panel or window, finds it and stops.
  const at = now.toISOString();
  const tickets = ticketRecords(project.repo.common);
  const started = update(project, id, ({ view: fresh }) => {
    const current = withTicket(withStaleFix(fresh, at), tickets);
    if (!allows(current, "fix")) return { error: refusedFix(current) };
    return { note: startFix(current, at, space) };
  }, { foldEvents: true });
  if (started.error) return started;
  const named = freeBranch(project.repo.top, view.filed?.title ?? view.title, env);
  const opened = named.error ? named : launchFix(project.repo.top, { space, ticket: view.issue.number, branch: named.branch }, env);
  update(project, id, ({ view: fresh }) => ({ note: recordFix(fresh, now.toISOString(), { ...opened, space }) }), { foldEvents: true });
  return opened.error ? { error: opened.error } : { ok: true, ...opened };
}

function refusedFix(view) {
  if (view.fix?.starting) return `a fix for note ${view.number} is starting already; nothing started`;
  if (view.fix) return `note ${view.number} is already fixing in ${view.fix.branch}; nothing started`;
  return `note ${view.number} is ${stateOf(view)}${view.issue?.closed ? ` and issue #${view.issue.number} is closed` : ""}; nothing started`;
}

// Filed notes learn whether their issue is closed, or open again, and which boards it is on: per
// repo, one question to GitHub about exactly those issue numbers.
function closedIssues(project, env, now) {
  const filed = notesOf(project.dir).filter((note) => stateOf(note) === "filed" && note.issue?.repo && note.issue?.number);
  let changed = 0;
  for (const repo of [...new Set(filed.map((note) => note.issue.repo))]) {
    const notes = filed.filter((note) => note.issue.repo === repo);
    const states = issueStates(repo, notes.map((note) => note.issue.number), env);
    if (!states) continue;
    for (const note of notes) {
      const state = states.get(note.issue.number);
      if (!state) continue;
      const closedAt = state.state === "CLOSED" ? state.closedAt ?? now.toISOString() : null;
      const boards = (state.projectItems?.nodes ?? []).filter(Boolean).map((item) => ({ title: item.project?.title ?? null, column: item.fieldValueByName?.name ?? null }));
      if (Boolean(closedAt) === Boolean(note.issue.closed) && JSON.stringify(boards) === JSON.stringify(note.issue.boards ?? [])) continue;
      update(project, note.id, ({ view }) => ({ note: recordIssueState(view, now.toISOString(), { closedAt, boards }) }), { foldEvents: true });
      changed++;
    }
  }
  return changed;
}

// The state of each of these issues of a repo, from one GraphQL query, or null when gh could not ask.
function issueStates(repo, numbers, env) {
  const [owner, name] = repo.split("/");
  const board = "projectItems(first: 5) { nodes { project { title } fieldValueByName(name: \"Status\") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } }";
  const fields = numbers.map((n) => `i${n}: issue(number: ${Number(n)}) { number state closedAt ${board} }`).join(" ");
  const answer = gh(["api", "graphql", "-f", `query=query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`, "-F", `owner=${owner}`, "-F", `name=${name}`], { env });
  if (answer.code !== 0) return null;
  try {
    const found = Object.values(JSON.parse(answer.stdout).data?.repository ?? {}).filter(Boolean);
    return new Map(found.map((issue) => [issue.number, issue]));
  } catch {
    return null;
  }
}

// Confirmed notes whose fix has not landed, looked at again after one fetch: landed, still waiting,
// or back to To verify when it never landed. Filed notes learn when their issue closed.
function watch(project, env, now) {
  if (!existsSync(project.dir)) return { ok: true, watched: 0 };
  const closed = closedIssues(project, env, now);
  const watched = notesOf(project.dir).filter(isWatched);
  if (!watched.length) return { ok: true, watched: 0, closed };
  fetch(project.repo.top);
  const mainRef = defaultRef(project.repo.top);
  const results = [];
  for (const note of watched) {
    const change = changeProof(project.repo.top, note, note.solved, mainRef);
    const landed = landedProof(project.repo.top, project.key, note.solved, change, env, { mainRef, since: note.created });
    update(project, note.id, ({ view }) => (isWatched(view) ? { note: recordLanded(view, now.toISOString(), landed) } : { skip: true }), { foldEvents: true });
    results.push({ number: note.number, state: landed.state, how: landed.how });
  }
  return { ok: true, watched: watched.length, results, closed };
}

function flags(options) {
  const details = {};
  for (let i = 0; i < options.length; i += 2) details[options[i].replace(/^--/, "")] = options[i + 1];
  return details;
}

// Replaces a file in one step, and only while it still holds what was read.
function writeOver(file, expected, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  if (readFileSync(file, "utf8") !== expected) {
    rmSync(temporary, { force: true });
    throw new Error("the note changed meanwhile; try again");
  }
  renameSync(temporary, file);
}

function switchCollecting(project, rest, env) {
  const [value, scope, key = project.key] = rest;
  if (value !== "on" && value !== "off") return { error: "say on or off" };
  if (scope === "--key" && !/^[^\s]+\/[^\s]+$/.test(key ?? "")) return { error: "--key needs a project, such as github.com/acme/shop" };
  const root = boxRoot(env);
  mkdirSync(root, { recursive: true });
  const settings = readSettings(root);
  const off = new Set(settings.off ?? []);
  if (scope === "--all") settings.collecting = value === "on";
  else if (value === "on") off.delete(key);
  else off.add(key);
  settings.off = [...off].sort();
  if (settings.collecting === undefined) settings.collecting = true;
  const file = join(root, "settings.json");
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(temporary, file);
  return { ok: true, collecting: { all: settings.collecting !== false, project: collecting(settings, key) } };
}

// The projects the settings view lists, each with its own switch: the projects of the given space
// folders (the open spaces of the Herdr app) and every project that has notes, the focused one
// first. `isOn` is the project's own switch; collecting everywhere being off overrules it.
function projects(here, folders, env) {
  const root = boxRoot(env);
  const settings = readSettings(root);
  const off = new Set(settings.off ?? []);
  const found = new Map();
  const add = (key, name, dir) => {
    if (!key || found.has(key)) return;
    const notes = dir && existsSync(dir) ? notesOf(dir) : [];
    const count = (state) => notes.filter((note) => stateOf(note) === state).length;
    found.set(key, { key, name, isHere: key === here.key, isOn: !off.has(key), counts: { open: count("open"), toVerify: count("to verify"), filed: count("filed") }, hasSpace: false });
  };
  for (const folder of folders) {
    const repo = repoAt(folder);
    if (!repo) continue;
    const key = projectKey(repo.origin, repo.checkout);
    add(key, projectName(key), join(root, "notes", projectFolder(key)));
    found.get(key).hasSpace = true;
  }
  const notesRoot = join(root, "notes");
  for (const name of existsSync(notesRoot) ? readdirSync(notesRoot) : []) {
    const key = projectOf(join(notesRoot, name));
    if (key) add(key, projectName(key), join(notesRoot, name));
  }
  if (here.key) add(here.key, here.name, here.dir);
  for (const key of off) if (!found.has(key)) add(key, projectName(key), join(notesRoot, projectFolder(key)));
  const list = [...found.values()].sort((a, b) => Number(b.isHere) - Number(a.isHere) || a.name.localeCompare(b.name));
  return { ok: true, all: settings.collecting !== false, projects: list };
}

// The project a notes folder belongs to, as its notes (or tombstones) say.
function projectOf(dir) {
  for (const sub of [dir, join(dir, "tombstones")]) {
    if (!existsSync(sub)) continue;
    for (const name of readdirSync(sub).filter((one) => one.endsWith(".json"))) {
      try {
        const key = JSON.parse(readFileSync(join(sub, name), "utf8")).project;
        if (key) return key;
      } catch (error) {
        process.stderr.write(`box.js: skipped ${join(sub, name)}: ${error.message}\n`);
      }
    }
  }
  return null;
}

// Filed, solved and binned notes untouched for 30 days become tombstones: what the same-note check
// and the numbers still need, nothing more. A note waiting in To verify stays, and so does any
// event that arrived after the notes were read.
function prune(project, now) {
  let pruned = 0;
  if (!existsSync(project.dir)) return { ok: true, pruned };
  for (const note of notesOf(project.dir)) {
    if (!["filed", "solved", "binned"].includes(stateOf(note)) || isWatched(note)) continue;
    if (note.eventFiles.length || now - Date.parse(note.updated) < KEEP_DAYS * DAY) continue;
    const tombstone = { id: note.id, number: note.number, project: note.project, title: note.title, at: note.at, status: note.status, issue: note.issue ?? null, solved: note.solved ?? null, spotted: note.spotted, created: note.created, updated: note.updated };
    mkdirSync(join(project.dir, "tombstones"), { recursive: true });
    writeFileSync(join(project.dir, "tombstones", `${note.id}.json`), `${JSON.stringify(tombstone, null, 2)}\n`);
    rmSync(join(project.dir, `${note.id}.json`), { force: true });
    pruned++;
  }
  return { ok: true, pruned };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // The panel gave up waiting: end a running check's claude and remove its snapshot folder.
  process.on("SIGTERM", () => {
    stopRunning();
    process.exit(143);
  });
  try {
    const answer = await run(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(answer)}\n`);
    process.exitCode = answer.error ? 1 : 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exitCode = 1;
  }
}
