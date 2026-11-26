// Whether a note's code changed since the drop, on the branch it was dropped on or on the default
// branch: plain git, no Claude. The note's lines are mapped forward through `git diff -U0 -M`, or,
// when its commit is gone after a rebase, its snippet is looked for instead.
import { findSnippet, noteRange, parseHunks, touches } from "../mods/suggestion-box/lines.js";
import { gitAnswer } from "./git.js";

// The default branch as the repo last fetched it: origin/HEAD, else origin/main or origin/master,
// else a local main or master. Null when there is none.
export function defaultRef(top) {
  const head = gitAnswer(top, ["symbolic-ref", "-q", "refs/remotes/origin/HEAD"]);
  if (head) return head.replace(/^refs\/remotes\//, "");
  for (const ref of ["origin/main", "origin/master", "main", "master"]) {
    if (gitAnswer(top, ["rev-parse", "-q", "--verify", `${ref}^{commit}`])) return ref;
  }
  return null;
}

// { on, kind } when the note's lines changed ("changed") or its file is gone ("removed") on its own
// branch or on the default branch, else null. A note without a file, line or commit has no lines.
export function changeFor(top, note, mainRef = defaultRef(top)) {
  const range = noteRange(note);
  if (!range || !note.from?.sha) return null;
  const refs = [];
  const branch = note.from.branch;
  if (branch && gitAnswer(top, ["rev-parse", "-q", "--verify", `refs/heads/${branch}`])) refs.push({ on: branch, ref: `refs/heads/${branch}` });
  if (mainRef && mainRef !== branch && `origin/${branch}` !== mainRef) refs.push({ on: mainRef.replace(/^origin\//, ""), ref: mainRef });
  for (const { on, ref } of refs) {
    const kind = changeOn(top, note, range, ref);
    if (kind) return { on, kind };
  }
  return null;
}

function changeOn(top, note, range, ref) {
  const { sha } = note.from;
  const path = note.at.path;
  if (gitAnswer(top, ["merge-base", "--is-ancestor", sha, ref]) === null) return bySnippet(top, note, ref, path);
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

// Without the note's commit in ref's history (a rebase), or after a rename: changed unless the
// snippet is still there.
function bySnippet(top, note, ref, path) {
  const text = gitAnswer(top, ["show", `${ref}:${path}`]);
  if (text === null) return "removed";
  if (!note.snippet) return null;
  return findSnippet(text, note.snippet, note.at.line) === null ? "changed" : null;
}
