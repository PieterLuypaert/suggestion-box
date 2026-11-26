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

// What the check reads, as git names it: the note's file in the default branch, in its branch, and
// the worktree's uncommitted change to it. A kept check holds while these stay the same.
export function basisOf(top, note, mainRef, branchRef) {
  const blob = (ref) => (ref ? gitAnswer(top, ["rev-parse", "-q", "--verify", `${ref}:${note.at?.path ?? ""}`]) : null);
  const uncommitted = worktreeDiff(note);
  return {
    main: blob(mainRef),
    branch: blob(branchRef),
    worktree: uncommitted ? createHash("sha1").update(uncommitted).digest("hex") : null,
  };
}

function worktreeDiff(note) {
  const dir = note.from?.worktree;
  if (!dir || !note.at?.path || !existsSync(dir)) return "";
  return gitAnswer(dir, ["diff", "--no-color", "--", note.at.path]) ?? "";
}

function branchRefOf(top, note) {
  const branch = note.from?.branch;
  return branch && gitAnswer(top, ["rev-parse", "-q", "--verify", `refs/heads/${branch}`]) ? `refs/heads/${branch}` : null;
}

function diffOf(top, note, ref) {
  if (!ref || !note.from?.sha || !note.at?.path) return "";
  return gitAnswer(top, ["diff", "--no-color", "-M", note.from.sha, ref, "--", note.at.path]) ?? "";
}

// A snapshot of ref's tree in dir, read-only for the check.
function snapshot(top, ref, dir) {
  mkdirSync(dir, { recursive: true });
  if (!ref) return;
  const result = spawnSync("sh", ["-c", 'git -C "$1" archive "$2" | tar -x -C "$3"', "sh", top, ref, dir], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`could not take a snapshot of ${ref}: ${result.stderr.trim()}`);
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
  const viaShell = spawnSync("sh", ["-c", 'exec "${SHELL:-/bin/zsh}" -lc "command -v claude"'], { encoding: "utf8" }).stdout.trim().split("\n").pop();
  if (viaShell?.startsWith("/")) return viaShell;
  throw new Error("Claude Code was not found; install it and run claude once in a terminal to log in");
}

function runClaude(claude, args, cwd, timeout) {
  return new Promise((resolve) => {
    const child = spawn(claude, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
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

// The check of one note: { reused } when the kept check still holds, else the new check, with
// { error } in it when Claude gave no answer. The snapshot folder is removed afterwards.
export async function runCheck({ top, note, env = process.env, now = new Date(), stillHolds }) {
  const fetched = fetch(top);
  const mainRef = defaultRef(top);
  const branchRef = branchRefOf(top, note);
  const basis = basisOf(top, note, mainRef, branchRef);
  if (stillHolds?.(note.check, basis)) return { reused: true };
  const folder = mkdtempSync(join(tmpdir(), "suggestion-box-check-"));
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
    const answer = readAnswer(await runClaude(findClaude(env), claudeArgs(question), folder, timeout));
    const gone = answer.gone ? { ...answer.gone, on: answer.gone.on === "main" ? (mainRef ?? "main").replace(/^origin\//, "") : note.from?.branch ?? "its branch" } : null;
    return { check: { at: now.toISOString(), basis, fetched, ...(answer.error ? { error: answer.error } : { sections: answer.sections, gone }) } };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
