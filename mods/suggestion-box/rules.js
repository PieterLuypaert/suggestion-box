// The states table (PLAN.md section 6c) as code: which actions each note state allows, and what
// each of the box's actions does to a note. The box shows only these buttons, and its store refuses
// anything else, also a click that races an agent's claim. Pure: no Herdr and no Node imports.
import { stateOf } from "./events.js";

// Every action the box knows.
export const ACTIONS = ["check", "file", "mark-solved", "bin", "restore", "confirm", "not-solved", "reopen", "fix"];
// The ones that change a note's state: through applyAction, and File issue through recordIssue.
export const ACTS = ["bin", "restore", "mark-solved", "confirm", "not-solved", "reopen", "file"];
// What the box itself does: those, the check, and Fix in new tab (shown only where the launcher is).
export const BOX_DOES = [...ACTS, "check", "fix"];

// The buttons a note shows: what its state allows, what the list shows, and what the box does.
export function buttonsFor(view) {
  return shownFor(view).filter((action) => BOX_DOES.includes(action));
}

// The actions a note's state allows, in the order the box shows them.
export function actionsFor(view) {
  const state = stateOf(view);
  if (state === "to verify") return ["confirm", "not-solved"];
  if (state === "open") return ["mark-solved", "check", "file", "bin"];
  if (state === "filed") return view.solved?.confirmed || (view.fix && !view.fix.isStale) || view.issue?.closed ? [] : ["fix"];
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
  // Moved back to open, the code is read anew: an old check, and its banner, do not come back.
  if (["not-solved", "restore", "reopen"].includes(action)) note.check = null;
  // A claim's independent check belongs to that claim only.
  if (["mark-solved", "not-solved", "reopen"].includes(action)) note.verify = null;
  change[action](note, now, details);
  note.updated = now;
  return { note };
}

// A confirmed note after the watch looked again at its fix: landed, still waiting, or never landed,
// which brings it back to To verify, as open or filed as it was underneath.
export function recordLanded(view, now, landed) {
  const note = JSON.parse(JSON.stringify(view));
  if (!note.solved?.confirmed) return note;
  if (landed.state !== "never") {
    note.solved.landed = { ...landed, at: now };
    return note;
  }
  note.solved.confirmed = null;
  note.solved.landed = null;
  note.solved.neverLanded = { how: landed.how, at: now };
  if (note.status === "solved") note.status = "open";
  note.updated = now;
  return note;
}

// Whether the watch still looks at a note: confirmed solved, its fix not landed yet.
export const isWatched = (view) => Boolean(view.solved?.confirmed) && view.solved?.landed?.state !== "landed";

// A fix that has been starting this long without a word back is called stale: the launcher was cut
// off, and its tab may or may not be open.
export const FIX_STALE_MS = 10 * 60000;

// The fix as the box shows it now: a start that never reported back is marked stale.
export function withStaleFix(view, now) {
  if (!view.fix?.starting || Date.parse(now) - Date.parse(view.fix.at) < FIX_STALE_MS) return view;
  return { ...view, fix: { ...view.fix, isStale: true } };
}

// A fix about to start, marked before the launcher runs, so no second start gets in meanwhile.
export function startFix(view, now, space) {
  const note = JSON.parse(JSON.stringify(view));
  note.fix = { starting: true, space, at: now };
  note.fixError = null;
  return note;
}

// A fix started in a new tab: its branch, tab and pane, so it never starts twice; or why it did
// not, and the button is back.
export function recordFix(view, now, fix) {
  const note = JSON.parse(JSON.stringify(view));
  if (fix.error) {
    note.fix = null;
    note.fixError = { why: fix.error, at: now };
  } else {
    note.fix = { branch: fix.branch, tab: fix.tab, pane: fix.pane, space: fix.space ?? null, at: now };
    note.fixError = null;
  }
  note.updated = now;
  return note;
}

// A filed note after a look at its issue on GitHub: closed (with when), or open again.
export function recordClosed(view, now, closedAt) {
  const note = JSON.parse(JSON.stringify(view));
  note.issue = { ...note.issue, closed: closedAt ? { at: closedAt } : null };
  note.updated = now;
  return note;
}

// The note once its issue exists. Create issue is only offered for an open note, but the issue is
// real by the time this runs, so it is recorded whatever happened to the note meanwhile: an agent's
// claim that came in stays, and the note goes to To verify as a filed note.
export function recordIssue(view, now, details) {
  const note = JSON.parse(JSON.stringify(view));
  delete note.changed;
  delete note.tombstone;
  change.file(note, now, details);
  note.updated = now;
  return note;
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
  // A filed note stays filed underneath; an open one is solved. The proofs are kept as they stood,
  // and the box watches the fix until it lands.
  confirm(note, now, details) {
    note.solved.confirmed = { at: now, proofs: details.proofs ?? null };
    note.solved.landed = details.proofs?.landed ? { ...details.proofs.landed, at: now } : null;
    note.solved.neverLanded = null;
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
  // Filed: the issue (with the words a PR uses to close it), what went into it, and how the board
  // step went. Its draft is done with.
  file(note, now, details) {
    note.status = "filed";
    note.binned = null;
    note.issue = { number: details.issue.number, url: details.issue.url, repo: details.repo ?? null, closes: details.closes ?? null, at: now };
    note.filed = { title: details.title, sections: details.sections, notGone: details.notGone ?? null };
    note.board = details.board ?? null;
    note.draft = null;
    note.filing = null;
  },
};
