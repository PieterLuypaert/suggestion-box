// Reading a project's box for the panel, and the projects the settings view lists.
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { stateOf } from "../../mods/suggestion-box/events.js";
import { age } from "../../mods/suggestion-box/notes.js";
import { projectFolder, projectKey, projectName } from "../../mods/suggestion-box/project.js";
import { buttonsFor, isWatched, withStaleFix } from "../../mods/suggestion-box/rules.js";
import { gateFor } from "./fix.js";
import { githubRepo } from "../../mods/suggestion-box/issue.js";
import { changeFor, defaultRef } from "./changes.js";
import { repoAt, ticketRecords } from "../shared/git.js";
import { boxRoot, collecting, readSettings } from "../shared/store.js";
import { verify } from "./claims.js";
import { record } from "./filing.js";
import { fix } from "./fixing.js";
import { DAY, KEEP_DAYS, notesOf } from "./note-files.js";

export function read(project, withChanges, now, env) {
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
export function withTicket(note, tickets) {
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

// The projects the settings view lists, each with its own switch: the projects of the given space
// folders (the open spaces of the Herdr app) and every project that has notes, the focused one
// first. `isOn` is the project's own switch; collecting everywhere being off overrules it.
export function projects(here, folders, env) {
  const root = boxRoot(env);
  const settings = readSettings(root);
  const off = new Set(settings.off ?? []);
  const found = new Map();
  const add = (key, name, dir) => {
    if (!key || found.has(key)) return;
    const notes = countable(dir);
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
  const noteFolders = existsSync(notesRoot) ? readdirSync(notesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()) : [];
  for (const { name } of noteFolders) {
    const key = projectOf(join(notesRoot, name));
    if (key) add(key, projectName(key), join(notesRoot, name));
  }
  if (here.key) add(here.key, here.name, here.dir);
  for (const key of off) if (!found.has(key)) add(key, projectName(key), join(notesRoot, projectFolder(key)));
  const list = [...found.values()].sort((a, b) => Number(b.isHere) - Number(a.isHere) || a.name.localeCompare(b.name));
  return { ok: true, all: settings.collecting !== false, projects: list };
}

// A project's notes for its counts; one that cannot be read counts as none, and says so on stderr,
// so one broken note never takes the whole list down.
function countable(dir) {
  if (!dir || !existsSync(dir)) return [];
  try {
    return notesOf(dir);
  } catch (error) {
    process.stderr.write(`box.js: could not count the notes in ${dir}: ${error.message}\n`);
    return [];
  }
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
