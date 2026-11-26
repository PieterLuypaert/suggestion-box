// Running the check for one note: fetch, two read-only snapshots of the code (the default branch and
// the note's branch, with git archive), the note's diffs, and the person's own `claude -p` in that
// snapshot folder, which keeps every CLAUDE.md, memory and setting of theirs out of it.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeArgs, prompt, readAnswer, TIMEOUT_MS } from "../../mods/suggestion-box/check.js";
import { defaultRef } from "./changes.js";
import { fetch, findClaude, inSnapshots, runClaude, snapshot } from "./claude.js";
import { gitAnswer } from "../shared/git.js";

export { findClaude, stopRunning } from "./claude.js";

// What the check reads, as git names it: the commit of the default branch, of the note's branch,
// and the worktree's uncommitted change to the note's file. Claude reads the whole snapshot, so a
// kept check holds only while none of these moved.
export function basisOf(top, note, mainRef, branchRef) {
  const commit = (ref) => (ref ? gitAnswer(top, ["rev-parse", "-q", "--verify", `${ref}^{commit}`]) : null);
  const uncommitted = worktreeDiff(note);
  return {
    main: commit(mainRef),
    branch: commit(branchRef),
    worktree: uncommitted ? createHash("sha1").update(uncommitted).digest("hex") : null,
  };
}

function worktreeDiff(note) {
  const dir = note.from?.worktree;
  if (!dir || !note.at?.path || !existsSync(dir)) return "";
  return gitAnswer(dir, ["diff", "--no-color", "--", note.at.path]) ?? "";
}

// The note's branch, unless it is the default branch: then main/ is the fetched default branch and
// a stale local copy would only mislead.
function branchRefOf(top, note, mainRef) {
  const branch = note.from?.branch;
  if (!branch || mainRef === branch || mainRef === `origin/${branch}`) return null;
  return gitAnswer(top, ["rev-parse", "-q", "--verify", `refs/heads/${branch}`]) ? `refs/heads/${branch}` : null;
}

function diffOf(top, note, ref) {
  if (!ref || !note.from?.sha || !note.at?.path) return "";
  return gitAnswer(top, ["diff", "--no-color", "-M", note.from.sha, ref, "--", note.at.path]) ?? "";
}

// The check of one note: { reused } when the kept check still holds (never when asked again), else
// the new check, with { error } in it when Claude gave no answer. The snapshot folder is removed
// afterwards.
export async function runCheck({ top, note, env = process.env, now = new Date(), stillHolds, again = false }) {
  const fetched = fetch(top);
  const mainRef = defaultRef(top);
  const branchRef = branchRefOf(top, note, mainRef);
  const basis = basisOf(top, note, mainRef, branchRef);
  if (!again && stillHolds?.(note.check, basis)) return { reused: true };
  return inSnapshots(async (folder) => {
    snapshot(top, mainRef, join(folder, "main"));
    snapshot(top, branchRef, join(folder, "branch"));
    const question = prompt(note, {
      mainRef,
      branch: note.from?.branch,
      diffs: { main: diffOf(top, note, mainRef), branch: diffOf(top, note, branchRef) },
      worktreeDiff: worktreeDiff(note),
    });
    const timeout = Number(env.SUGGESTION_BOX_CHECK_TIMEOUT_MS) || TIMEOUT_MS;
    const answer = readAnswer(await runClaude(findClaude(env), claudeArgs(question), folder, timeout), timeout);
    const gone = goneOn(answer.gone, mainRef, branchRef, note);
    return { check: { at: now.toISOString(), basis, fetched, ...(answer.error ? { error: answer.error } : { sections: answer.sections, gone }) } };
  });
}

// Where the problem is gone, by name. Gone on a branch the check had no snapshot of means nothing.
function goneOn(gone, mainRef, branchRef, note) {
  if (!gone) return null;
  if (gone.on === "main") return { ...gone, on: (mainRef ?? "main").replace(/^origin\//, "") };
  return branchRef && note.from?.branch ? { ...gone, on: note.from.branch } : null;
}
