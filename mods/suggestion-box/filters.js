// The panel's filters, the tabs under its header: what each one holds, and how many. Now is what is
// live (claims to verify, filed issues that need you, open notes, what was just filed); Filed every
// issue still open on GitHub, also one whose fix is solved or landed; Done the solved notes and the
// issues closed on GitHub, the last 30 days; Binned what was binned. A filed issue that needs you is
// in Now and in Filed. Pure.
import { byNextStep, filedGroups, filedStep } from "./filed-step.js";

export const FILTERS = ["now", "filed", "done", "binned"];

export const FILTER_NAMES = { now: "Now", filed: "Filed", done: "Done", binned: "Binned" };

// A filed issue that was solved since counts as solved: its fix is what you look for.
export const isSolved = (note) => note.state === "solved" || Boolean(note.solved?.confirmed);

export const isClosed = (note) => note.state === "filed" && Boolean(note.issue?.closed);

export function filtered(answer, justFiled) {
  const notes = answer?.notes ?? [];
  const history = answer?.history ?? [];
  const { needs, justFiled: fresh } = filedGroups(history, justFiled);
  const now = {
    toVerify: notes.filter((note) => note.state === "to verify"),
    needs,
    open: notes.filter((note) => note.state === "open"),
    justFiled: fresh,
  };
  const filed = byNextStep(history.filter((note) => note.state === "filed" && !isClosed(note)));
  const done = history.filter((note) => note.state === "solved" || isClosed(note));
  const binned = history.filter((note) => note.state === "binned");
  const counts = { now: now.toVerify.length + now.needs.length + now.open.length + now.justFiled.length, filed: filed.length, done: done.length, binned: binned.length };
  return { now, filed, done, binned, counts };
}

// How a row in Filed, Done or Binned stands, in a word or two, and the colour of its dot: the same
// language as everywhere (amber needs you, blue under way, green ready or landed, grey done).
export function rowState(note) {
  if (note.state === "binned") return { word: "binned", kind: "done" };
  const landed = note.solved?.landed?.state === "landed";
  if (isClosed(note)) return landed ? { word: "landed", kind: "ready" } : { word: "closed", kind: "done" };
  if (note.state === "solved") {
    if (landed) return { word: "landed", kind: "ready" };
    return note.solved?.confirmed ? { word: "waiting to land", kind: "working" } : { word: "solved", kind: "ready" };
  }
  // An issue still open on GitHub: its next step, as Now says it.
  const step = filedStep(note);
  const working = note.solved?.confirmed ? "waiting to land" : note.fix?.starting ? "starting" : "fixing";
  const words = { needs: "needs you", working, ready: "ready", done: "closed" };
  return { word: words[step.kind], kind: step.kind };
}
