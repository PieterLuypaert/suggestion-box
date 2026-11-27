// The proofs of a claim (the change, the independent check, landed) and the watch over confirmed fixes.
import { existsSync } from "node:fs";
import { fold, stateOf } from "../../mods/suggestion-box/events.js";
import { isWatched, recordLanded } from "../../mods/suggestion-box/rules.js";
import { verifyHolds } from "../../mods/suggestion-box/proofs.js";
import { changeProof, landedProof, runVerify } from "./proofs.js";
import { fetch } from "./claude.js";
import { defaultRef } from "./changes.js";
import { closedIssues } from "./filing.js";
import { loadNote, notesOf, update } from "./note-files.js";

// Proofs 1 and 3 of a claim, after a fetch: the change and whether it landed. Not kept: git and gh
// say it anew each time the panel shows the project.
export function proofs(project, id, env) {
  const loaded = loadNote(project.dir, id);
  if (!loaded) return { error: `there is no note ${id}` };
  const view = fold(loaded.note, loaded.events.map((e) => e.event));
  if (!view.solved) return { error: `note ${view.number} has no claim` };
  const fetched = fetch(project.repo.top);
  return { ok: true, fetched, ...proofsOf(project, view, env) };
}

// The proofs Confirm keeps, or null when they could not be found: Confirm never fails over them.
export function keptProofs(project, view, env) {
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
  const landed = landedProof(top, project.key, view.solved, change, env, { mainRef, since: view.created, from: view.from?.sha ?? null });
  const commits = (change.commits ?? []).map(({ sha, subject }) => ({ sha, subject }));
  return { change, landed, verify: view.verify ?? null, commits };
}

// Proof 2, kept on the note: the independent check of a claim waiting to be verified. A claim that
// was confirmed or dropped meanwhile keeps that, and the check is dropped.
export async function verify(project, id, env, now, again) {
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

// Confirmed notes whose fix has not landed, looked at again after one fetch: landed, still waiting,
// or back to To verify when it never landed. Filed notes learn when their issue closed.
export function watch(project, env, now) {
  if (!existsSync(project.dir)) return { ok: true, watched: 0 };
  const closed = closedIssues(project, env, now);
  const watched = notesOf(project.dir).filter(isWatched);
  if (!watched.length) return { ok: true, watched: 0, closed };
  fetch(project.repo.top);
  const mainRef = defaultRef(project.repo.top);
  const results = [];
  for (const note of watched) {
    const change = changeProof(project.repo.top, note, note.solved, mainRef);
    const landed = landedProof(project.repo.top, project.key, note.solved, change, env, { mainRef, since: note.created, from: note.from?.sha ?? null });
    update(project, note.id, ({ view }) => (isWatched(view) ? { note: recordLanded(view, now.toISOString(), landed) } : { skip: true }), { foldEvents: true });
    results.push({ number: note.number, state: landed.state, how: landed.how });
  }
  return { ok: true, watched: watched.length, results, closed };
}
