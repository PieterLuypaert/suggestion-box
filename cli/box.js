#!/usr/bin/env node
// The box's own side, run by the Herdr mod: reading a project's notes for the panel, the user's
// actions on them, the collecting switches, and turning old notes into tombstones. Only this side
// rewrites a note; the suggest command only ever creates files. It is not on the PATH and not
// under the agents' permission rule: agents never run it. Every answer is one line of JSON.
//
//   node cli/box.js read <folder> [--changes]
//   node cli/box.js act <folder> <note id> <action> [--branch b] [--sha s] [--reason r]
//   node cli/box.js check <folder> <note id> [--again]
//   node cli/box.js target <folder> <note id>
//   node cli/box.js draft <folder> <note id> <{"title","sections","fine","notGone"} as JSON, or null>
//   node cli/box.js file <folder> <note id> <{"title","sections","fine","notGone","repo"} as JSON>
//   node cli/box.js board <folder> <note id>
//   node cli/box.js proofs <folder> <note id>
//   node cli/box.js verify <folder> <note id> [--again]
//   node cli/box.js watch <folder>
//   node cli/box.js show <folder> <sha> <path> [line]
//   node cli/box.js fix <folder> <note id> <space id>
//   node cli/box.js collecting <folder> on|off [--all | --key <project key>]
//   node cli/box.js projects <folder> [<space folder>...]
//   node cli/box.js prune <folder>
//
// This file only routes a command to its module in cli/box/.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { projectFolder, projectKey, projectName } from "../mods/suggestion-box/project.js";
import { stopRunning } from "./box/check.js";
import { fileAt } from "./box/proofs.js";
import { repoAt } from "./shared/git.js";
import { boxRoot } from "./shared/store.js";
import { act, check, prune } from "./box/act.js";
import { proofs, verify, watch } from "./box/claims.js";
import { board, draft, file, target } from "./box/filing.js";
import { fix } from "./box/fixing.js";
import { projects, read } from "./box/read.js";
import { switchCollecting } from "./box/settings.js";

export async function run(args, env = process.env, now = new Date()) {
  const [command, folder, ...rest] = args;
  const project = projectAt(folder, env);
  if (command === "read") return read(project, rest.includes("--changes"), now, env);
  if (command === "projects") return projects(project, rest, env);
  // A switch by key or for every project needs no repo here; one for the project here does.
  if (command === "collecting" && ["--key", "--all"].includes(rest[1])) return switchCollecting(project, rest, env);
  if (!project.dir) return { error: project.why };
  if (command === "act") return act(project, rest, now, env);
  if (command === "check") return check(project, rest[0], env, now, rest.includes("--again"));
  if (command === "target") return target(project, rest[0], env);
  if (command === "draft") return draft(project, rest[0], rest[1], now);
  if (command === "file") return file(project, rest[0], rest[1], env, now);
  if (command === "board") return board(project, rest[0], env, now);
  if (command === "proofs") return proofs(project, rest[0], env);
  if (command === "verify") return verify(project, rest[0], env, now, rest.includes("--again"));
  if (command === "watch") return watch(project, env, now);
  if (command === "show") return fileAt(project.repo.top, rest[0], rest[1], Number(rest[2]) || null);
  if (command === "fix") return fix(project, rest[0], rest[1], env, now);
  if (command === "collecting") return switchCollecting(project, rest, env);
  if (command === "prune") return prune(project, now);
  return { error: `unknown command ${command}` };
}

// The project around a folder, or { why } outside a git repo.
function projectAt(folder, env) {
  const repo = folder ? repoAt(folder) : null;
  if (!repo) return { why: "no git repo here" };
  const key = projectKey(repo.origin, repo.checkout);
  const root = boxRoot(env);
  return { repo, key, name: projectName(key), root, dir: join(root, "notes", projectFolder(key)) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // The panel gave up waiting: end a running check's claude and remove its snapshot folder.
  process.on("SIGTERM", () => {
    stopRunning();
    process.exit(143);
  });
  try {
    const answer = await run(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(answer)}\n`);
    process.exitCode = answer.error ? 1 : 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exitCode = 1;
  }
}
