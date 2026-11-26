// The suggest command: agents drop notes in the project's box, list them, and claim one solved;
// the session-start hook asks it for the agent instructions. It never files, confirms or switches
// anything: that is the box's, after the user's click.
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canClaim, stateOf, waitsToVerify } from "../../mods/suggestion-box/events.js";
import { age, dropProblem, noteId, parseAt, parseFields, SECTIONS, sameNoteKey, snippetAround } from "../../mods/suggestion-box/notes.js";
import { projectFolder, projectKey, projectName, ticketFor } from "../../mods/suggestion-box/project.js";
import { repoAt, ticketRecords } from "../shared/git.js";
import * as store from "../shared/store.js";

// The checkout: this file sits in cli/suggest/.
const HERE = fileURLToPath(new URL("../..", import.meta.url));
const VERSION = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")).version;
const CARRY_ON = "Carry on with your task.";

class Refusal extends Error {}

// Runs one command; resolves with the exit code. io: { args, stdin (async text), env, cwd, out, err }.
export async function main(io) {
  const [command, ...rest] = io.args;
  try {
    if (command === "--help" || command === "-h" || command === "help") return say(io, usage());
    if (command === "--version") return say(io, VERSION);
    if (command === "session-start") return await sessionStart(io);
    if (command === "list") return list(io, here(io));
    if (command === "solved") return await solved(io, here(io), rest);
    return await drop(io, here(io), io.args);
  } catch (error) {
    if (error instanceof Refusal) {
      io.err(`suggest: ${error.message}\n`);
      return 2;
    }
    const what = command === "list" ? "suggest list" : command === "solved" ? "suggest solved" : "suggest: could not write the note";
    io.err(`${what}: ${error.message}\n`);
    return 1;
  }
}

function say(io, text) {
  io.out(`${text}\n`);
  return 0;
}

// The project the command runs in: its repo, key, box folder and switches.
function here(io) {
  const repo = repoAt(io.cwd);
  if (!repo) throw new Refusal("not in a git repo; the box is per project");
  const key = projectKey(repo.origin, repo.checkout);
  const root = store.boxRoot(io.env);
  return { repo, key, name: projectName(key), dir: join(root, "notes", projectFolder(key)), settings: store.readSettings(root) };
}

async function drop(io, project, args) {
  if (!store.collecting(project.settings, project.key)) {
    return say(io, `The suggestion box is off for ${project.name}. Do not drop notes for the rest of this task; name findings in your final report instead.`);
  }
  const fields = await readFields(io, args, ["title", "at", ...SECTIONS]);
  const problem = dropProblem(fields);
  if (problem) throw new Refusal(problem);
  const at = locate(io, project.repo, fields.at);
  const key = sameNoteKey(fields.title, at?.path);
  const now = new Date();
  let reopened = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = noteId(now, `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`);
    if (store.claimKey(project.dir, key, id)) return fresh(io, project, { fields, at, id, now, key, reopened });
    const answer = await repeat(io, project, key, now);
    if (typeof answer === "number") return answer;
    reopened = answer.reopened ?? reopened;
  }
  throw new Error("the same-note key kept changing; try again");
}

// A new note. Its key was claimed first, so a step that fails takes the key back with it: a
// half-done drop never blocks that title.
function fresh(io, project, { fields, at, id, now, key, reopened }) {
  try {
    const number = store.claimNumber(project.dir);
    store.writeNote(project.dir, { ...newNote({ io, project, fields, at, id, number, now }), ...(reopened ? { reopened } : {}) });
    const open = store.readNotes(project.dir).filter((note) => stateOf(note) === "open").length;
    if (reopened) return say(io, `Note ${reopened.number} was solved on ${reopened.after ?? "a branch"} and has left the box; it is back, so it is note ${number} now (${open} open). ${CARRY_ON}`);
    return say(io, `Dropped in ${project.name}'s suggestion box as note ${number} (${open} open). ${CARRY_ON}`);
  } catch (error) {
    store.dropKey(project.dir, key, id);
    throw error;
  }
}

// The same note again: an event, and an answer that fits the note's state. Returns the exit code,
// or { reopened } when the key has to be claimed anew: it pointed at nothing (a drop that died
// halfway), or at a solved note that is only a tombstone now, which comes back as a new note.
async function repeat(io, project, key, now) {
  const id = store.readKey(project.dir, key);
  const note = await waitForNote(project.dir, id);
  if (!note) {
    store.dropKey(project.dir, key, id);
    return {};
  }
  if (note.tombstone && note.status === "solved") {
    store.dropKey(project.dir, key, id);
    return { reopened: { after: note.solved?.branch ?? null, number: note.number, at: now.toISOString() } };
  }
  store.addEvent(project.dir, note.id, { type: "spotted", at: now.toISOString(), from: origin(io, project.repo) });
  const seen = store.readNote(project.dir, note.id);
  const n = seen.number;
  if (note.status === "solved") return say(io, `Note ${n} was solved on ${note.solved?.branch ?? "a branch"}; reopened it, as you see it again.`);
  if (stateOf(note) === "to verify") return say(io, `Note ${n} is claimed solved and waits for the user to verify. ${CARRY_ON}`);
  if (note.status === "filed") return say(io, `Already filed as #${note.issue?.number} (note ${n}, spotted ${seen.spotted}×). ${CARRY_ON}`);
  if (note.status === "binned") return say(io, `Already binned by the user (note ${n}). ${CARRY_ON}`);
  return say(io, `Already in ${project.name}'s box as note ${n} (spotted ${seen.spotted}×). ${CARRY_ON}`);
}

// Another agent may have claimed the title a moment ago and still be writing its note: null when
// none appears within two seconds.
async function waitForNote(dir, id) {
  for (let tries = 0; id && tries < 50; tries++) {
    const note = store.readNote(dir, id);
    if (note) return note;
    await new Promise((done) => setTimeout(done, 40));
  }
  return null;
}

function newNote({ io, project, fields, at, id, number, now }) {
  return {
    id,
    number,
    project: project.key,
    title: fields.title,
    sections: Object.fromEntries(SECTIONS.map((name) => [name, fields[name]])),
    at: at ? { path: at.path, line: at.line } : null,
    snippet: at?.snippet ?? null,
    from: origin(io, project.repo),
    spotted: 1,
    status: "open",
    check: null,
    draft: null,
    issue: null,
    solved: null,
    created: now.toISOString(),
    updated: now.toISOString(),
  };
}

// Where the agent was when it saw the note.
function origin(io, repo) {
  return {
    branch: repo.branch,
    ticket: ticketFor(repo.branch, ticketRecords(repo.common)),
    sha: repo.sha,
    worktree: repo.top,
    checkout: repo.checkout,
    terminal: io.env.HC_TERMINAL_ID || null,
    agent: io.env.CLAUDECODE ? "claude" : null,
  };
}

// `at` relative to the repo root, with the five lines around its line. The path is read from the
// repo root first, then from the folder the command runs in; a missing file is kept as written.
function locate(io, repo, text) {
  const at = parseAt(text);
  if (!at) return null;
  const candidates = isAbsolute(at.path) ? [at.path] : [join(repo.top, at.path), resolve(io.cwd, at.path)];
  const file = candidates.find((candidate) => existsSync(candidate) && insideRepo(repo, candidate));
  if (!file) {
    io.err(`warning: ${at.path} is not in the repo; kept as written\n`);
    return { path: at.path, line: at.line, snippet: null };
  }
  const snippet = snippetAround(readFileSync(file, "utf8"), at.line);
  return { path: relative(repo.top, file), line: at.line, snippet };
}

function insideRepo(repo, file) {
  const inside = relative(repo.top, file);
  return Boolean(inside) && !inside.startsWith("..") && !isAbsolute(inside);
}

function list(io, project) {
  const now = Date.now();
  const shown = store
    .readNotes(project.dir)
    .filter((note) => ["open", "to verify", "filed"].includes(stateOf(note)))
    .sort((a, b) => b.number - a.number);
  if (!shown.length) return say(io, `${project.name}'s box has no open, to verify or filed notes.`);
  return say(io, shown.map((note) => listLine(note, now)).join("\n"));
}

function listLine(note, now) {
  const where = note.at ? `${note.at.path.split("/").pop()}${note.at.line ? `:${note.at.line}` : ""}` : "-";
  const ticket = note.from?.ticket ? `  (#${note.from.ticket})` : "";
  const state = stateOf(note);
  const tag = state === "to verify" ? "  [to verify]" : state === "filed" ? `  [filed #${note.issue?.number}]` : "";
  return `${note.number}  ${age(note.created, now)}  ${where}  ${note.title}${ticket}${tag}`;
}

async function solved(io, project, args) {
  const number = Number(args[0]);
  const fields = await readFields(io, args.slice(1), ["how", "proof"]);
  if (!fields.how || !fields.proof) throw new Refusal("say what fixed it (how) and the test or check that shows it (proof)");
  const note = store.readNotes(project.dir).find((n) => n.number === number);
  if (!note) throw new Refusal(`${project.name}'s box has no open or filed note ${args[0] ?? "(no number given)"}; suggest list shows them`);
  if (!canClaim(note)) throw new Refusal(`note ${number} is ${refusedState(note)}; nothing changes`);
  const repo = project.repo;
  store.addEvent(project.dir, note.id, { type: "claim", at: new Date().toISOString(), branch: repo.branch, sha: repo.sha, how: fields.how, proof: fields.proof, by: "agent" });
  const short = repo.sha ? ` (${repo.sha.slice(0, 7)})` : "";
  return say(io, `Note ${number} claimed solved on ${repo.branch ?? "a detached HEAD"}${short}; it waits in the box for the user to verify.`);
}

function refusedState(note) {
  if (waitsToVerify(note)) return "already claimed";
  if (note.status === "solved") return "already solved";
  return note.status;
}

// The fields from flags (--title …) when there are any, else from `key: value` lines on stdin.
async function readFields(io, args, known) {
  const flags = parseFlags(args, known);
  if (Object.keys(flags).length) return flags;
  const text = await io.stdin();
  if (!text.trim()) throw new Refusal(`give the fields on stdin (${known.join(", ")}) or as flags; suggest --help shows how`);
  const parsed = parseFields(text, known);
  if (parsed.error) throw new Refusal(parsed.error);
  return parsed.fields;
}

function parseFlags(args, known) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const match = /^--([a-z]+)(?:=(.*))?$/s.exec(args[i]);
    if (!match || !known.includes(match[1])) throw new Refusal(`unknown argument ${args[i]}; suggest --help shows how`);
    flags[match[1]] = (match[2] ?? args[++i] ?? "").trim();
  }
  return flags;
}

// The session-start hook: the instructions, only in a git repo where collecting is on. It never
// fails a session's start: a problem goes to stderr and the session starts without them.
async function sessionStart(io) {
  try {
    const input = JSON.parse((await io.stdin()) || "{}");
    const project = here({ ...io, cwd: input.cwd || io.cwd });
    if (!store.collecting(project.settings, project.key)) return 0;
    const text = readFileSync(join(HERE, "agent-instructions.md"), "utf8");
    io.out(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } })}\n`);
  } catch (error) {
    if (!(error instanceof Refusal)) io.err(`suggest session-start: ${error.message}\n`);
  }
  return 0;
}

function usage() {
  return `suggest ${VERSION}: drop a note in this project's suggestion box.

  suggest <<'EOF'
  title: <what is wrong, one line>
  at: <file>:<line>
  problem: <what is wrong and who or what it hurts>
  evidence: <what you actually saw>
  current: <what the code does now>
  desired: <what should happen instead>
  EOF

  suggest list                 the notes that are open, to verify or filed
  suggest solved <number> <<'EOF'
  how: <what fixed it, one line>
  proof: <the test or check that shows it>
  EOF

The same fields work as flags: suggest --title "…" --at src/a.ts:4 --problem "…" …
A line starting with two spaces continues the field above it.`;
}
