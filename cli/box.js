#!/usr/bin/env node
// The box's own side, run by the Herdr mod: reading a project's notes for the panel, the user's
// actions on them, the collecting switches, and turning old notes into tombstones. Only this side
// rewrites a note; the suggest command only ever creates files. It is not on the PATH and not
// under the agents' permission rule: agents never run it. Every answer is one line of JSON.
//
//   node cli/box.js read <folder> [--changes]
//   node cli/box.js act <folder> <note id> <action> [--branch b] [--sha s] [--reason r]
//   node cli/box.js collecting <folder> on|off [--all]
//   node cli/box.js prune <folder>
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fold, stateOf } from "../mods/suggestion-box/events.js";
import { age } from "../mods/suggestion-box/notes.js";
import { projectFolder, projectKey, projectName } from "../mods/suggestion-box/project.js";
import { applyAction, BOX_DOES, buttonsFor } from "../mods/suggestion-box/rules.js";
import { changeFor, defaultRef } from "./changes.js";
import { repoAt } from "./git.js";
import { boxRoot, collecting, readSettings } from "./store.js";

const DAY = 86400000;
const KEEP_DAYS = 30;

export function run(args, env = process.env, now = new Date()) {
  const [command, folder, ...rest] = args;
  const project = projectAt(folder, env);
  if (command === "read") return read(project, rest.includes("--changes"), now);
  if (!project.dir) return { error: project.why };
  if (command === "act") return act(project, rest, now);
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
  const live = views.filter((v) => ["open", "to verify", "filed"].includes(v.state));
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
  if (!BOX_DOES.includes(action)) return { error: `${action} is not something the box does yet` };
  const loaded = loadNote(project.dir, id);
  if (!loaded) return { error: `there is no note ${id}` };
  const view = fold(loaded.note, loaded.events.map((e) => e.event));
  const result = applyAction(view, action, now.toISOString(), flags(options));
  if (result.error) return { error: result.error };
  writeOver(join(project.dir, `${id}.json`), loaded.text, result.note);
  for (const { file } of loaded.events) rmSync(file, { force: true });
  return { ok: true, state: stateOf(result.note) };
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
  try {
    const answer = run(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(answer)}\n`);
    process.exitCode = answer.error ? 1 : 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exitCode = 1;
  }
}
