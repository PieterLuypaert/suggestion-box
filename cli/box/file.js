// Filing a checked note: where it goes (the project's config on the fresh default branch), what is
// there already (similar open issues), the code link, and gh: create the issue, then put it on the
// board in its first column, finding the field and column ids by name each time, as the team's
// skills do. A failed board step never undoes the issue.
import { spawnSync } from "node:child_process";
import { filingTarget } from "../../mods/suggestion-box/config.js";
import { githubRepo, permalink } from "../../mods/suggestion-box/issue.js";
import { findSnippet, noteRange } from "../../mods/suggestion-box/lines.js";
import { defaultRef } from "./changes.js";
import { gitAnswer, gitText } from "../shared/git.js";

// One gh call's limit; the panel waits for a lookup's and a filing's calls together.
export const GH_MS = 20000;

// gh, or the tests' stand-in. { code, stdout, stderr, isMissing }; stdin when given. isMissing:
// gh is not installed.
export function gh(args, { env = process.env, input } = {}) {
  const result = spawnSync(env.SUGGESTION_BOX_GH || "gh", args, { encoding: "utf8", input, timeout: GH_MS, env: { ...process.env, ...env, GH_PROMPT_DISABLED: "1" } });
  return { code: result.status, stdout: result.stdout ?? "", stderr: (result.stderr ?? "").trim() || (result.error ? result.error.message : ""), isMissing: result.error?.code === "ENOENT" };
}

function json(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

// The config as the fresh default branch has it, else null.
export function configText(top, mainRef) {
  for (const file of [".ai-tooling/config.yml", ".claude/project.yml"]) {
    const text = mainRef ? gitAnswer(top, ["show", `${mainRef}:${file}`]) : null;
    if (text !== null) return text;
  }
  return null;
}

// Where the issue goes, for the editor's target line: { kind, repo, label, labelMissing, board,
// visibility, linkKeyword, hasConfig, why? }. Without a config: the origin repo, no label, no board.
// The board gets its title, or a problem the line shows before anything is created.
export function targetFor(top, key, env) {
  const mainRef = defaultRef(top);
  const config = filingTarget(configText(top, mainRef));
  const repo = config?.repo ?? githubRepo(key);
  const board = config?.board ? { ...config.board } : null;
  const target = { kind: config?.kind ?? "github", repo, label: config?.label ?? null, labelMissing: false, board, linkKeyword: config?.linkKeyword ?? "Closes", visibility: null, hasConfig: Boolean(config), codeRepo: null };
  if (target.kind !== "github") return { ...target, codeRepo: spelled(githubRepo(key), env), why: `This project's tracker is ${target.kind}: Copy issue puts it on your clipboard` };
  // Where the box cannot create the issue itself, Copy issue still puts it on the clipboard.
  if (!repo) return { ...target, kind: "copy", why: "This project has no GitHub repo to file in: Copy issue puts it on your clipboard" };
  // GitHub's own spelling of the repo: a code link only shows as code when it matches.
  const asked = gh(["repo", "view", repo, "--json", "visibility,nameWithOwner"], { env });
  // The repo is still known: its code link, and the scan that treats a repo of unknown visibility
  // as public, still apply to what is copied.
  if (asked.isMissing) return { ...target, kind: "copy", codeRepo: githubRepo(key), why: "GitHub's gh is not installed here, so the box cannot create the issue: Copy issue puts it on your clipboard" };
  const view = json(asked);
  target.visibility = view?.visibility ? String(view.visibility).toLowerCase() : null;
  if (view?.nameWithOwner) target.repo = view.nameWithOwner;
  // The code lives in the origin repo, which the tracker's repo may not be.
  const origin = githubRepo(key);
  target.codeRepo = origin && origin !== target.repo.toLowerCase() ? spelled(origin, env) : origin ? target.repo : null;
  // A label gh could not look up stays on: gh then says itself if it is not there.
  if (target.label) {
    const labels = gh(["label", "list", "--repo", repo, "--search", target.label, "--json", "name", "--limit", "50"], { env });
    if (labels.code === 0) target.labelMissing = !(json(labels) ?? []).some((one) => one.name === target.label);
  }
  if (board) {
    const found = findBoard(board, env);
    if (found.error) board.problem = found.error;
    else board.title = found.title;
  }
  return target;
}

// A repo as GitHub spells it, else as given; null stays null.
function spelled(repo, env) {
  if (!repo) return null;
  return json(gh(["repo", "view", repo, "--json", "nameWithOwner"], { env }))?.nameWithOwner ?? repo;
}

// The board's id and title, and the ids of its column field and the column, found by name; or
// { error } saying what to do.
function findBoard(board, env) {
  const view = gh(["project", "view", String(board.number), "--owner", board.owner, "--format", "json"], { env });
  if (view.code !== 0) return { error: boardError(view.stderr) };
  const fields = gh(["project", "field-list", String(board.number), "--owner", board.owner, "--format", "json", "--limit", "100"], { env });
  if (fields.code !== 0) return { error: boardError(fields.stderr) };
  const field = json(fields)?.fields?.find((one) => one.name === board.field);
  const option = field?.options?.find((one) => one.name === board.column);
  if (!option) return { error: `the board has no ${board.field} column called ${board.column}` };
  const project = json(view);
  return { id: project?.id ?? "", title: project?.title ?? null, fieldId: field.id, optionId: option.id };
}

const COMMON = new Set(["with", "from", "that", "this", "when", "into", "than", "then", "there", "which", "while", "still", "does", "have"]);

// The three longest words of a title that say something, for the search for similar issues.
export function searchWords(title) {
  const words = String(title ?? "").replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !COMMON.has(w.toLowerCase()));
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 3).join(" ");
}

// Up to three open issues whose titles share the note's main words; null when gh could not look.
export function similarIssues(repo, title, env) {
  const words = searchWords(title);
  if (!repo || !words) return [];
  const result = gh(["issue", "list", "--repo", repo, "--state", "open", "--search", `${words} in:title`, "--limit", "3", "--json", "number,title,url"], { env });
  return result.code === 0 ? (json(result) ?? null) : null;
}

// The code link under Evidence: the note's snippet found on the fresh default branch, linked there
// as lines GitHub shows as code; else the note's own commit when GitHub has it; else the file.
export function codeLinkFor(top, note, repo, env) {
  if (!note.at?.path || !repo) return null;
  const mainRef = defaultRef(top);
  const range = noteRange(note);
  const mainSha = mainRef ? gitAnswer(top, ["rev-parse", "-q", "--verify", `${mainRef}^{commit}`]) : null;
  const text = mainRef ? gitText(top, ["show", `${mainRef}:${note.at.path}`]) : null;
  const at = text && note.snippet ? findSnippet(text, note.snippet, note.at.line) : null;
  // A local main or master (no fetched default branch) may hold commits GitHub does not have.
  const onGitHub = (sha) => gh(["api", `repos/${repo}/commits/${sha}`, "--silent"], { env }).code === 0;
  if (at && mainSha && (mainRef.startsWith("origin/") || onGitHub(mainSha))) {
    return { url: permalink(repo, mainSha, note.at.path, at, at + note.snippet.lines.length - 1), embed: true };
  }
  const sha = note.from?.sha;
  if (sha && range && onGitHub(sha)) return { url: permalink(repo, sha, note.at.path, range.first, range.last), embed: true };
  const branch = (mainRef ?? "main").replace(/^origin\//, "");
  return { url: `https://github.com/${repo}/blob/${branch}/${note.at.path}`, embed: false };
}

// An issue of yours with exactly this title, created since `since`: what a filing that was cut off
// after gh created it left behind. The newest issues are listed rather than searched, as a new issue
// takes a while to show up in search. null when there is none or gh could not look.
export function issueSince(repo, title, since, env) {
  const result = gh(["issue", "list", "--repo", repo, "--state", "all", "--author", "@me", "--limit", "30", "--json", "number,title,url,createdAt"], { env });
  const from = Date.parse(since) - 60000;
  const found = result.code === 0 ? (json(result) ?? []).find((one) => one.title === title && Date.parse(one.createdAt) >= from) : null;
  return found ? { number: found.number, url: found.url } : null;
}

// The boards an issue is on, as GitHub says: [{ title, column }], also when a board's own auto-add
// workflow put it there. null when gh could not say.
export function boardsOf(repo, number, env) {
  const answer = gh(["issue", "view", String(number), "--repo", repo, "--json", "projectItems"], { env });
  if (answer.code !== 0) return null;
  try {
    return (JSON.parse(answer.stdout).projectItems ?? []).map((item) => ({ title: item.title, column: item.status?.name ?? null }));
  } catch {
    return null;
  }
}

// Creates the issue: { number, url } or { error } with gh's own words.
export function createIssue({ repo, title, body, label }, env) {
  const args = ["issue", "create", "--repo", repo, "--title", title, "--body-file", "-"];
  if (label) args.push("--label", label);
  const result = gh(args, { env, input: body });
  const url = result.stdout.trim().split("\n").pop();
  const number = Number(/\/issues\/(\d+)$/.exec(url ?? "")?.[1]);
  if (result.code !== 0 || !number) return { error: result.stderr || result.stdout.trim() || "gh issue create gave no issue" };
  return { number, url };
}

// Puts an issue on the board in its first column: { ok } or { error } saying what to do. The column
// is found first, so a board without it never gets a card without a column.
export function addToBoard(board, url, env) {
  const found = findBoard(board, env);
  if (found.error) return { error: found.error };
  const item = gh(["project", "item-add", String(board.number), "--owner", board.owner, "--url", url, "--format", "json"], { env });
  if (item.code !== 0) return { error: boardError(item.stderr) };
  const itemId = json(item)?.id;
  if (!itemId) return { error: "gh added the issue to the board but gave no item id; set its column by hand" };
  const edit = gh(["project", "item-edit", "--id", itemId, "--project-id", found.id, "--field-id", found.fieldId, "--single-select-option-id", found.optionId], { env });
  return edit.code === 0 ? { ok: true } : { error: boardError(edit.stderr) };
}

function boardError(stderr) {
  if (/scope|INSUFFICIENT_SCOPES|project/i.test(stderr) && /scope/i.test(stderr)) return "run gh auth refresh -s project";
  return stderr || "gh could not reach the board";
}
