// The proofs of a claim, as git, gh and the person's own Claude find them: the commits since the
// drop that changed the note's lines (followed through moves, renames and a rebase), whether the
// fix landed in main, and the independent check of the fix in a snapshot of the claim's branch.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { githubRepo } from "../mods/suggestion-box/issue.js";
import { findSnippet, noteRange, parseHunks } from "../mods/suggestion-box/lines.js";
import { landedState, mapRange, pickPr, readVerify, touchingLines, verifyArgs, verifyPrompt, VERIFY_TIMEOUT_MS } from "../mods/suggestion-box/proofs.js";
import { defaultRef } from "./changes.js";
import { findClaude, inSnapshots, runClaude, snapshot } from "./claude.js";
import { gh } from "./file.js";
import { gitAnswer, gitText } from "./git.js";

const MAX_COMMITS = 50;
const SHOWN_COMMITS = 3;

const commitOf = (top, ref) => (ref ? gitAnswer(top, ["rev-parse", "-q", "--verify", `${ref}^{commit}`]) : null);
const isDefaultBranch = (branch, mainRef) => Boolean(branch && mainRef && (mainRef === branch || mainRef === `origin/${branch}`));

// The claim's branch as git has it here: the fetched default branch for a claim made on it, else
// the local branch (worktrees share it), else its fetched copy.
export function claimRef(top, branch, mainRef = defaultRef(top)) {
  if (!branch) return null;
  if (isDefaultBranch(branch, mainRef)) return mainRef;
  for (const ref of [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`]) if (commitOf(top, ref)) return ref;
  return null;
}

// Proof 1: { ref, path, commits: [{ sha, subject, lines }] } for the commits since the drop whose
// diff touched the note's lines, oldest first, or { why } when there is nothing to look at.
export function changeProof(top, note, claim, mainRef = defaultRef(top)) {
  const ref = claimRef(top, claim?.branch, mainRef);
  if (!ref) return { why: claim?.branch ? `${claim.branch} is not here, not even fetched` : "the claim names no branch" };
  const start = startOf(top, note, ref, mainRef);
  if (!start) return { ref, why: "the note's lines cannot be found where its branch started" };
  let { range, path } = start;
  const commits = [];
  const log = gitAnswer(top, ["log", "--reverse", "--no-merges", "--format=%H%x09%s", `-${MAX_COMMITS}`, `${start.base}..${ref}`]) ?? "";
  for (const entry of log.split("\n").filter(Boolean)) {
    const [sha, subject] = entry.split("\t");
    const step = stepThrough(top, sha, path, range);
    if (!step) continue;
    if (step.isTouched) commits.push({ sha, subject, lines: step.lines });
    ({ range, path } = step);
    if (step.isGone) break;
  }
  return { ref, path, commits: commits.slice(-SHOWN_COMMITS), more: Math.max(0, commits.length - SHOWN_COMMITS) };
}

// Where the note's lines start: at its own commit when the branch still has it, else (a rebase) at
// the branch's base on the default branch, found by the snippet.
function startOf(top, note, ref, mainRef) {
  const range = noteRange(note);
  const path = note.at?.path;
  if (!range || !path) return null;
  const sha = note.from?.sha;
  if (sha && gitAnswer(top, ["merge-base", "--is-ancestor", sha, ref]) !== null) return { base: sha, range, path };
  const base = mainRef ? gitAnswer(top, ["merge-base", ref, mainRef]) : null;
  const text = base ? gitText(top, ["show", `${base}:${path}`]) : null;
  const at = text && note.snippet ? findSnippet(text, note.snippet, note.at.line) : null;
  return at ? { base, range: { first: at, last: at + range.last - range.first }, path } : null;
}

// One commit's effect on the lines: where they are after it (and under which name), whether it
// changed one, the lines that did, and whether the file went. Null when it did not touch the file.
function stepThrough(top, sha, path, range) {
  const names = gitAnswer(top, ["diff-tree", "-r", "-M", "--no-commit-id", "--name-status", `${sha}^`, sha]);
  if (names === null) return null;
  let next = null;
  for (const line of names.split("\n")) {
    const [status, from, to] = line.split("\t");
    if (from !== path) continue;
    next = status.startsWith("R") ? to : status === "D" ? null : path;
    if (status === "D") return { range, path, isTouched: true, isGone: true, lines: [{ kind: "@", text: `${path} removed` }] };
    break;
  }
  if (next === null) return null;
  const diff = gitAnswer(top, ["diff", "-U0", "--no-color", "-M", `${sha}^`, sha, "--", path, next]) ?? "";
  const moved = mapRange(range, parseHunks(diff));
  return { range: { first: moved.first, last: moved.last }, path: next, isTouched: moved.isTouched, lines: moved.isTouched ? touchingLines(diff, range) : [] };
}

// Proof 3: { state, how, sha? } after asking gh for the branch's PR and git for the solving commit
// in the fetched default branch.
export function landedProof(top, key, claim, change, env, mainRef = defaultRef(top)) {
  const branch = claim?.branch ?? null;
  const isDefault = isDefaultBranch(branch, mainRef);
  const repo = githubRepo(key);
  const prs = repo && branch && !isDefault ? gh(["pr", "list", "--repo", repo, "--head", branch, "--state", "all", "--json", "number,state,url,mergeCommit", "--limit", "10"], { env }) : null;
  const listed = prs?.code === 0 ? JSON.parse(prs.stdout || "[]") : [];
  const pr = pickPr(listed);
  const solving = change?.commits?.at(-1)?.sha ?? claim?.sha ?? null;
  const inMain = solving && mainRef && gitAnswer(top, ["merge-base", "--is-ancestor", solving, mainRef]) !== null ? solving : null;
  const cherry = solving && mainRef && !inMain ? gitAnswer(top, ["cherry", mainRef, solving, `${solving}^`]) : null;
  const samePatch = cherry?.startsWith("- ") ? solving : null;
  const hasBranch = isDefault || Boolean(commitOf(top, `refs/heads/${branch}`)) || remoteHas(top, branch) !== false;
  const found = landedState({ pr: pr && { ...pr, mergeCommit: pr.mergeCommit?.oid ?? null }, inMain, samePatch, hasBranch, isDefault, hasCommit: Boolean(solving) });
  return prs && prs.code !== 0 && found.state !== "landed" ? { ...found, how: `${found.how}; gh could not look for its PR` } : found;
}

// Whether origin still has a branch, asked of origin itself: a fetched copy outlives a branch deleted
// after its merge. null when origin could not be asked (offline): then it is not called gone.
function remoteHas(top, branch) {
  if (!branch) return false;
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes -o ConnectTimeout=10" };
  const result = spawnSync("git", ["-C", top, "ls-remote", "--exit-code", "--heads", "origin", branch], { env, timeout: 20000, encoding: "utf8" });
  if (result.status === 0) return true;
  return result.status === 2 ? false : null;
}

// What the independent check reads, as one hash: the claim branch's diff of the note's file since
// the drop. A kept check holds while it is the same.
export function verifyBasis(top, note, ref) {
  const diff = ref && note.from?.sha && note.at?.path ? gitAnswer(top, ["diff", "--no-color", "-M", note.from.sha, ref, "--", note.at.path]) : null;
  return createHash("sha1").update(`${commitOf(top, ref) ?? ""}\n${diff ?? ""}`).digest("hex");
}

// Proof 2: the person's own Claude reads the claim's branch in a snapshot, with the note, the claim
// and the change, and answers Verified, Partly or Not fixed.
export async function runVerify({ top, note, change, env = process.env, now = new Date(), again = false, holds }) {
  const ref = change?.ref ?? claimRef(top, note.solved?.branch);
  if (!ref) return { verify: { at: now.toISOString(), error: change?.why ?? "the claim's branch is not here" } };
  const basis = verifyBasis(top, note, ref);
  if (!again && holds?.(note.verify, basis)) return { reused: true };
  return inSnapshots(async (folder) => {
    snapshot(top, ref, join(folder, "branch"));
    const timeout = Number(env.SUGGESTION_BOX_CHECK_TIMEOUT_MS) || VERIFY_TIMEOUT_MS;
    const answer = readVerify(await runClaude(findClaude(env), verifyArgs(verifyPrompt(note, note.solved, change)), folder, timeout), timeout);
    return { verify: { at: now.toISOString(), basis, ...answer } };
  });
}

// The note's file as the solving commit has it, in a temporary file for the editor: { file, line }.
export function fileAt(top, sha, path, line) {
  const text = gitText(top, ["show", `${sha}:${path}`]);
  if (text === null) return { error: `${path} is not in ${sha.slice(0, 7)}` };
  const dir = join(tmpdir(), "suggestion-box-files", sha.slice(0, 12));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, basename(path));
  writeFileSync(file, text);
  return { file, line: line ?? null };
}
