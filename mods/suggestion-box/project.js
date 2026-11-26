// Which project a repo belongs to, and which ticket a branch is for. Pure: no Herdr and no Node
// imports, so the suggest command and the Herdr mod share it.

// The project key: the origin, lowercased, without protocol, user, port or .git, so every
// worktree and clone of a repo lands in one box. A repo without an origin is keyed by its main
// checkout's path.
export function projectKey(origin, checkout) {
  const url = String(origin ?? "").trim();
  if (!url) return `local${checkout}`;
  let rest = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  rest = rest.replace(/^[^@/]+@/, "");
  rest = rest.replace(/^([^/:]+):(?!\d+\/)/, "$1/");
  rest = rest.replace(/:\d+\//, "/");
  rest = rest.replace(/\/+$/, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  if (rest.startsWith("/")) return `local${rest}`;
  return rest.toLowerCase();
}

// The folder a project's notes live in: the key with its slashes as double underscores.
export function projectFolder(key) {
  return key
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[^A-Za-z0-9._-]/g, "-"))
    .join("__");
}

// The short name the command and the box use: the key's last part, such as shop.
export function projectName(key) {
  const parts = key.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? key;
}

// The ticket a branch was launched for: parallel-tickets' record of it first, else a
// <type>/<number>-… branch name. Any other number in a branch name proves nothing
// (chore/bump-node-20 is not ticket 20).
export function ticketFor(branch, records = []) {
  if (!branch) return null;
  const record = records.find((r) => r && r.branch === branch && Number.isInteger(r.ticket));
  if (record) return record.ticket;
  const match = /^[a-z][a-z0-9-]*\/(\d+)-/i.exec(branch);
  return match ? Number(match[1]) : null;
}
