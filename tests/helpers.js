// Throwaway repos, boxes and runs of the real command, for the tests. Nothing here touches the
// real ~/.suggestion-box or ~/.claude: every run gets its own folders.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const ROOT = realpathSync(join(import.meta.dir, ".."));
export const BIN = join(ROOT, "bin", "suggest");

export function tempDir(prefix = "sbox-") {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

export function git(cwd, ...args) {
  const run = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
}

// A repo with src/invoices.ts (60 lines) on main, an origin, and a ticket branch checked out.
export function makeRepo({ origin = "git@github.com:Acme/shop.git", branch = "feat/8504-group-records" } = {}) {
  const dir = join(tempDir("repo-"), "shop");
  mkdirSync(join(dir, "src"), { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n");
  writeFileSync(join(dir, "src", "invoices.ts"), `${lines}\n`);
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  if (origin) git(dir, "remote", "add", "origin", origin);
  if (branch) git(dir, "switch", "-qc", branch);
  return dir;
}

export const NOTE = `title: formatDate throws on a null date
at: src/invoices.ts:42
problem: Invoices without a due date crash the PDF export.
evidence: A fixture with \`dueDate: null\` made \`exportPdf\` throw a TypeError.
current: \`formatDate(null)\` throws, so the export answers with a 500.
desired: \`formatDate(null)\` returns a dash and the export works.
`;

export function note(title, extra = "") {
  return NOTE.replace(/^title: .*$/m, `title: ${title}`) + extra;
}

function envFor(box, env) {
  return { ...process.env, SUGGESTION_BOX_HOME: box, HC_TERMINAL_ID: "t7", CLAUDECODE: "1", ...env };
}

// One run of the real command: { code, out, err }.
export function suggest(cwd, box, args = [], input = "", env = {}) {
  const run = spawnSync("node", [BIN, ...args], { cwd, input, encoding: "utf8", env: envFor(box, env) });
  return { code: run.status, out: run.stdout.trim(), err: run.stderr.trim() };
}

// The same, started without waiting, for many agents at once.
export function suggestLater(cwd, box, args = [], input = "") {
  return new Promise((resolve) => {
    const child = spawn("node", [BIN, ...args], { cwd, env: envFor(box, {}) });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    child.stdin.end(input);
  });
}
