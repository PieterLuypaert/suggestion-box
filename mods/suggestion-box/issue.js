// The issue a note becomes: always Problem, Evidence, Current situation and Desired situation, the
// code link under Evidence, and the ticket it was spotted on. No mention of Claude or agents. Pure.
import { SECTION_LABELS, SECTIONS } from "./notes.js";

// The issue's text. `link` is { url, embed }: embed puts a permalink on a line of its own, which
// GitHub shows as the code; otherwise it is a Where: line. `ticket`: the ticket number or null.
export function issueText({ sections }, { link = null, ticket = null } = {}) {
  const parts = [];
  for (const name of SECTIONS) {
    parts.push(`## ${SECTION_LABELS[name]}`, "", String(sections?.[name] ?? "").trim(), "");
    if (name === "evidence" && link) parts.push(link.embed ? link.url : `Where: ${link.url}`, "");
  }
  if (ticket) parts.push("---", "", `Spotted while working on #${ticket}.`, "");
  return `${parts.join("\n").trim()}\n`;
}

// owner/name from a GitHub project key (github.com/acme/shop), else null.
export function githubRepo(key) {
  const match = /^github\.com\/([^/]+\/[^/]+)$/.exec(String(key ?? ""));
  return match ? match[1] : null;
}

// A link to lines first..last of a file at a commit, which GitHub embeds as code.
export function permalink(repo, sha, path, first, last) {
  const lines = first ? `#L${first}${last && last !== first ? `-L${last}` : ""}` : "";
  return `https://github.com/${repo}/blob/${sha}/${path}${lines}`;
}

// A branch name the way parallel-tickets names them: a type and three to five words from the title,
// lowercase, no number.
export function branchName(title, type = "fix") {
  const skip = new Set(["a", "an", "the", "on", "in", "of", "for", "to", "and", "is", "it", "with"]);
  const words = String(title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w && !skip.has(w));
  return `${type}/${words.slice(0, 5).join("-") || "note"}`;
}
