// What the suggest command asks git about the folder it runs in.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// git's answer, or null when git says no: outside a repo, no origin, no commit yet. Those are
// answers the command handles, not errors, so git's own message is not shown.
export function gitAnswer(cwd, args) {
  try {
    // Room for a long answer (a busy repo's commit list): a cut-off answer would read as none.
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).trim();
  } catch {
    return null;
  }
}

// A file's text as git has it, or null: untrimmed, so a file that starts with blank lines keeps its
// line numbers.
export function gitText(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

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

// The repo around a folder, or null outside one.
export function repoAt(cwd) {
  const top = gitAnswer(cwd, ["rev-parse", "--show-toplevel"]);
  if (!top) return null;
  // --path-format needs git 2.31; older git gives the folder relative to cwd.
  const common = gitAnswer(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
    ?? resolve(cwd, gitAnswer(cwd, ["rev-parse", "--git-common-dir"]) ?? ".git");
  return {
    top,
    common,
    checkout: common.endsWith("/.git") ? dirname(common) : common,
    origin: gitAnswer(cwd, ["remote", "get-url", "origin"]),
    branch: gitAnswer(cwd, ["symbolic-ref", "--short", "-q", "HEAD"]),
    sha: gitAnswer(cwd, ["rev-parse", "HEAD"]),
  };
}

// parallel-tickets' records of the tickets it launched in this repo, each { ticket, branch }.
export function ticketRecords(common) {
  const folder = join(common, "herdr-parallel-issues");
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readRecord(join(folder, name)))
    .filter(Boolean);
}

function readRecord(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    process.stderr.write(`suggest: skipped ${file}: ${error.message}\n`);
    return null;
  }
}
