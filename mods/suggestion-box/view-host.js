// What every part of the view shares: the names it keeps state under in the app, how long it waits
// for what, and its helpers for Herdr's layout and for running box.js.
import { exec, layout } from "herdr";

export const BLOCK = "suggestion-box";

export const MOD = "suggestion-box";

// The other right-hand panels: Quarterdeck, Chartroom, and Herdr's Files and Changes.
export const OTHERS = ["quarterdeck", "chartroom", "panel"];

// The last read of the focused space's box, for every copy: { folder, answer }.
export const DATA = "suggestion-box.data";

// The button copy that keeps the one-panel rule: the newest, so an older copy kept alive across a
// reload of the mod never acts twice.
export const LIVE = "suggestion-box.live";

export const CHANGES_MS = 60000;

// The check fetches (20 s at most), takes two snapshots (45 s each at most), finds claude (10 s)
// and waits up to 90 s on Claude: 210 s, with room to spare.
export const CHECK_MS = 240000;

// A lookup runs up to eight gh calls and a filing up to fourteen, each stopped after 20 s (GH_MS in
// cli/box/file.js). A filing the panel gives up on is found again by the next Create issue.
export const FILE_MS = 330000;

// Fix in new tab: issues branch (60 s at most), then issues launch (240 s at most).
export const FIX_MS = 330000;

export const LOOKUP_MS = 200000;

export const SHOWN_MS = 1000;

// A fetch (20 s at most) and, per claim, git and gh for its PR (20 s at most).
export const PROOFS_MS = 90000;

// Confirmed fixes are looked at again this often until they land.
export const WATCH_MS = 300000;

// A read on its way for a folder, for every copy: the space's last read shows until it lands.
export const READING = "suggestion-box.reading";

// A read that takes longer than this has failed: the panel no longer waits for it.
export const READ_WAIT_MS = 90000;

export const UNDO_MS = 5000;

export const NOTICE_MS = 6000;

export const WIGGLE_MS = 700;

export const DAY_MS = 86400000;

// The editors a note's file opens in, the first that is there, as parrot opens them.
export const EDITORS = ["cursor", "/usr/local/bin/cursor", "/Applications/Cursor.app/Contents/Resources/app/bin/cursor", "code", "/usr/local/bin/code"];

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export const isShown = (id) => {
  const node = find(layout(), id);
  return Boolean(node) && node.hidden !== true;
};

export const sleep = (cx, ms) => new Promise((done) => cx.timer.after(ms, () => done()));

// node by its real path: an app started from the Dock may not have the PATH of a shell, and a
// version manager's per-shell path (fnm, nvm) goes away with that shell. Tried as the app finds it,
// then through the person's login shell.
export async function findNode() {
  const tries = [["node", ["-p", "process.execPath"]], ["sh", ["-c", 'exec "${SHELL:-/bin/zsh}" -lc "node -p process.execPath"']]];
  for (const [command, args] of tries) {
    const found = await exec(command, args).catch(() => null);
    const path = found?.code === 0 ? found.stdout.trim().split("\n").pop() : "";
    if (path.startsWith("/")) return path;
  }
  throw new Error("node was not found, directly or through your login shell");
}

// One answer of cli/box.js: its JSON, or an error with what it said.
export async function box(node, path, args, timeout = 60000) {
  const result = await exec(node, [path, ...args], { timeout });
  let answer;
  try {
    answer = JSON.parse(result.stdout);
  } catch {
    throw new Error((result.stderr || result.stdout).trim().split("\n").pop() || `box.js stopped with code ${result.code}`);
  }
  if (answer.error) throw new Error(answer.error);
  return answer;
}
