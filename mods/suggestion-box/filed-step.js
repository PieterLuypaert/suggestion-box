// What a note just filed still needs, in one line: { kind, text }. `kind` is needs (you have to act:
// the fix did not start, it is not on the board), working (a fix is under way), ready (filed and on its
// board: start the fix whenever you like) or done (its issue is closed). Pure.
export function filedStep(note) {
  const issue = note.issue ?? {};
  if (issue.closed) return { kind: "done", text: `#${issue.number} is closed on GitHub` };
  if (note.fixError && !note.fix) return { kind: "needs", text: `Fix in new tab did not start: ${note.fixError.why}` };
  if (note.fix?.isStale) return { kind: "needs", text: "A fix was starting but never reported back: look for its tab before you start it again" };
  if (note.board?.error) return { kind: "needs", text: `Not on the board: ${note.board.error}` };
  if (note.fix?.starting) return { kind: "working", text: "Starting the fix in a new tab…" };
  if (note.fix?.branch) return { kind: "working", text: `Being fixed in ${note.fix.branch}` };
  const board = issue.boards?.length ? `On ${issue.boards.map((b) => (b.column ? `${b.title} › ${b.column}` : b.title)).join(", ")}` : "Filed";
  return { kind: "ready", text: `${board} · start the fix whenever you like` };
}

// Just filed in the order that asks for you first: what needs you, then what is under way, then the rest.
const ORDER = { needs: 0, working: 1, ready: 2, done: 3 };
export function byNextStep(notes) {
  return [...notes].sort((a, b) => ORDER[filedStep(a).kind] - ORDER[filedStep(b).kind]);
}
