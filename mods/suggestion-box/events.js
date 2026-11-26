// What happened to a note after its drop. The suggest command never rewrites a note: a repeat
// drop or a claim is an event file beside it, and only the box folds events into the note. Both
// sides read a note through fold(), so they agree on its state. Pure: no Herdr and no Node imports.

// The note with its events applied, oldest first. The note on disk is not changed.
export function fold(note, events = []) {
  const view = JSON.parse(JSON.stringify(note));
  view.spotted = view.spotted ?? 1;
  const ordered = [...events].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  for (const event of ordered) apply(view, event);
  return view;
}

function apply(view, event) {
  if (event.type === "spotted") spotted(view, event);
  if (event.type === "claim") claim(view, event);
}

// Seen again. A note you confirmed solved reopens: the problem is back.
function spotted(view, event) {
  view.spotted += 1;
  if (view.status !== "solved") return;
  view.reopened = { after: view.solved?.branch ?? null, at: event.at };
  view.previous = [...(view.previous ?? []), view.solved];
  view.solved = null;
  view.status = "open";
}

// An agent says its task fixed the note. Only an open or filed note without a claim takes one.
function claim(view, event) {
  if (!canClaim(view)) return;
  const { type, ...rest } = event;
  view.solved = { ...rest, confirmed: null };
}

export function canClaim(view) {
  return (view.status === "open" || view.status === "filed") && !waitsToVerify(view);
}

// A claim you have not confirmed yet: the note sits in To verify, its state underneath unchanged.
export function waitsToVerify(view) {
  return Boolean(view.solved && !view.solved.confirmed);
}

// The one word the command and the box use for where a note is.
export function stateOf(view) {
  if (waitsToVerify(view) && (view.status === "open" || view.status === "filed")) return "to verify";
  return view.status;
}
