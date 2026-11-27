// What a filed note still needs, in one line: { kind, text, branch?, isBoard? }; a fix's branch is
// kept apart, so the card can show it whole on a line of its own, and isBoard says the line is the
// board's failure. `kind` is needs (you have to act: the fix landed but the issue stayed open, the
// fix did not start or never reported back, it is not on the board), working (a fix is under way or
// its solve waits to land), ready (filed: start the fix whenever you like, where Fix in new tab is
// offered) or done (its issue is closed). A solve you confirmed outranks a fix that failed before
// it. Pure.
export function filedStep(note) {
  const issue = note.issue ?? {};
  const landed = note.solved?.landed?.state === "landed" ? note.solved.landed : null;
  if (issue.closed) return { kind: "done", text: landed ? `Closed · ${landed.how}` : "Closed on GitHub" };
  if (landed) return { kind: "needs", text: `The fix landed (${landed.how}), but the issue is still open: close it on GitHub` };
  if (note.solved?.confirmed) return { kind: "working", text: `Solved · waiting to land${note.solved.landed?.how ? ` · ${note.solved.landed.how}` : ""}` };
  if (note.fixError && !note.fix) return { kind: "needs", text: `Fix in new tab did not start: ${note.fixError.why}` };
  if (note.fix?.isStale) return { kind: "needs", text: "A fix was starting but never reported back: look for its tab before you start it again" };
  if (isOffBoard(note)) return { kind: "needs", text: `Not on the board: ${note.board.error}`, isBoard: true };
  if (note.fix?.starting) return { kind: "working", text: "Starting the fix in a new tab…" };
  if (note.fix?.branch) return { kind: "working", text: "Being fixed in its own tab", branch: note.fix.branch };
  const board = issue.boards?.length ? `On ${issue.boards.map((b) => (b.column ? `${b.title} › ${b.column}` : b.title)).join(", ")}` : "Filed";
  return { kind: "ready", text: note.actions?.includes("fix") ? `${board} · start the fix whenever you like` : board };
}

// The board step failed and GitHub shows the issue on no board since (the board can add it itself,
// or you did): what Add to board is for, until the issue closes.
export function isOffBoard(note) {
  return Boolean(note.board?.error) && !note.issue?.boards?.length && !note.issue?.closed;
}

// Just filed in the order that asks for you first: what needs you, then what is under way, then the rest.
const ORDER = { needs: 0, working: 1, ready: 2, done: 3 };
export function byNextStep(notes) {
  return [...notes].sort((a, b) => ORDER[filedStep(a).kind] - ORDER[filedStep(b).kind]);
}

// The filed notes the list shows: every one that needs you, also one filed long ago (the history
// would hide it), and the rest of the ones just filed, in the order that asks for you first.
export function filedGroups(history, justFiled) {
  const filed = (history ?? []).filter((note) => note.state === "filed");
  const needs = filed.filter((note) => filedStep(note).kind === "needs");
  return { needs, justFiled: byNextStep(filed.filter((note) => justFiled?.has(note.id) && !needs.includes(note))) };
}

// The history leaves out what the list shows.
export function inHistory(history, justFiled) {
  const { needs, justFiled: rest } = filedGroups(history, justFiled);
  const listed = new Set([...needs, ...rest].map((note) => note.id));
  return (history ?? []).filter((note) => !listed.has(note.id));
}
