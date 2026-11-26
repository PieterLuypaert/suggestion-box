// The three proofs a note claimed solved shows before you confirm it (docs/plan.md section 6b): the
// change that touched its lines, an independent check by your own Claude, and whether the fix
// landed in main. What git and gh found comes in; what it proves goes out. Pure: no Herdr and no
// Node imports.
import { explain, MODEL } from "./check.js";
import { SECTIONS } from "./notes.js";
import { parseHunks, touches } from "./lines.js";

// ---- 1. the change ----

// Lines first..last of a file, after a `git diff -U0` of it: where they are now, and whether a hunk
// changed one of them. A line a hunk rewrote maps onto that hunk's new lines; when every line of
// the range is gone, it shrinks to the one line where they were.
export function mapRange({ first, last }, hunks) {
  const from = lineAfter(first, hunks, false);
  const to = lineAfter(last, hunks, true);
  return { first: from, last: Math.max(from, to), isTouched: touches(hunks, first, last) };
}

function lineAfter(line, hunks, isEnd) {
  let shift = 0;
  for (const hunk of hunks) {
    // An insertion after old line oldStart moves the lines below it.
    if (hunk.oldCount === 0) {
      if (hunk.oldStart < line) shift += hunk.newCount;
      continue;
    }
    const end = hunk.oldStart + hunk.oldCount - 1;
    if (end < line) {
      shift += hunk.newCount - hunk.oldCount;
      continue;
    }
    if (hunk.oldStart > line) break;
    // Inside a hunk: its new lines, or after a deletion the line below it (the line above, at an end).
    if (hunk.newCount === 0) return isEnd ? hunk.newStart : hunk.newStart + 1;
    return isEnd ? hunk.newStart + hunk.newCount - 1 : hunk.newStart;
  }
  return line + shift;
}

// The hunks of a `git diff -U0` that change lines first..last, as the lines the panel draws:
// { kind: "@" | "-" | "+", text }.
// The file headers (--- a/x, +++ b/x) come before the first hunk; inside one, a removed "-- x" or an
// added "++i" is a line like any other.
export function touchingLines(diff, { first, last }) {
  const lines = [];
  let keep = false;
  for (const line of String(diff ?? "").split("\n")) {
    if (line.startsWith("@@")) {
      const [hunk] = parseHunks(line);
      keep = Boolean(hunk) && touches([hunk], first, last);
      if (keep) lines.push({ kind: "@", text: line.replace(/^(@@[^@]*@@).*$/, "$1") });
    } else if (line.startsWith("diff ")) {
      keep = false;
    } else if (keep && (line.startsWith("-") || line.startsWith("+"))) {
      lines.push({ kind: line[0], text: line.slice(1) });
    }
  }
  return lines;
}

// ---- 3. landed ----

// Whether the fix is in main, from what gh and git found: { state, how }, state being landed,
// waiting or never. A merged PR counts first, whatever the merge style; then the solving commit in
// main; then the same patch there (a squash or rebase merge). It never landed only when its PR
// closed unmerged, or its branch is gone with none of those.
// A gone branch says it never landed only when its PRs could be looked up: a squash merge whose PR
// gh could not see would look the same.
export function landedState({ pr = null, inMain = null, samePatch = null, hasBranch = true, isDefault = false, hasCommit = true, knowsPrs = true }) {
  if (pr?.state === "MERGED") return { state: "landed", how: `PR #${pr.number} merged`, sha: pr.mergeCommit ?? null, pr: pr.number };
  if (inMain) return { state: "landed", how: `in main (${inMain.slice(0, 7)})`, sha: inMain };
  if (samePatch) return { state: "landed", how: `the same change is in main (${samePatch.slice(0, 7)})`, sha: samePatch };
  if (pr?.state === "CLOSED") return { state: "never", how: `PR #${pr.number} was closed without merging` };
  if (!hasBranch && !isDefault && knowsPrs) return { state: "never", how: "its branch is gone, with no merged PR and no same change in main" };
  if (!hasBranch && !isDefault) return { state: "waiting", how: "its branch is gone, and its PR could not be looked up" };
  if (pr?.state === "OPEN") return { state: "waiting", how: `PR #${pr.number} is open`, pr: pr.number };
  if (!hasCommit) return { state: "waiting", how: "no commit with the fix yet" };
  return { state: "waiting", how: isDefault ? "not in the fetched main yet" : "no PR yet" };
}

// The PR a branch's fix goes through: a merged one first, then an open one, then the newest. A PR
// that merged or closed before the note was dropped is an older use of the branch name, not this fix.
export function pickPr(prs, since = null) {
  const from = since ? Date.parse(since) : null;
  const ended = (pr) => Date.parse(pr.mergedAt || pr.closedAt || "");
  const list = (Array.isArray(prs) ? prs : []).filter((pr) => pr.state === "OPEN" || from === null || !(ended(pr) < from));
  return list.find((pr) => pr.state === "MERGED") ?? list.find((pr) => pr.state === "OPEN") ?? list[0] ?? null;
}

// ---- 2. the independent check ----

export const VERIFY_VERDICTS = ["verified", "partly", "not_fixed"];
export const VERIFY_TIMEOUT_MS = 90000;

export const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: VERIFY_VERDICTS },
    why: { type: "string", description: "one or two sentences: what in the code shows it" },
    test: {
      type: "object",
      properties: {
        found: { type: "boolean", description: "the test or check the claim names exists" },
        asserts_fix: { type: "boolean", description: "it fails without the fix and passes with it" },
        why: { type: "string" },
      },
      required: ["found", "asserts_fix"],
    },
  },
  required: ["verdict", "why", "test"],
};

export const VERIFY_SYSTEM = [
  "You verify a claim that a problem in a code base was fixed, before the person confirms it. Another agent made the claim; do not take its word.",
  "The folder you are in holds a read-only snapshot: branch/ is the code on the branch the claim was made on.",
  "You get the note that described the problem, the claim (how it was fixed, and the test or check it names as proof), the commits that changed the note's lines, and the branch's other changes with the files they touched: a fix is often in another file, or another part of the file, than the lines the note names.",
  "Read the code with your tools. Answer verified when the problem the note describes is gone on that branch; partly when part of it remains;",
  "not_fixed when it is still there. Say in why what in the code shows it.",
  "For test: found when the named test or check exists in the snapshot; asserts_fix when it would fail without the fix and passes with it.",
  "Write plainly and briefly, for teammates: no chat style, no greetings, no secrets, tokens, customer data or personal paths.",
].join(" ");

const attr = (text) => String(text ?? "").replace(/"/g, "'").replace(/[<>]/g, "");

// The question for one claim: the note, the claim, and the commits of the change with their diffs.
export function verifyPrompt(note, claim, change) {
  const sections = SECTIONS.map((name) => `<${name}>${note.sections?.[name] ?? ""}</${name}>`).join("\n");
  const commits = (change?.commits ?? []).map((commit) => [
    `<commit sha="${commit.sha}" subject="${attr(commit.subject)}">`,
    commit.lines.map((line) => (line.kind === "@" ? line.text : `${line.kind}${line.text}`)).join("\n"),
    "</commit>",
  ].join("\n"));
  const others = (change?.elsewhere ?? []).map((commit) => `<commit sha="${commit.sha}" subject="${attr(commit.subject)}" files="${attr(commit.files.join(", "))}"/>`);
  return [
    `<note title="${attr(note.title)}" file="${attr(change?.path ?? note.at?.path ?? "")}">`,
    sections,
    "</note>",
    `<claim branch="${attr(claim?.branch ?? "")}" by="${claim?.by === "you" ? "the person" : "an agent"}">`,
    `<how>${claim?.how ?? ""}</how>`,
    `<proof>${claim?.proof ?? "(none named)"}</proof>`,
    "</claim>",
    `<change>\n${commits.join("\n") || "(no commit since the note changed its lines)"}\n</change>`,
    `<other_commits_on_the_branch>\n${others.join("\n") || "(none)"}\n</other_commits_on_the_branch>`,
  ].join("\n");
}

export function verifyArgs(question) {
  return [
    "-p", "--output-format", "json", "--model", MODEL, "--system-prompt", VERIFY_SYSTEM,
    "--tools", "Read,Grep,Glob", "--allowedTools", "Read,Grep,Glob",
    "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence",
    "--json-schema", JSON.stringify(VERIFY_SCHEMA),
    question,
  ];
}

// The verdict from claude's output: { verdict, why, test }, or { error } in words a person reads.
export function readVerify({ code, stdout, stderr }, timeout = VERIFY_TIMEOUT_MS) {
  let json = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  const out = json && !json.is_error ? json.structured_output : null;
  if (out && VERIFY_VERDICTS.includes(out.verdict) && String(out.why ?? "").trim()) {
    const test = out.test ?? {};
    return { verdict: out.verdict, why: String(out.why).trim(), test: { found: Boolean(test.found), assertsFix: Boolean(test.found && test.asserts_fix), why: String(test.why ?? "").trim() || null } };
  }
  const why = (json && (json.result || json.subtype)) || first(stderr) || first(stdout) || `claude stopped with exit code ${code}`;
  return { error: explain(why, timeout) ?? `Claude could not check the fix: ${why}` };
}

const first = (text) => String(text ?? "").trim().split("\n")[0] ?? "";

// Whether a kept independent check still holds: the branch's diff of the note's file is the same.
export function verifyHolds(verify, basis) {
  return Boolean(verify && !verify.error && verify.basis && verify.basis === basis);
}
