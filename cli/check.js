// Running the check for one note: fetch, two read-only snapshots of the code (the default branch and
// the note's branch, with git archive), the note's diffs, and the person's own `claude -p` in that
// snapshot folder, which keeps every CLAUDE.md, memory and setting of theirs out of it.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { claudeArgs, prompt, readAnswer, TIMEOUT_MS } from "../mods/suggestion-box/check.js";
import { defaultRef } from "./changes.js";
import { gitAnswer } from "./git.js";

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

const SNAPSHOT_MS = 45000;

// A snapshot of ref's tree in dir, read-only for the check: archived to a file first, so a failing
// archive is an error and never an empty snapshot.
function snapshot(top, ref, dir) {
  mkdirSync(dir, { recursive: true });
  if (!ref) return;
  const tar = `${dir}.tar`;
  const archive = spawnSync("git", ["-C", top, "archive", "-o", tar, ref], { encoding: "utf8", timeout: SNAPSHOT_MS });
  if (archive.status !== 0) throw new Error(`could not take a snapshot of ${ref}: ${archive.stderr?.trim() || "git archive took too long"}`);
  const unpack = spawnSync("tar", ["-x", "-f", tar, "-C", dir], { encoding: "utf8", timeout: SNAPSHOT_MS });
  rmSync(tar, { force: true });
  if (unpack.status !== 0) throw new Error(`could not unpack the snapshot of ${ref}: ${unpack.stderr?.trim() || "tar took too long"}`);
}

// Fetches origin, never waiting on a prompt for a password or a host key, for 20 seconds at most.
// Without origin or offline the check reads what was fetched last.
function fetch(top) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes -o ConnectTimeout=10" };
  const result = spawnSync("git", ["-C", top, "fetch", "--quiet", "origin"], { env, timeout: 20000, encoding: "utf8" });
  return result.status === 0;
}

// claude, wherever it is: SUGGESTION_BOX_CLAUDE (the tests' stand-in), the PATH, the usual places,
// then the person's login shell, for an app started from the Dock with the short PATH macOS gives it.
export function findClaude(env = process.env) {
  if (env.SUGGESTION_BOX_CLAUDE) return env.SUGGESTION_BOX_CLAUDE;
  const home = homedir();
  for (const place of [`${home}/.local/bin/claude`, "/opt/homebrew/bin/claude", "/usr/local/bin/claude", `${home}/.claude/local/claude`]) {
    if (existsSync(place)) return place;
  }
  const onPath = spawnSync("sh", ["-c", "command -v claude"], { encoding: "utf8" }).stdout.trim();
  if (onPath) return onPath;
  const viaShell = spawnSync("sh", ["-c", 'exec "${SHELL:-/bin/zsh}" -lc "command -v claude"'], { encoding: "utf8", timeout: 10000 }).stdout?.trim().split("\n").pop();
  if (viaShell?.startsWith("/")) return viaShell;
  throw new Error("Claude Code was not found; install it and run claude once in a terminal to log in");
}

// The snapshot folder and claude of a check that is running, so a stop (the panel giving up) still
// removes the one and ends the other.
const running = { folder: null, child: null };
export function stopRunning() {
  running.child?.kill("SIGTERM");
  if (running.folder) rmSync(running.folder, { recursive: true, force: true });
}

function runClaude(claude, args, cwd, timeout) {
  return new Promise((resolve) => {
    const child = spawn(claude, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    running.child = child;
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ code: null, stdout: "", stderr: "timed out" });
    }, timeout);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: null, stdout: "", stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
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
  const folder = mkdtempSync(join(tmpdir(), "suggestion-box-check-"));
  running.folder = folder;
  try {
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
  } finally {
    rmSync(folder, { recursive: true, force: true });
    running.folder = null;
    running.child = null;
  }
}

// Where the problem is gone, by name. Gone on a branch the check had no snapshot of means nothing.
function goneOn(gone, mainRef, branchRef, note) {
  if (!gone) return null;
  if (gone.on === "main") return { ...gone, on: (mainRef ?? "main").replace(/^origin\//, "") };
  return branchRef && note.from?.branch ? { ...gone, on: note.from.branch } : null;
}
