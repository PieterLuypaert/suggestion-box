// A note's text: reading it from `key: value` lines, checking it, and the bits of it the command
// and the box show. Pure: no Herdr and no Node imports, so the suggest command and the mod share it.

export const SECTIONS = ["problem", "evidence", "current", "desired"];
export const FIELDS = ["title", "at", ...SECTIONS];
export const SECTION_LABELS = {
  problem: "Problem",
  evidence: "Evidence",
  current: "Current situation",
  desired: "Desired situation",
};
const TITLE_MAX = 100;
const SECTION_MAX = 500;

// Fields from `key: value` lines. A line that starts with two spaces continues the field above
// it; a blank line inside a field is kept. Returns { fields } or { error }.
export function parseFields(text, known = FIELDS) {
  const fields = {};
  let current = null;
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  for (const [index, line] of lines.entries()) {
    const key = /^([A-Za-z][\w-]*):(?:\s(.*)|$)/.exec(line);
    if (key && !line.startsWith(" ")) {
      const name = key[1].toLowerCase();
      if (!known.includes(name)) return { error: unknownLine(index + 1, key[1], known) };
      if (name in fields) return { error: `${name} is given twice` };
      fields[name] = key[2] ?? "";
      current = name;
    } else if (line.startsWith("  ") && current) {
      fields[current] += `\n${line.slice(2)}`;
    } else if (line.trim() === "") {
      if (current) fields[current] += "\n";
    } else {
      return { error: `line ${index + 1} is not a field; start it with one of ${known.join(", ")}, or indent a continuation by two spaces` };
    }
  }
  for (const name of Object.keys(fields)) fields[name] = fields[name].trim();
  return { fields };
}

function unknownLine(number, key, known) {
  return `line ${number} starts with '${key}:', which is not a field; use ${known.join(", ")}, or indent a continuation by two spaces`;
}

// What is wrong with a drop, as the command says it, or null when it is fine.
export function dropProblem(fields) {
  const title = fields.title ?? "";
  if (!title || title.includes("\n") || title.length > TITLE_MAX) {
    return `keep the title to one line of at most ${TITLE_MAX} characters; put the rest in the sections`;
  }
  const missing = SECTIONS.filter((name) => !(fields[name] ?? "").trim());
  if (missing.length) return `missing ${missing.join(", ")}; the issue needs all four sections`;
  const long = SECTIONS.find((name) => fields[name].length > SECTION_MAX);
  if (long) return `${long} is over ${SECTION_MAX} characters; keep it to the essentials`;
  return null;
}

// `at` as a path and an optional line: src/invoices.ts:42.
export function parseAt(at) {
  const text = String(at ?? "").trim();
  if (!text) return null;
  const match = /^(.+?)(?::(\d+))?$/.exec(text);
  const line = match[2] ? Number(match[2]) : null;
  return { path: match[1], line: line && line > 0 ? line : null };
}

// The title as the same-note check compares it: lowercase, single spaces, no final full stop.
export function normalizeTitle(title) {
  return String(title ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .trim();
}

// A short, stable name for "this title at this file", used to find the same note again.
export function sameNoteKey(title, path) {
  const text = `${normalizeTitle(title)}\n${path ?? ""}`;
  return fnv(text, 0x811c9dc5) + fnv(text, 0x01000193);
}

function fnv(text, seed) {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// A note id: its drop time and a few random characters, so ids sort by time.
export function noteId(date, random) {
  const pad = (n) => String(n).padStart(2, "0");
  const day = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return `${day}-${time}-${random}`;
}

// How long ago, the way the box and `suggest list` show it: now, 4m, 2h, 3d.
export function age(fromIso, now) {
  const seconds = Math.max(0, (now - Date.parse(fromIso)) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// The five lines around a line of a file's text, as { start, lines }, or null without a line.
export function snippetAround(text, line) {
  if (!line) return null;
  const lines = String(text).split("\n");
  if (line > lines.length) return null;
  const start = Math.max(1, line - 2);
  return { start, lines: lines.slice(start - 1, Math.min(lines.length, line + 2)) };
}
