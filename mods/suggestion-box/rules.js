// The states table (PLAN.md section 6c) as code: which actions each note state allows, and what
// each of the box's actions does to a note. The box shows only these buttons, and its store refuses
// anything else, also a click that races an agent's claim. Pure: no Herdr and no Node imports.
import { stateOf } from "./events.js";

// Every action the box knows. File issue and Fix in new tab come with later versions.
export const ACTIONS = ["check", "file", "mark-solved", "bin", "restore", "confirm", "not-solved", "reopen", "fix"];
// The ones that change a note's state, through applyAction.
export const ACTS = ["bin", "restore", "mark-solved", "confirm", "not-solved", "reopen"];
// What the box itself does so far: those, and the check.
export const BOX_DOES = [...ACTS, "check"];

// The buttons a note shows: what its state allows, what the list shows, and what the box does.
export function buttonsFor(view) {
  return shownFor(view).filter((action) => BOX_DOES.includes(action));
}

// The actions a note's state allows, in the order the box shows them.
export function actionsFor(view) {
  const state = stateOf(view);
  if (state === "to verify") return ["confirm", "not-solved"];
  if (state === "open") return ["mark-solved", "check", "file", "bin"];
  if (state === "filed") return view.solved?.confirmed || view.fix ? [] : ["fix"];
  if (state === "solved") return ["reopen"];
  if (state === "binned") return ["restore"];
  return [];
}

export function allows(view, action) {
  return actionsFor(view).includes(action);
}

// The buttons a note in the list shows: its state's actions, with Mark solved only while its code
// changed since the drop (the check's banner offers Mark solved on its own).
export function shownFor(view) {
  return actionsFor(view).filter((action) => action !== "mark-solved" || Boolean(view.changed));
}

// The note after one of the box's actions, or an error when its state does not allow it. `view` is
// the note with its events folded in; `now` an ISO time; `details` what the action needs.
export function applyAction(view, action, now, details = {}) {
  if (!allows(view, action)) return { error: `note ${view.number} is ${stateOf(view)}; ${action} is not one of its actions` };
  if (!ACTS.includes(action)) return { error: `${action} does not change a note's state` };
  const note = JSON.parse(JSON.stringify(view));
  delete note.changed;
  delete note.tombstone;
  change[action](note, now, details);
  note.updated = now;
  return { note };
}

const change = {
  bin(note, now) {
    note.status = "binned";
    note.binned = { at: now };
  },
  restore(note, now) {
    note.status = "open";
    note.binned = null;
    note.restored = { at: now };
  },
  // Sent to To verify by you, from the changed lines or the check's banner.
  "mark-solved"(note, now, details) {
    note.solved = {
      branch: details.branch ?? null,
      sha: details.sha ?? null,
      how: details.how ?? "Marked solved by you.",
      proof: details.proof ?? null,
      by: details.by ?? "you",
      at: now,
      confirmed: null,
    };
  },
  // A filed note stays filed underneath; an open one is solved.
  confirm(note, now) {
    note.solved.confirmed = { at: now };
    if (note.status === "open") note.status = "solved";
  },
  // The claim goes; the note is back exactly where it was, marked not verified.
  "not-solved"(note, now, details) {
    note.notVerified = { branch: note.solved.branch, reason: details.reason ?? null, at: now };
    note.previous = [...(note.previous ?? []), note.solved];
    note.solved = null;
  },
  reopen(note, now) {
    note.previous = [...(note.previous ?? []), note.solved];
    note.solved = null;
    note.status = "open";
    note.reopened = { by: "you", at: now };
  },
  file() {
    throw new Error("filing comes with version 0.4.0");
  },
  fix() {
    throw new Error("fixing comes with version 0.6.0");
  },
};
