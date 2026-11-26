// The box's drawing, rendered by Herdr's own engine in a hidden window: one throwaway mod per
// scene, each a copy of the mod's files with a main.js that draws that scene. Nothing touches the
// running app. Skipped where herdr-app is not installed, such as CI.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ROOT, tempDir } from "./helpers.js";

const HERDR = [spawnSync("sh", ["-c", "command -v herdr-app"], { encoding: "utf8" }).stdout.trim(), join(homedir(), ".local", "bin", "herdr-app")].find((p) => p && existsSync(p));

const sections = { problem: "Invoices without a due date crash the PDF export.", evidence: "A fixture with dueDate: null made exportPdf throw.", current: "formatDate(null) throws.", desired: "Unsure: a dash, or refuse the invoice?" };
const open = { id: "n2", number: 2, title: "formatDate throws on a null date", state: "open", age: "2m", spotted: 3, at: { path: "src/invoices.ts", line: 42 }, from: { ticket: 8504 }, sections, changed: { on: "feat/8504-group-records", kind: "changed" }, actions: ["mark-solved", "bin"] };
const reopened = { ...open, id: "n3", number: 3, title: "A note that came back", changed: null, reopened: { after: "feat/x" }, notVerified: { branch: "feat/y" }, actions: ["bin"] };
const claimed = { ...open, id: "n1", number: 1, title: "N+1 query in the group list", state: "to verify", solved: { by: "agent", branch: "feat/8511-groups", how: "One query loads all members now.", proof: "groups.test.ts: loads members once" }, actions: ["confirm", "not-solved"] };
const checkedNote = { ...open, id: "n4", number: 4, title: "A checked note", changed: null, actions: ["check", "bin"], check: { sections: { problem: { verdict: "checked" }, evidence: { verdict: "checked" }, current: { verdict: "corrected", text: "It throws a TypeError, and the export answers 500." }, desired: { verdict: "unsure", question: "A dash, or refuse the invoice?" } }, gone: { on: "main", why: "formatDate returns a dash now" } } };
const failedNote = { ...open, id: "n5", number: 5, title: "A note whose check failed", changed: null, actions: ["check", "bin"], check: { error: "Claude took longer than 90 seconds, so the box stopped waiting. Check again." } };
const answer = {
  project: { key: "github.com/acme/shop", name: "shop", dir: "/tmp/box" },
  collecting: { all: true, project: true },
  notes: [claimed, open, reopened, checkedNote, failedNote],
  history: [
    { id: "h1", number: 4, title: "Unused export in utils/money.ts", state: "binned", age: "1d", actions: ["restore"] },
    { id: "h2", number: 5, title: "Stale cache key", state: "solved", age: "2d", solved: { branch: "feat/c", how: "The key has the currency now." }, actions: ["reopen"] },
    { id: "h3", number: 6, title: "README env vars", state: "filed", issue: { number: 799 }, age: "6d", actions: [] },
  ],
  counts: { open: 2, toVerify: 1 },
};

const scenes = {
  button: `button({ t, counts: { open: 2, toVerify: 1 }, isOn: true, isOff: false, isDim: false, why: "Suggestion box", isWiggling: true, onToggle: () => {} })`,
  "button off and dim": `button({ t, counts: null, isOn: false, isOff: true, isDim: true, why: "No git repo", isWiggling: false, onToggle: () => {} })`,
  "panel with every kind of note": `panel({ ...base, expanded: new Set(["n2", "n3"]), selected: "n2", undo: { id: "u", title: "A binned note" }, notice: "Note 7 moved to To verify.", error: "Could not read the box", showSettings: true })`,
  "panel with the check: verdicts, the gone banner, a failure, one running": `panel({ ...base, expanded: new Set(["n4"]), checking: new Set(["n2"]) })`,
  "panel with collecting off": `panel({ ...base, collecting: { all: false, project: false } })`,
  "panel history": `panel({ ...base, view: "history" })`,
  "panel empty": `panel({ ...base, answer: { ...answer, notes: [], history: [], counts: { open: 0, toVerify: 0 } } })`,
  "panel without a project": `panel({ ...base, answer: null, noProject: "No git repo in this space, so there is no box here." })`,
};

function sceneMod(name, draw) {
  const dir = join(tempDir("ui-"), name.replace(/\W+/g, "-"));
  mkdirSync(dir, { recursive: true });
  for (const file of readdirSync(join(ROOT, "mods", "suggestion-box"))) {
    if (file.endsWith(".js") && file !== "main.js") copyFileSync(join(ROOT, "mods", "suggestion-box", file), join(dir, file));
  }
  writeFileSync(join(dir, "mod.json"), '{ "place": "none", "title": "scene" }\n');
  writeFileSync(join(dir, "main.js"), `import { View } from "gpui-kit";
import { theme } from "herdr";
import { button, panel } from "./panel.js";
const answer = ${JSON.stringify(answer)};
export default class Scene extends View {
  render() {
    const t = theme();
    const base = { t, answer, view: "list", expanded: new Set(), selected: null, undo: null, checking: new Set(), notice: null, error: "", showSettings: false, collecting: answer.collecting, noProject: null, act: () => {} };
    return ${draw};
  }
}
`);
  return dir;
}

describe.skipIf(!HERDR)("the box drawn by Herdr's engine", () => {
  for (const [name, draw] of Object.entries(scenes)) {
    test(name, () => {
      const result = spawnSync(HERDR, ["check", sceneMod(name, draw)], { encoding: "utf8" });
      expect(`${result.stdout}${result.stderr}`).toContain("check passed");
      expect(result.status).toBe(0);
    });
  }
});
