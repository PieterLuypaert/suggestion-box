// What the check and the independent check of a fix share: a fetch that never waits on a prompt,
// read-only snapshots of the code in a temporary folder, and the person's own `claude -p` run in that
// folder, which keeps every CLAUDE.md, memory and setting of theirs out of it.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const SNAPSHOT_MS = 45000;

// A snapshot of ref's tree in dir, read-only for the check: archived to a file first, so a failing
// archive is an error and never an empty snapshot.
export function snapshot(top, ref, dir) {
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
export function fetch(top) {
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

export function runClaude(claude, args, cwd, timeout) {
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

// A temporary folder for snapshots, given to `work` and removed afterwards, also when the panel
// stops the run.
export async function inSnapshots(work) {
  const folder = mkdtempSync(join(tmpdir(), "suggestion-box-check-"));
  running.folder = folder;
  try {
    return await work(folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
    running.folder = null;
    running.child = null;
  }
}
