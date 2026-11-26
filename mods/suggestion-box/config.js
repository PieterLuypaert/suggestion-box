// What the box needs from a project's .ai-tooling/config.yml (or .claude/project.yml): where an
// issue goes, its label, its board and column, and the PR keyword that closes it. Only these keys
// are read, from the small part of YAML those files use (nested maps, plain or quoted scalars,
// inline { a: b } maps, comments), as the team's own scripts read them with awk. Pure.

// The file as nested plain objects; lists and anything else it does not need are left out.
export function readYaml(text) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  for (const raw of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = stripComment(raw);
    if (!line.trim() || line.trim().startsWith("-")) continue;
    const indent = line.length - line.trimStart().length;
    const match = /^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    const [, key, rest] = match;
    if (rest === "") {
      parent[key] = {};
      stack.push({ indent, node: parent[key] });
    } else {
      parent[key] = rest.startsWith("{") ? flowMap(rest) : scalar(rest);
    }
  }
  return root;
}

// A comment starts at a # with a space before it, outside quotes.
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
  }
  return line.trimEnd();
}

function scalar(text) {
  const value = text.trim();
  if (/^".*"$/.test(value) || /^'.*'$/.test(value)) return value.slice(1, -1);
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value === "true" || value === "false") return value === "true";
  return value;
}

function flowMap(text) {
  const inside = text.trim().replace(/^\{/, "").replace(/\}$/, "");
  const map = {};
  for (const part of inside.split(",")) {
    const [key, ...rest] = part.split(":");
    if (key?.trim() && rest.length) map[key.trim()] = scalar(rest.join(":"));
  }
  return map;
}

// Where an issue goes, from the config's text: { kind, repo, label, board, linkKeyword }. Null
// for a file that is not there; the caller then files in the origin repo without a label.
export function filingTarget(text) {
  if (text === null || text === undefined) return null;
  const config = readYaml(text);
  const tracker = config.tracker ?? {};
  const project = tracker.project;
  const board = project?.owner && Number.isInteger(project.number) && tracker.status?.todo
    ? { owner: String(project.owner), number: project.number, field: String(tracker.status.field ?? "Status"), column: String(tracker.status.todo) }
    : null;
  return {
    kind: String(tracker.kind ?? "github"),
    repo: tracker.repo ? String(tracker.repo) : null,
    label: config.labels?.["needs-triage"] ? String(config.labels["needs-triage"]) : null,
    board,
    linkKeyword: String(config.pr?.link_keyword ?? "Closes"),
  };
}
