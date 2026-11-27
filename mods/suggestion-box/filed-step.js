// What a note just filed still needs, in one line: { kind, text, branch?, isBoard? }; a fix's branch
// is kept apart, so the card can show it whole on a line of its own, and isBoard says the line is the
// board's failure. `kind` is needs (you have to act:
// the fix did not start, it is not on the board, its fix landed but the issue stayed open), working (a
// fix is under way or waiting to land), ready (filed and on its board: start the fix whenever you like)
// or done (its issue is closed). Pure.
export function filedStep(note) {
  const issue = note.issue ?? {};
  const landed = note.solved?.landed?.state === "landed" ? note.solved.landed : null;
  if (issue.closed) return { kind: "done", text: landed ? `Closed · ${landed.how}` : "Closed on GitHub" };
  if (landed) return { kind: "needs", text: `The fix landed (${landed.how}), but the issue is still open: close it on GitHub` };
  if (note.fixError && !note.fix) return { kind: "needs", text: `Fix in new tab did not start: ${note.fixError.why}` };
  if (note.fix?.isStale) return { kind: "needs", text: "A fix was starting but never reported back: look for its tab before you start it again" };
  if (note.board?.error) return { kind: "needs", text: `Not on the board: ${note.board.error}`, isBoard: true };
  if (note.solved?.confirmed) return { kind: "working", text: `Solved · waiting to land${note.solved.landed?.how ? ` · ${note.solved.landed.how}` : ""}` };
  if (note.fix?.starting) return { kind: "working", text: "Starting the fix in a new tab…" };
  if (note.fix?.branch) return { kind: "working", text: "Being fixed in its own tab", branch: note.fix.branch };
  const board = issue.boards?.length ? `On ${issue.boards.map((b) => (b.column ? `${b.title} › ${b.column}` : b.title)).join(", ")}` : "Filed";
  return { kind: "ready", text: `${board} · start the fix whenever you like` };
}

// Just filed in the order that asks for you first: what needs you, then what is under way, then the rest.
const ORDER = { needs: 0, working: 1, ready: 2, done: 3 };
export function byNextStep(notes) {
  return [...notes].sort((a, b) => ORDER[filedStep(a).kind] - ORDER[filedStep(b).kind]);
}
