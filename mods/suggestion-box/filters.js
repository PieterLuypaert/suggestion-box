// The panel's filters, the tabs under its header: what each one holds, and how many. Now is what is
// live (claims to verify, filed issues that need you, open notes, what was just filed); Filed the
// issues still open on GitHub; Done what was solved or closed in the last 30 days; Binned what was
// binned. A filed issue that needs you is in Now and in Filed. Pure.
import { byNextStep, filedGroups, filedStep } from "./filed-step.js";

export const FILTERS = ["now", "filed", "done", "binned"];

export const FILTER_NAMES = { now: "Now", filed: "Filed", done: "Done", binned: "Binned" };

// A filed issue that was solved since counts as solved: its fix is what you look for.
export const isSolved = (note) => note.state === "solved" || Boolean(note.solved?.confirmed);

export const isClosed = (note) => note.state === "filed" && !isSolved(note) && Boolean(note.issue?.closed);

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
  const filed = byNextStep(history.filter((note) => note.state === "filed" && !isSolved(note) && !isClosed(note)));
  const done = history.filter((note) => isSolved(note) || isClosed(note));
  const binned = history.filter((note) => note.state === "binned");
  const counts = { now: now.toVerify.length + now.needs.length + now.open.length + now.justFiled.length, filed: filed.length, done: done.length, binned: binned.length };
  return { now, filed, done, binned, counts };
}

// How a row in Filed, Done or Binned stands, in a word or two, and the colour of its dot: the same
// language as everywhere (amber needs you, blue under way, green ready or landed, grey done).
export function rowState(note) {
  if (note.state === "binned") return { word: "binned", kind: "done" };
  if (isSolved(note)) {
    const landed = note.solved?.landed?.state;
    if (landed === "landed") return { word: "landed", kind: "ready" };
    if (note.solved?.confirmed) return { word: "waiting to land", kind: "working" };
    return { word: "solved", kind: "ready" };
  }
  if (isClosed(note)) return { word: "closed", kind: "done" };
  const step = filedStep(note);
  const words = { needs: "needs you", working: note.fix?.starting ? "starting" : "fixing", ready: "ready", done: "closed" };
  return { word: words[step.kind], kind: step.kind };
}
