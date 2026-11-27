// Fix in new tab, through the parallel-tickets launcher: whether it is there and knows --space, a
// free branch from `issues branch`, and `issues launch --space`, which opens the ticket's tab the
// way every parallel ticket starts. The launcher runs through the person's login shell, so it finds
// gh, git, hagent and herdr-app as in a terminal of theirs. The box builds nothing by hand.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { nameArgs, nameExamples, namePrompt, nameTypes, NAME_TIMEOUT_MS, readName } from "../../mods/suggestion-box/branch-name.js";
import { filingTarget } from "../../mods/suggestion-box/config.js";
import { branchCandidates, fixGate, lastLine, pickBranch, readLaunch } from "../../mods/suggestion-box/fix.js";
import { githubRepo } from "../../mods/suggestion-box/issue.js";
import { configText } from "./file.js";
import { defaultRef } from "./changes.js";
import { findClaude, inSnapshots, runClaude } from "./claude.js";

// A launch fetches, makes a worktree and opens a tab: minutes at most.
const LAUNCH_MS = 240000;
const BRANCH_MS = 60000;

// The launcher: SUGGESTION_BOX_LAUNCHER (the tests' stand-in), else the parallel-tickets skill's.
export function launcherPath(env = process.env) {
  return env.SUGGESTION_BOX_LAUNCHER || join(homedir(), ".claude", "skills", "parallel-tickets", "scripts", "issues");
}

// { can, why } for a project, before any button shows. A launcher that cannot be read is no
// launcher: the rest of the box never depends on it.
export function gateFor(top, key, env = process.env) {
  const launcher = launcherPath(env);
  const text = readable(launcher);
  const hasLauncher = text !== null;
  const config = filingTarget(configText(top, defaultRef(top)));
  return fixGate({
    hasLauncher,
    hasHagent: existsSync(join(dirname(launcher), "hagent")),
    knowsSpace: /--space\)/.test(text ?? ""),
    originRepo: githubRepo(key),
    tracker: config ? { kind: config.kind, repo: config.repo } : null,
  });
}

function readable(file) {
  try {
    return existsSync(file) ? readFileSync(file, "utf8") : null;
  } catch {
    return null;
  }
}

// The person's login shell when it speaks sh ("$0" and "$@"), else zsh, macOS's own.
export function loginShell(env = process.env) {
  const shell = env.SHELL || process.env.SHELL || "";
  return /\/(?:sh|bash|zsh|dash|ksh)$/.test(shell) ? shell : "/bin/zsh";
}

// The launcher with these arguments, from the project's folder, through the person's login shell.
function launch(top, args, env, timeout) {
  const shell = loginShell(env);
  const clean = { ...process.env, ...env };
  // A panel's own context is not where the tab goes: --space says that.
  for (const name of ["HERDR_ACTIVE_WORKSPACE_ID", "HERDR_ACTIVE_PANE_CWD", "HERDR_WORKSPACE_ID", "HERDR_TAB_ID", "HERDR_ENV"]) delete clean[name];
  const result = spawnSync(shell, ["-lc", 'exec bash "$0" "$@"', launcherPath(env), ...args], { cwd: top, env: clean, encoding: "utf8", timeout });
  return { code: result.status, stdout: result.stdout ?? "", stderr: (result.stderr ?? "") || (result.error ? result.error.message : "") };
}

// The person's Claude's name for the fix's branch, with the repo's tickets as examples, or null: the
// box then names it from the title's words. It runs in an empty folder of its own, so no CLAUDE.md,
// memory or project of theirs comes in; the folder goes also when the panel stops the run. Never
// throws: the fix has started by now, and a name is never a reason for it to stop.
export async function claudeBranch(ticket, records, env) {
  try {
    const claude = findClaude(env);
    const examples = nameExamples(records);
    const types = nameTypes(examples);
    const question = namePrompt(ticket, examples, types);
    const answer = readName(await inSnapshots((folder) => runClaude(claude, nameArgs(question), folder, NAME_TIMEOUT_MS)), types);
    if (answer.error) process.stderr.write(`box.js: Claude did not name the branch, so the title does: ${answer.error}\n`);
    return answer.branch ?? null;
  } catch (error) {
    process.stderr.write(`box.js: the branch is named from the title: ${error.message}\n`);
    return null;
  }
}

// A free branch for the note: { branch } or { error }. Claude's name first when there is one, with
// -2 and -3 for a name that is taken, then the names from the title's words.
export function freeBranch(top, title, env, preferred = null) {
  const names = preferred ? [preferred, `${preferred}-2`, `${preferred}-3`] : [];
  for (const name of branchCandidates(title)) if (!names.includes(name)) names.push(name);
  const answer = launch(top, ["branch", ...names], env, BRANCH_MS);
  const branch = pickBranch(answer.stdout);
  return branch ? { branch } : { error: answer.code === 1 ? `no free branch name for "${title}"; tried ${names.join(", ")}` : lastLine(answer.stderr, answer.stdout) };
}

// Opens the ticket's tab: { tab, pane, branch } or { error } with the launcher's last line.
export function launchFix(top, { space, ticket, branch }, env) {
  const answer = launch(top, ["launch", "--space", space, "--ticket", String(ticket), "--branch", branch], env, LAUNCH_MS);
  const opened = answer.code === 0 ? readLaunch(answer.stdout) : null;
  return opened ?? { error: answer.code === null ? "the launcher took longer than four minutes" : lastLine(answer.stderr, answer.stdout) };
}
