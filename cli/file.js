// Filing a checked note: where it goes (the project's config on the fresh default branch), what is
// there already (similar open issues), the code link, and gh: create the issue, then put it on the
// board in its first column, finding the field and column ids by name each time, as the team's
// skills do. A failed board step never undoes the issue.
import { spawnSync } from "node:child_process";
import { filingTarget } from "../mods/suggestion-box/config.js";
import { githubRepo, permalink } from "../mods/suggestion-box/issue.js";
import { findSnippet, noteRange } from "../mods/suggestion-box/lines.js";
import { defaultRef } from "./changes.js";
import { gitAnswer } from "./git.js";

// gh, or the tests' stand-in. { code, stdout, stderr }; stdin when given.
export function gh(args, { env = process.env, input } = {}) {
  const result = spawnSync(env.SUGGESTION_BOX_GH || "gh", args, { encoding: "utf8", input, timeout: 30000, env: { ...process.env, ...env, GH_PROMPT_DISABLED: "1" } });
  return { code: result.status, stdout: result.stdout ?? "", stderr: (result.stderr ?? "").trim() || (result.error ? result.error.message : "") };
}

function json(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

// The config as the fresh default branch has it, else null.
function configText(top, mainRef) {
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
  const target = { kind: config?.kind ?? "github", repo, label: config?.label ?? null, labelMissing: false, board, linkKeyword: config?.linkKeyword ?? "Closes", visibility: null, hasConfig: Boolean(config) };
  if (target.kind !== "github") return { ...target, why: `This project's tracker is ${target.kind}: Copy issue puts it on your clipboard` };
  if (!repo) return { ...target, why: "This project has no GitHub repo to file in" };
  const view = json(gh(["repo", "view", repo, "--json", "visibility"], { env }));
  target.visibility = view?.visibility ? String(view.visibility).toLowerCase() : null;
  if (target.label) {
    const labels = json(gh(["label", "list", "--repo", repo, "--search", target.label, "--json", "name", "--limit", "50"], { env })) ?? [];
    target.labelMissing = !labels.some((one) => one.name === target.label);
  }
  if (board) {
    const found = gh(["project", "view", String(board.number), "--owner", board.owner, "--format", "json"], { env });
    if (found.code === 0) board.title = json(found)?.title ?? null;
    else board.problem = boardError(found.stderr);
  }
  return target;
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
  const text = mainRef ? gitAnswer(top, ["show", `${mainRef}:${note.at.path}`]) : null;
  const at = text && note.snippet ? findSnippet(text, note.snippet, note.at.line) : null;
  if (at && mainSha) return { url: permalink(repo, mainSha, note.at.path, at, at + note.snippet.lines.length - 1), embed: true };
  const sha = note.from?.sha;
  if (sha && range && gh(["api", `repos/${repo}/commits/${sha}`, "--silent"], { env }).code === 0) {
    return { url: permalink(repo, sha, note.at.path, range.first, range.last), embed: true };
  }
  const branch = (mainRef ?? "main").replace(/^origin\//, "");
  return { url: `https://github.com/${repo}/blob/${branch}/${note.at.path}`, embed: false };
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

// Puts an issue on the board in its first column: { ok } or { error } saying what to do.
export function addToBoard(board, url, env) {
  const item = gh(["project", "item-add", String(board.number), "--owner", board.owner, "--url", url, "--format", "json"], { env });
  if (item.code !== 0) return { error: boardError(item.stderr) };
  const itemId = json(item)?.id;
  const fields = json(gh(["project", "field-list", String(board.number), "--owner", board.owner, "--format", "json", "--limit", "100"], { env }));
  const field = fields?.fields?.find((one) => one.name === board.field);
  const option = field?.options?.find((one) => one.name === board.column);
  if (!itemId || !field || !option) return { error: `the board has no ${board.field} column called ${board.column}` };
  const project = json(gh(["project", "view", String(board.number), "--owner", board.owner, "--format", "json"], { env }));
  const edit = gh(["project", "item-edit", "--id", itemId, "--project-id", project?.id ?? "", "--field-id", field.id, "--single-select-option-id", option.id], { env });
  return edit.code === 0 ? { ok: true } : { error: boardError(edit.stderr) };
}

function boardError(stderr) {
  if (/scope|INSUFFICIENT_SCOPES|project/i.test(stderr) && /scope/i.test(stderr)) return "run gh auth refresh -s project";
  return stderr || "gh could not reach the board";
}
