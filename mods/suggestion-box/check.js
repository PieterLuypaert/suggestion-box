// The check: your own Claude reads a note's four sections against the code and says, per section,
// whether it holds. What to ask, the shape of the answer, and reading that answer back. Pure: no
// Herdr and no Node imports, so the box's side and the tests share it.
import { SECTIONS } from "./notes.js";

export const MODEL = "sonnet";
export const TIMEOUT_MS = 90000;
export const VERDICTS = ["checked", "corrected", "unsure"];

const verdict = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: VERDICTS },
    text: { type: "string", description: "corrected: the section as it should read" },
    question: { type: "string", description: "unsure: what the code cannot settle" },
  },
  required: ["verdict"],
};

export const SCHEMA = {
  type: "object",
  properties: {
    sections: { type: "object", properties: Object.fromEntries(SECTIONS.map((name) => [name, verdict])), required: SECTIONS },
    gone: {
      type: "object",
      properties: { is_gone: { type: "boolean" }, on: { type: "string", enum: ["main", "branch"] }, why: { type: "string" } },
      required: ["is_gone"],
    },
  },
  required: ["sections", "gone"],
};

export const SYSTEM = [
  "You check a note an agent wrote about a problem in a code base, before it becomes a GitHub issue.",
  "The folder you are in holds two read-only snapshots: main/ is the default branch as last fetched, branch/ is the branch the note was written on.",
  "Read the code there with your tools. Judge each of the note's four sections against that code:",
  "checked when it holds; corrected when it is wrong or out of date, with the section as it should read in text;",
  "unsure when the code cannot settle it, with what it cannot settle in question.",
  "An agent's 'Unsure:' in the desired situation gets an answer when the code's types, tests, docs or callers settle it.",
  "Set gone.is_gone when the problem is no longer there on main or on branch, with on and why; else is_gone is false.",
  "Write corrections and questions in plain English for teammates: short, exact, no chat style, no greetings,",
  "no secrets, tokens, customer data or personal paths.",
].join(" ");

// The question for one note: the note itself, and how its file changed since the note's commit.
export function prompt(note, { mainRef, branch, diffs = {}, worktreeDiff = "" }) {
  const sections = SECTIONS.map((name) => `<${name}>${note.sections?.[name] ?? ""}</${name}>`).join("\n");
  const snippet = note.snippet ? `<snippet start_line="${note.snippet.start}">\n${note.snippet.lines.join("\n")}\n</snippet>` : "<snippet/>";
  return [
    `<note title="${attr(note.title)}" file="${attr(note.at?.path ?? "")}" line="${note.at?.line ?? ""}" commit="${note.from?.sha ?? ""}">`,
    sections,
    snippet,
    "</note>",
    `<snapshots main="main/ (${attr(mainRef ?? "no default branch")})" branch="branch/ (${attr(branch ?? "no branch")})"/>`,
    `<diff_to_main>\n${diffs.main || "(none)"}\n</diff_to_main>`,
    `<diff_to_branch>\n${diffs.branch || "(none)"}\n</diff_to_branch>`,
    `<uncommitted_in_worktree>\n${worktreeDiff || "(none)"}\n</uncommitted_in_worktree>`,
  ].join("\n");
}

const attr = (text) => String(text ?? "").replace(/"/g, "'").replace(/[<>]/g, "");

// The arguments for `claude -p`: an answer in the shape of SCHEMA, the read tools only, no MCP
// servers, none of the person's settings, hooks or memory, no session kept.
export function claudeArgs(question) {
  return [
    "-p", "--output-format", "json", "--model", MODEL, "--system-prompt", SYSTEM,
    "--tools", "Read,Grep,Glob", "--allowedTools", "Read,Grep,Glob",
    "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence",
    "--json-schema", JSON.stringify(SCHEMA),
    question,
  ];
}

// The check from claude's output, or { error } in words a person reads.
export function readAnswer({ code, stdout, stderr }) {
  let json = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  const out = json && !json.is_error ? json.structured_output : null;
  if (out?.sections && SECTIONS.every((name) => VERDICTS.includes(out.sections[name]?.verdict))) {
    return {
      sections: Object.fromEntries(SECTIONS.map((name) => [name, cleanVerdict(out.sections[name])])),
      gone: out.gone?.is_gone && out.gone?.on && out.gone?.why ? { on: out.gone.on, why: String(out.gone.why).trim() } : null,
    };
  }
  const why = (json && (json.result || json.subtype)) || firstLine(stderr) || firstLine(stdout) || `claude stopped with exit code ${code}`;
  return { error: explain(why) ?? `Claude could not check the note: ${why}` };
}

function cleanVerdict(entry) {
  const result = { verdict: entry.verdict };
  if (entry.verdict === "corrected" && entry.text?.trim()) result.text = entry.text.trim();
  if (entry.verdict === "unsure" && entry.question?.trim()) result.question = entry.question.trim();
  if (entry.verdict === "corrected" && !result.text) return { verdict: "unsure", question: "Claude said this is wrong but gave no correction." };
  return result;
}

const firstLine = (text) => String(text ?? "").trim().split("\n")[0] ?? "";

// What to do about the failures people run into, else null.
export function explain(why) {
  const text = String(why ?? "");
  if (/not logged in|please run \/login|invalid api key|oauth token (?:has )?expired/i.test(text)) return "Your Claude Code is not logged in. Run claude in a terminal, log in with /login, and check again.";
  if (/limit/i.test(text) && /reset|reached|hit|exceeded/i.test(text)) return "You have used up your Claude usage for now. Check again after it resets.";
  if (/timed?[ -]?out|timeout/i.test(text)) return `Claude took longer than ${TIMEOUT_MS / 1000} seconds, so the box stopped waiting. Check again.`;
  if (/overloaded|\b529\b/i.test(text)) return "Claude is overloaded right now. Check again in a minute.";
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|getaddrinfo|fetch failed|network/i.test(text)) return "The box could not reach Claude. Check your internet connection and check again.";
  return null;
}

// Whether a kept check still holds: the code it read is the code there now.
export function stillHolds(check, basis) {
  if (!check || check.error) return false;
  return check.basis?.main === basis.main && check.basis?.branch === basis.branch && check.basis?.worktree === basis.worktree;
}
