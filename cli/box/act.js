// The person's actions on a note, the check of a note, and turning old notes into tombstones.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fold, stateOf } from "../../mods/suggestion-box/events.js";
import { stillHolds } from "../../mods/suggestion-box/check.js";
import { ACTS, allows, applyAction, isWatched } from "../../mods/suggestion-box/rules.js";
import { runCheck } from "./check.js";
import { keptProofs } from "./claims.js";
import { pruneCopies } from "./proofs.js";
import { DAY, KEEP_DAYS, loadNote, notesOf, update } from "./note-files.js";

// One of the user's actions: the note with its events folded in, the action applied, written over
// the note at once, then the folded event files removed. An event that arrives meanwhile stays.
export function act(project, rest, now, env) {
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
export async function check(project, id, env, now, again) {
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

function flags(options) {
  const details = {};
  for (let i = 0; i < options.length; i += 2) details[options[i].replace(/^--/, "")] = options[i + 1];
  return details;
}

// Filed, solved and binned notes untouched for 30 days become tombstones: what the same-note check
// and the numbers still need, nothing more. A note waiting in To verify stays, and so does any
// event that arrived after the notes were read. The files copied for the editor go after a day.
export function prune(project, now) {
  pruneCopies(now);
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
