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
//   node cli/box.js collecting <folder> on|off [--all]
//   node cli/box.js prune <folder>
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fold, stateOf } from "../mods/suggestion-box/events.js";
import { age } from "../mods/suggestion-box/notes.js";
import { projectFolder, projectKey, projectName } from "../mods/suggestion-box/project.js";
import { stillHolds } from "../mods/suggestion-box/check.js";
import { ACTS, allows, applyAction, buttonsFor, recordIssue } from "../mods/suggestion-box/rules.js";
import { fillProblem, isPublicTarget, scanTexts } from "../mods/suggestion-box/editor.js";
import { githubRepo, issueText } from "../mods/suggestion-box/issue.js";
import { scanBlock } from "../mods/suggestion-box/scan.js";
import { runCheck, stopRunning } from "./check.js";
import { addToBoard, codeLinkFor, createIssue, similarIssues, targetFor } from "./file.js";
import { changeFor, defaultRef } from "./changes.js";
import { repoAt } from "./git.js";
import { boxRoot, collecting, readSettings } from "./store.js";

const DAY = 86400000;
const KEEP_DAYS = 30;

export async function run(args, env = process.env, now = new Date()) {
  const [command, folder, ...rest] = args;
  const project = projectAt(folder, env);
  if (command === "read") return read(project, rest.includes("--changes"), now);
  if (!project.dir) return { error: project.why };
  if (command === "act") return act(project, rest, now);
  if (command === "check") return check(project, rest[0], env, now, rest.includes("--again"));
  if (command === "target") return target(project, rest[0], env);
  if (command === "draft") return draft(project, rest[0], rest[1], now);
  if (command === "file") return file(project, rest[0], rest[1], env, now);
  if (command === "board") return board(project, rest[0], env, now);
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

function read(project, withChanges, now) {
  if (!project.dir) return { project: null, why: project.why };
  // Only the notes folder is made: a project's own folder appears with its first note, so reading
  // a repo that never had one leaves nothing behind. The box watches the notes folder until then.
  mkdirSync(join(project.root, "notes"), { recursive: true });
  const settings = readSettings(project.root);
  const mainRef = withChanges ? defaultRef(project.repo.top) : null;
  const views = (existsSync(project.dir) ? notesOf(project.dir) : []).map((note) => describe(project, note, withChanges, mainRef, now));
  // A filed note is history; the panel keeps the ones it just filed in sight until it closes.
  const live = views.filter((v) => ["open", "to verify"].includes(v.state));
  const recent = views.filter((v) => !live.includes(v) && now - Date.parse(v.updated) < KEEP_DAYS * DAY);
  return {
    project: { key: project.key, name: project.name, dir: project.dir, exists: existsSync(project.dir), notes: join(project.root, "notes"), top: project.repo.top, checkout: project.repo.checkout, origin: project.repo.origin },
    collecting: { all: settings.collecting !== false, project: collecting(settings, project.key) },
    notes: live.sort((a, b) => b.number - a.number),
    history: recent.sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated)),
    counts: { open: views.filter((v) => v.state === "open").length, toVerify: views.filter((v) => v.state === "to verify").length },
  };
}

function describe(project, note, withChanges, mainRef, now) {
  const view = { ...note, state: stateOf(note), age: age(note.created, now.getTime()) };
  if (withChanges && view.state === "open") view.changed = changeFor(project.repo.top, note, mainRef);
  view.actions = buttonsFor(view);
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
function act(project, rest, now) {
  const [id, action, ...options] = rest;
  if (!ACTS.includes(action) || action === "file") return { error: `${action} is not something the box does here` };
  const result = update(project, id, ({ view }) => applyAction(view, action, now.toISOString(), flags(options)), { foldEvents: true });
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
  const repo = where.repo ?? githubRepo(project.key);
  return {
    ok: true,
    target: where,
    similar: where.kind === "github" && !where.why ? similarIssues(where.repo, note.title, env) : [],
    link: repo ? codeLinkFor(project.repo.top, note, repo, env) : null,
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
function file(project, id, text, env, now) {
  const loaded = loadNote(project.dir, id);
  if (!loaded) return { error: `there is no note ${id}` };
  const view = fold(loaded.note, loaded.events.map((e) => e.event));
  const value = JSON.parse(text ?? "{}");
  const where = targetFor(project.repo.top, project.key, env);
  const why = refuseFiling(view, value, where);
  if (why) return { error: why };
  const link = codeLinkFor(project.repo.top, view, where.repo, env);
  const body = issueText({ sections: value.sections }, { link, ticket: view.from?.ticket ?? null });
  const issue = createIssue({ repo: where.repo, title: value.title.trim(), body, label: where.labelMissing ? null : where.label }, env);
  if (issue.error) return { error: `gh could not create the issue: ${issue.error}` };
  const board = where.board ? addToBoard(where.board, issue.url, env) : null;
  const ref = where.repo.toLowerCase() === githubRepo(project.key) ? `#${issue.number}` : `${where.repo}#${issue.number}`;
  const details = { issue, repo: where.repo, closes: `${where.linkKeyword} ${ref}`, title: value.title.trim(), sections: value.sections, notGone: value.notGone ?? null, board };
  update(project, id, ({ view: fresh }) => ({ note: recordIssue(fresh, now.toISOString(), details) }), { foldEvents: true });
  return { ok: true, issue, board };
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
  const [value, scope] = rest;
  if (value !== "on" && value !== "off") return { error: "say on or off" };
  const root = boxRoot(env);
  mkdirSync(root, { recursive: true });
  const settings = readSettings(root);
  const off = new Set(settings.off ?? []);
  if (scope === "--all") settings.collecting = value === "on";
  else if (value === "on") off.delete(project.key);
  else off.add(project.key);
  settings.off = [...off].sort();
  if (settings.collecting === undefined) settings.collecting = true;
  const file = join(root, "settings.json");
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(temporary, file);
  return { ok: true, collecting: { all: settings.collecting !== false, project: collecting(settings, project.key) } };
}

// Filed, solved and binned notes untouched for 30 days become tombstones: what the same-note check
// and the numbers still need, nothing more. A note waiting in To verify stays, and so does any
// event that arrived after the notes were read.
function prune(project, now) {
  let pruned = 0;
  if (!existsSync(project.dir)) return { ok: true, pruned };
  for (const note of notesOf(project.dir)) {
    if (!["filed", "solved", "binned"].includes(stateOf(note))) continue;
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
