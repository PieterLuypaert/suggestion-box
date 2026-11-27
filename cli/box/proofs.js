// The proofs of a claim, as git, gh and the person's own Claude find them: the commits since the
// drop that changed the note's lines (followed through moves, renames and a rebase), whether the
// fix landed in main, and the independent check of the fix in a snapshot of the claim's branch.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { githubRepo } from "../../mods/suggestion-box/issue.js";
import { findSnippet, noteRange, parseHunks } from "../../mods/suggestion-box/lines.js";
import { landedState, mapRange, pickPr, readVerify, touchingLines, verifyArgs, verifyPrompt, VERIFY_TIMEOUT_MS } from "../../mods/suggestion-box/proofs.js";
import { defaultRef } from "./changes.js";
import { findClaude, inSnapshots, runClaude, snapshot } from "./claude.js";
import { gh } from "./file.js";
import { gitAnswer, gitText } from "../shared/git.js";
import { DAY } from "./note-files.js";

const SHOWN_COMMITS = 3;
// The branch's other changes kept for the panel and the independent check.
const ELSEWHERE_KEPT = 10;

const commitOf = (top, ref) => (ref ? gitAnswer(top, ["rev-parse", "-q", "--verify", `${ref}^{commit}`]) : null);
const isDefaultBranch = (branch, mainRef) => Boolean(branch && mainRef && (mainRef === branch || mainRef === `origin/${branch}`));

// The claim's branch as git has it here: the ref that holds the claimed commit, so a fix committed
// but not pushed yet is seen. For the default branch the local one or the fetched one, else for
// another branch the local one (worktrees share it) or its fetched copy.
export function claimRef(top, branch, mainRef = defaultRef(top), sha = null) {
  if (!branch) return null;
  const isDefault = isDefaultBranch(branch, mainRef);
  const refs = isDefault ? [`refs/heads/${branch}`, mainRef] : [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`];
  const there = refs.filter((ref) => commitOf(top, ref));
  const holding = sha ? there.find((ref) => gitAnswer(top, ["merge-base", "--is-ancestor", sha, ref]) !== null) : null;
  return holding ?? (isDefault ? mainRef : there[0] ?? null);
}

// Proof 1: { ref, path, commits: [{ sha, subject, lines, path, at }], elsewhere, elsewhereMore } for
// the commits since the drop whose diff touched the note's lines, oldest first, or { why } when there
// is nothing to look at. The branch is walked along its first parents: a merge of main into it moves
// the lines like any commit, but is never taken for the fix. A fix often lands elsewhere than the
// lines the note names: `elsewhere` holds the claim branch's own other changes, its commits that are
// not on the default branch's own line (its first parents), so a teammate's work in between never
// counts, and a fix merged since (merge, squash or rebase) still does.
export function changeProof(top, note, claim, mainRef = defaultRef(top)) {
  const ref = claimRef(top, claim?.branch, mainRef, claim?.sha);
  if (!ref) return { why: claim?.branch ? `${claim.branch} is not here, not even fetched` : "the claim names no branch" };
  const start = startOf(top, note, ref, mainRef, claim?.branch === note.from?.branch);
  if (!start) return { ref, why: "the note's lines cannot be found where its branch started" };
  let { range, path } = start;
  const commits = [];
  const elsewhere = [];
  const isOwnBranch = !isDefaultBranch(claim?.branch, mainRef);
  // A fix branch other than the note's own may start from a newer main: main's commits in between
  // only move the lines, and a teammate's change there is never this fix. (On the note's own branch
  // the walk starts at the note's commit, so a fast-forward merge keeps its fix.)
  const isOtherBranch = isOwnBranch && claim?.branch !== note.from?.branch;
  const mainLine = isOwnBranch && mainRef ? new Set((gitAnswer(top, ["rev-list", "--first-parent", mainRef, `^${start.base}`]) ?? "").split("\n").filter(Boolean)) : new Set();
  for (const commit of commitsOn(top, `${start.base}..${ref}`)) {
    const step = stepThrough(top, commit, path, range);
    if (!step || !step.isTouched) {
      if (isOwnBranch && !mainLine.has(commit.sha) && !commit.isMerge && commit.files.length) elsewhere.push({ sha: commit.sha, subject: commit.subject, files: commit.files.map((file) => file.to ?? file.from) });
    } else if (!commit.isMerge && !(isOtherBranch && mainLine.has(commit.sha))) {
      commits.push({ sha: commit.sha, subject: commit.subject, lines: step.lines, path: step.shownPath, at: step.shownAt });
    }
    if (!step) continue;
    ({ range, path } = step);
    if (step.isGone) break;
  }
  return { ref, path, commits: commits.slice(-SHOWN_COMMITS), more: Math.max(0, commits.length - SHOWN_COMMITS), elsewhere: elsewhere.slice(-ELSEWHERE_KEPT), elsewhereMore: Math.max(0, elsewhere.length - ELSEWHERE_KEPT) };
}

// The first-parent commits of a range, oldest first, each with the files it changed against its
// first parent (renames found): one git call, however long the branch.
function commitsOn(top, range) {
  const log = gitAnswer(top, ["log", "--first-parent", "-m", "-M", "--reverse", "--name-status", "--format=%x00%H%x09%P%x09%s", range]) ?? "";
  return log.split("\0").filter((chunk) => chunk.trim()).map((chunk) => {
    const [head, ...rest] = chunk.split("\n");
    const [sha, parents, subject] = head.split("\t");
    const files = rest.filter(Boolean).map((line) => {
      const [status, from, to] = line.split("\t");
      return { status, from, to };
    });
    const list = (parents ?? "").split(" ").filter(Boolean);
    return { sha, parent: list[0] ?? null, isMerge: list.length > 1, subject: subject ?? "", files };
  });
}

// Where the note's lines start: at its own commit when the branch still has it. Else, found by the
// snippet: on the note's own branch after a rebase, at the branch's base on the default branch; on
// another branch (main, when the fix went there), where that branch and the note's commit meet.
function startOf(top, note, ref, mainRef, isNotesBranch) {
  const range = noteRange(note);
  const path = note.at?.path;
  if (!range || !path) return null;
  const sha = note.from?.sha;
  if (sha && gitAnswer(top, ["merge-base", "--is-ancestor", sha, ref]) !== null) return { base: sha, range, path };
  const isKnown = Boolean(sha) && gitAnswer(top, ["cat-file", "-e", `${sha}^{commit}`]) !== null;
  const base = isKnown && !isNotesBranch ? gitAnswer(top, ["merge-base", sha, ref]) : mainRef ? gitAnswer(top, ["merge-base", ref, mainRef]) : null;
  const text = base ? gitText(top, ["show", `${base}:${path}`]) : null;
  const at = text && note.snippet ? findSnippet(text, note.snippet, note.at.line) : null;
  return at ? { base, range: { first: at, last: at + range.last - range.first }, path } : null;
}

// One commit's effect on the lines: where they are after it (and under which name), whether it
// changed one, the lines that did, where Open finds them, and whether the file went. Null when the
// commit did not touch the file.
function stepThrough(top, commit, path, range) {
  const file = commit.files.find((one) => one.from === path);
  if (!file || !commit.parent) return null;
  if (file.status === "D") {
    return { range, path, isTouched: true, isGone: true, lines: [{ kind: "@", text: `${path} removed` }], shownPath: path, shownAt: commit.parent };
  }
  const next = file.status.startsWith("R") ? file.to : path;
  const diff = gitAnswer(top, ["diff", "-U0", "--no-color", "-M", commit.parent, commit.sha, "--", path, next]) ?? "";
  const moved = mapRange(range, parseHunks(diff));
  const lines = moved.isTouched ? touchingLines(diff, range) : [];
  return { range: { first: moved.first, last: moved.last }, path: next, isTouched: moved.isTouched, lines, shownPath: next, shownAt: commit.sha };
}

// Proof 3: { state, how, sha? } after asking gh for the branch's PR and git for the solving commit
// in the fetched default branch. `since` is when the note was dropped, `from` the commit it was
// dropped on.
export function landedProof(top, key, claim, change, env, { mainRef = defaultRef(top), since = null, from = null } = {}) {
  const branch = claim?.branch ?? null;
  const isDefault = isDefaultBranch(branch, mainRef);
  const repo = githubRepo(key);
  const prs = repo && branch && !isDefault ? gh(["pr", "list", "--repo", repo, "--head", branch, "--state", "all", "--json", "number,state,url,mergeCommit,mergedAt,closedAt", "--limit", "10"], { env }) : null;
  const listed = prs?.code === 0 ? parsed(prs.stdout) : null;
  const knowsPrs = Boolean(listed);
  const pr = pickPr(listed ?? [], since);
  const claimed = isFixCommit(top, claim, from, isDefault) ? claim.sha : null;
  const solving = change?.commits?.at(-1)?.sha ?? change?.elsewhere?.at(-1)?.sha ?? claimed;
  const inMain = solving && mainRef && gitAnswer(top, ["merge-base", "--is-ancestor", solving, mainRef]) !== null ? solving : null;
  const cherry = solving && mainRef && !inMain ? gitAnswer(top, ["cherry", mainRef, solving, `${solving}^`]) : null;
  const samePatch = cherry?.startsWith("- ") ? solving : null;
  const hasBranch = isDefault || Boolean(commitOf(top, `refs/heads/${branch}`)) || remoteHas(top, branch) !== false;
  // You marked it solved on main itself (from the check's banner or a change on main): main is
  // where it lands, so it has, also without a commit that touched its lines.
  const isYoursOnMain = isDefault && claim?.by === "you";
  const found = landedState({ pr: pr && { ...pr, mergeCommit: pr.mergeCommit?.oid ?? null }, inMain, samePatch, hasBranch, isDefault, hasCommit: Boolean(solving), knowsPrs, isYoursOnMain });
  return prs && !knowsPrs && found.state === "waiting" && hasBranch ? { ...found, how: `${found.how}; gh could not look for its PR` } : found;
}

// Whether the commit an agent claimed on can be its fix: made after the drop (an agent that claims
// before committing claims on the commit it started from), and on a branch its own work when it
// claimed (`own`, which suggest records; a fresh branch starts on one of main's commits).
function isFixCommit(top, claim, from, isDefault) {
  const sha = claim?.sha;
  if (!sha) return false;
  if (from && (sha === from || gitAnswer(top, ["merge-base", "--is-ancestor", sha, from]) !== null)) return false;
  return isDefault || claim.own !== false;
}

// gh's JSON answer, or null when it gave something else.
function parsed(text) {
  try {
    const value = JSON.parse(text || "[]");
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
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
  const dir = join(copiesDir(), sha.slice(0, 12));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, basename(path));
  writeFileSync(file, text);
  return { file, line: line ?? null };
}

const copiesDir = () => join(tmpdir(), "suggestion-box-files");

// The copies fileAt made, once a day has passed since anything in their folder was written: the
// editor read them long before. What cannot be read or removed stays and is told on stderr, so the
// notes' prune always goes on.
export function pruneCopies(now) {
  const dir = copiesDir();
  let names = [];
  try {
    names = existsSync(dir) ? readdirSync(dir) : [];
  } catch (error) {
    process.stderr.write(`box.js: the copies in ${dir} stay: ${error.message}\n`);
  }
  for (const name of names) {
    const folder = join(dir, name);
    try {
      if (now - newest(folder) >= COPIES_KEPT_MS) rmSync(folder, { recursive: true, force: true });
    } catch (error) {
      process.stderr.write(`box.js: ${folder} stays: ${error.message}\n`);
    }
  }
}

const COPIES_KEPT_MS = DAY;

// When anything in the folder was last written; a folder a second prune removed meanwhile counts
// as long ago.
function newest(path) {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) return stat?.mtimeMs ?? 0;
  const written = readdirSync(path).map((name) => statSync(join(path, name), { throwIfNoEntry: false })?.mtimeMs ?? 0);
  return Math.max(stat.mtimeMs, ...written);
}
