// Whether a note's code changed since the drop, on the branch it was dropped on or on the default
// branch: plain git, no Claude. The note's lines are mapped forward through `git diff -U0 -M`, or,
// when its commit is gone after a rebase, its snippet is looked for instead.
import { findSnippet, noteRange, parseHunks, touches } from "../../mods/suggestion-box/lines.js";
import { defaultRef, gitAnswer, gitText } from "../shared/git.js";

export { defaultRef };

// { on, kind } when the note's lines changed ("changed") or its file is gone ("removed") on its own
// branch or on the default branch, else null. A note without a file, line or commit has no lines.
export function changeFor(top, note, mainRef = defaultRef(top)) {
  const range = noteRange(note);
  if (!range || !note.from?.sha) return null;
  const refs = [];
  const branch = note.from.branch;
  const isDefault = mainRef && (mainRef === branch || mainRef === `origin/${branch}`);
  // A note dropped on the default branch is checked against the fetched one, not a stale local copy.
  if (branch && !isDefault && gitAnswer(top, ["rev-parse", "-q", "--verify", `refs/heads/${branch}`])) refs.push({ on: branch, ref: `refs/heads/${branch}` });
  if (mainRef) refs.push({ on: mainRef.replace(/^origin\//, ""), ref: mainRef });
  // A path that was never in the note's commit (mistyped, kept with a warning) has no lines to
  // follow. A commit gone after a rebase says nothing about it: the snippet decides then.
  const isKnown = gitAnswer(top, ["cat-file", "-e", `${note.from.sha}^{commit}`]) !== null;
  if (isKnown && gitAnswer(top, ["cat-file", "-e", `${note.from.sha}:${note.at.path}`]) === null) return null;
  for (const { on, ref } of refs) {
    const kind = changeOn(top, note, range, ref, on === branch || !isKnown);
    if (kind) return { on, kind };
  }
  return null;
}

// `bySnippetOnly`: the note's own branch after a rebase, or any branch once its commit is gone.
function changeOn(top, note, range, ref, bySnippetOnly) {
  const { sha } = note.from;
  const path = note.at.path;
  if (gitAnswer(top, ["merge-base", "--is-ancestor", sha, ref]) === null) return bySnippetOnly ? bySnippet(top, note, ref, path) : sinceTheyMet(top, note, range, ref, path);
  const now = whereNow(top, sha, ref, path);
  if (!now) return "removed";
  if (now !== path) return bySnippet(top, note, ref, now);
  const diff = gitAnswer(top, ["diff", "-U0", "--no-color", sha, ref, "--", path]) ?? "";
  return touches(parseHunks(diff), range.first, range.last) ? "changed" : null;
}

// The note's file at ref: the same path, the path it was renamed to, or null when it is gone.
function whereNow(top, sha, ref, path) {
  if (gitAnswer(top, ["cat-file", "-e", `${ref}:${path}`]) !== null) return path;
  const renames = gitAnswer(top, ["diff", "-M", "--name-status", "--diff-filter=R", sha, ref]) ?? "";
  for (const line of renames.split("\n")) {
    const [, from, to] = line.split("\t");
    if (from === path && to) return to;
  }
  return null;
}

// The default branch without the note's commit (it was dropped on a ticket branch with its own
// commits): only what changed there since the two met counts. Lines the ticket wrote itself, or a
// file only the ticket has, were never on the default branch to change.
function sinceTheyMet(top, note, range, ref, path) {
  const base = gitAnswer(top, ["merge-base", note.from.sha, ref]);
  const text = base ? gitText(top, ["show", `${base}:${path}`]) : null;
  const at = text !== null && note.snippet ? findSnippet(text, note.snippet, note.at.line) : null;
  if (at === null) return null;
  const now = whereNow(top, base, ref, path);
  if (!now) return "removed";
  if (now !== path) return bySnippet(top, note, ref, now);
  const diff = gitAnswer(top, ["diff", "-U0", "--no-color", base, ref, "--", path]) ?? "";
  return touches(parseHunks(diff), at, at + range.last - range.first) ? "changed" : null;
}

// Without the note's commit in its own branch's history (a rebase), or after a rename: changed
// unless the snippet is still there.
function bySnippet(top, note, ref, path) {
  const text = gitText(top, ["show", `${ref}:${path}`]);
  if (text === null) return "removed";
  if (!note.snippet) return null;
  return findSnippet(text, note.snippet, note.at.line) === null ? "changed" : null;
}
