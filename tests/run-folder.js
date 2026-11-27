// Preloaded for every test run (bunfig.toml): everything the run makes sits in one temporary folder
// of its own, removed once all test files are done. TMPDIR points there, so the commands the tests
// start write their temporary files inside it too.
import { afterAll } from "bun:test";
import { mkdtempSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PREFIX = "sbox-run-";
const DAY = 86400000;

// A run stopped halfway (Ctrl-C) never removed its folder. The next run removes those a day old,
// so a run still going elsewhere keeps its own.
for (const name of readdirSync(tmpdir())) {
  const folder = join(tmpdir(), name);
  const at = name.startsWith(PREFIX) ? statSync(folder, { throwIfNoEntry: false })?.mtimeMs : null;
  if (at && Date.now() - at >= DAY) rmSync(folder, { recursive: true, force: true });
}

const run = realpathSync(mkdtempSync(join(tmpdir(), PREFIX)));
process.env.TMPDIR = run;
afterAll(() => rmSync(run, { recursive: true, force: true }));
