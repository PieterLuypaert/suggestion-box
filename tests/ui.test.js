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
const claimed = { ...open, id: "n1", number: 1, title: "N+1 query in the group list", state: "to verify", solved: { by: "agent", branch: "feat/8511-groups", how: "One query loads all members now.", proof: "groups.test.ts: loads members once" }, actions: ["confirm", "not-solved"], verify: { verdict: "verified", why: "listGroups loads members with one query in groups.ts.", test: { found: true, assertsFix: true } } };
const neverLanded = { ...claimed, id: "n6", number: 6, title: "A fix that never landed", issue: { number: 812, url: "u", closes: "Closes #812" }, solved: { ...claimed.solved, neverLanded: { how: "PR #44 was closed without merging" } }, verify: { verdict: "partly", why: "One of the two queries is gone.", test: { found: true, assertsFix: false, why: "it only counts calls" } } };
const proofsFound = { change: { ref: "refs/heads/feat/8511-groups", path: "src/groups.ts", commits: [{ sha: "9f3e21c4a8b7d6e5f4a3", subject: "fix: load group members in one query", lines: [{ kind: "@", text: "@@ -40,3 +40,2 @@" }, { kind: "-", text: "for (const g of groups) g.members = await members(g.id);" }, { kind: "+", text: "const all = await membersOf(groups.map((g) => g.id));" }] }], more: 0 }, landed: { state: "waiting", how: "PR #44 is open" } };
const checkedNote = { ...open, id: "n4", number: 4, title: "A checked note", changed: null, actions: ["check", "bin"], check: { at: new Date(Date.now() - 120000).toISOString(), sections: { problem: { verdict: "checked" }, evidence: { verdict: "checked" }, current: { verdict: "corrected", text: "It throws a TypeError, and the export answers 500." }, desired: { verdict: "unsure", question: "A dash, or refuse the invoice?" } }, gone: { on: "main", why: "formatDate returns a dash now" } } };
const failedNote = { ...open, id: "n5", number: 5, title: "A note whose check failed", changed: null, actions: ["check", "bin"], check: { error: "Claude took longer than 90 seconds, so the box stopped waiting. Check again." } };
const checkedNoteTitle = "A checked note";
const answer = {
  project: { key: "github.com/acme/shop", name: "shop", dir: "/tmp/box" },
  collecting: { all: true, project: true },
  notes: [claimed, neverLanded, open, reopened, checkedNote, failedNote],
  history: [
    { id: "h1", number: 4, title: "Unused export in utils/money.ts", state: "binned", age: "1d", actions: ["restore"] },
    { id: "h2", number: 5, title: "Stale cache key", state: "solved", age: "2d", solved: { branch: "feat/c", how: "The key has the currency now.", confirmed: { at: "t" }, landed: { state: "landed", how: "PR #40 merged" } }, actions: ["reopen"] },
    { id: "h5", number: 9, title: "Slow export", state: "solved", age: "1h", solved: { branch: "feat/e", how: "Streams now.", confirmed: { at: "t" } }, actions: ["reopen"] },
    { id: "h3", number: 6, title: "README env vars", state: "filed", issue: { number: 799, url: "https://github.com/acme/shop/issues/799", closes: "Closes #799" }, solved: { branch: "feat/d", how: "Documented.", confirmed: { at: "t" } }, age: "6d", actions: [] },
    { id: "h4", number: 8, title: "Rounding in totals", filed: { title: "Totals round each line instead of the sum" }, state: "filed", issue: { number: 812, url: "https://github.com/acme/shop/issues/812", closes: "Closes #812" }, board: { error: "run gh auth refresh -s project" }, fixError: { why: "the primary checkout has uncommitted work" }, age: "now", actions: ["fix"] },
    { id: "h6", number: 10, title: "Fee rounding on trials", state: "filed", issue: { number: 813, url: "u", boards: [{ title: "Shop", column: "Todo" }] }, fix: { branch: "fix/fee-rounding-trials", pane: "t9" }, age: "now", actions: [] },
    { id: "h7", number: 11, title: "Old cache header", state: "filed", issue: { number: 790, url: "u", closed: { at: "t" } }, age: "3d", actions: [] },
    { id: "h8", number: 12, title: "A fix on its way", state: "filed", issue: { number: 814, url: "u" }, fix: { starting: true, at: "t" }, age: "now", actions: [] },
    { id: "h9", number: 13, title: "A fix that never answered", state: "filed", issue: { number: 815, url: "u" }, fix: { starting: true, at: "t", isStale: true }, age: "1h", actions: ["fix"] },
  ],
  counts: { open: 2, toVerify: 1 },
};

const scenes = {
  button: `button({ t, counts: { open: 2, toVerify: 1 }, isOn: true, isOff: false, isDim: false, why: "Suggestion box", isWiggling: true, onToggle: () => {} })`,
  "button off and dim": `button({ t, counts: null, isOn: false, isOff: true, isDim: true, why: "No git repo", isWiggling: false, onToggle: () => {} })`,
  "panel with every kind of note": `panel({ ...base, expanded: new Set(["n2", "n3"]), selected: "n2", undo: { id: "u", title: "A binned note" }, notice: "Note 7 moved to To verify.", error: "Could not read the box" })`,
  "panel with the check: verdicts, the gone banner, a failure, one running": `panel({ ...base, expanded: new Set(["n4"]), checking: new Set(["n2"]) })`,
  "panel with collecting off": `panel({ ...base, collecting: { all: false, project: false } })`,
  "panel history": `panel({ ...base, view: "history" })`,
  "panel empty": `panel({ ...base, answer: { ...answer, notes: [], history: [], counts: { open: 0, toVerify: 0 } } })`,
  "panel settings: collecting everywhere and per project": `panel({ ...base, view: "settings", projects })`,
  "panel settings: off everywhere": `panel({ ...base, view: "settings", projects: { ...projects, all: false } })`,
  "panel settings: still looking": `panel({ ...base, view: "settings", projects: null })`,
  "panel settings: could not list": `panel({ ...base, view: "settings", projects: { error: "node was not found" } })`,
  "panel with the editor: labels, the scan, the target, similar issues": `panel({ ...base, expanded: new Set(["n4"]), justFiled: new Set(["h4"]), editor: editor({ hits: [{ kind: "a GitHub token", text: "ghp_abcdefghijklmnopqrstuvwxyz0123456789", blocking: true }, { kind: "an email address", text: "jan@acme.be", blocking: false, isFine: false }, { kind: "a home path", text: "/Users/jan", blocking: false, isFine: true }], similar: [{ number: 12, title: "PDF export crashes", url: "u" }], off: "Remove a GitHub token: ghp_abcdefgh…", canStartOver: true }) })`,
  "panel with the editor: checking, the gone banner, a failed filing": `panel({ ...base, editor: editor({ isChecking: true, labels: { problem: { label: "checking" }, evidence: { label: "checking" }, current: { label: "checking" }, desired: { label: "checking" } }, gone: { on: "main", why: "formatDate returns a dash now" }, similar: null, off: "Waiting for the check", error: "gh could not create the issue: HTTP 410" }) })`,
  "panel with the editor: not solved after all, copy for monday, not checked": `panel({ ...base, editor: editor({ gone: { on: "main", why: "it looks fixed" }, notGone: { reason: "" }, reason, canCopy: true, checkError: "Claude took longer than 90 seconds", line: "This project's tracker is monday: Copy issue puts it on your clipboard", off: null }) })`,
  "panel history with filed notes": `panel({ ...base, view: "history" })`,
  "panel with just filed notes: Fix in new tab, a fix running, one starting": `panel({ ...base, justFiled: new Set(["h4", "h6"]), fixing: new Set(["h4"]) })`,
  "panel with the three proofs: found, running, never landed": `panel({ ...base, expanded: new Set(["n1", "n6"]), proofs: new Map([["n1", proofsFound], ["n6", { isLoading: true }]]), verifying: new Set(["n6"]) })`,
  "panel with the proofs failing": `panel({ ...base, expanded: new Set(["n1"]), answer: { ...answer, notes: [{ ...answer.notes[0], verify: { error: "Claude took longer than 90 seconds" } }] }, proofs: new Map([["n1", { change: { why: "feat/8511-groups is not here, not even fetched" }, landed: { state: "never", how: "its branch is gone, with no merged PR and no same change in main" } }]]) })`,
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
import { InputState, TextareaState } from "gpui-base";
import { theme } from "herdr";
import { button, panel } from "./panel.js";
const answer = ${JSON.stringify(answer)};
const proofsFound = ${JSON.stringify(proofsFound)};
const projects = ${JSON.stringify({ all: true, projects: [
  { key: "github.com/acme/shop", name: "shop", isHere: true, isOn: true, hasSpace: true, counts: { open: 2, toVerify: 1, filed: 3 } },
  { key: "github.com/acme/billing", name: "billing", isHere: false, isOn: false, hasSpace: true, counts: { open: 0, toVerify: 0, filed: 0 } },
  { key: "github.com/acme/a-project-with-a-very-long-name-indeed", name: "a-project-with-a-very-long-name-indeed", isHere: false, isOn: true, hasSpace: false, counts: { open: 1, toVerify: 0, filed: 0 } },
] })};
const texts = ${JSON.stringify({ title: checkedNoteTitle, sections })};
export default class Scene extends View {
  init() {
    this.fields = { title: InputState.new({ value: texts.title }) };
    for (const [name, value] of Object.entries(texts.sections)) {
      this.fields[name] = TextareaState.new({ value });
      this.fields[name].set_auto_grow(2, 10);
    }
    this.reason = InputState.new({ placeholder: "Why it is not solved (kept with the note)" });
  }
  render() {
    const t = theme();
    const fields = this.fields;
    const reason = this.reason;
    const labels = { problem: { label: "checked" }, evidence: { label: "agent", swap: "claude" }, current: { label: "corrected", swap: "agent" }, desired: { label: "unsure", question: "A dash, or refuse the invoice?" } };
    const editor = (over) => ({ id: "n4", fields, reason: null, texts, labels, hits: [], isChecking: false, target: { kind: "github" }, line: "→ acme/shop (public) · triage · board Shop › Backlog", similar: [], off: null, error: "", isFiling: false, notGone: null, gone: null, checkError: null, canCopy: false, canStartOver: false, ...over });
    const base = { t, answer, view: "list", expanded: new Set(), selected: null, undo: null, checking: new Set(), editor: null, justFiled: new Set(), proofs: new Map(), verifying: new Set(), fixing: new Set(), mono: "Menlo", notice: null, error: "", projects: null, collecting: answer.collecting, noProject: null, act: () => {} };
    return ${draw};
  }
}
`);
  return dir;
}

describe.skipIf(!HERDR)("the box drawn by Herdr's engine", () => {
  for (const [name, draw] of Object.entries(scenes)) {
    // Each scene starts Herdr's engine in a hidden window: give a busy machine time.
    test(name, () => {
      const result = spawnSync(HERDR, ["check", sceneMod(name, draw)], { encoding: "utf8" });
      expect(`${result.stdout}${result.stderr}`).toContain("check passed");
      expect(result.status).toBe(0);
    }, 30000);
  }
});

// "Just filed" lives in the app's storage, so a reload of the mod keeps it: checked with Herdr's own
// engine, as localStorage only exists there.
describe.skipIf(!HERDR)("Just filed in the app's storage", () => {
  test("kept across a reload, per project, gone after two hours or when cleared", () => {
    const dir = join(tempDir("ui-"), "just-filed");
    mkdirSync(dir, { recursive: true });
    for (const file of readdirSync(join(ROOT, "mods", "suggestion-box"))) {
      if (file.endsWith(".js")) copyFileSync(join(ROOT, "mods", "suggestion-box", file), join(dir, file === "main.js" ? "box-main.js" : file));
    }
    writeFileSync(join(dir, "mod.json"), '{ "place": "none", "title": "scene" }\n');
    writeFileSync(join(dir, "main.js"), `import { View } from "gpui-kit";
import { JustFiled } from "./box-main.js";
export default class Scene extends View {
  render() {
    const store = "suggestion-box.just-filed.test";
    const a = new JustFiled(store);
    a.clear();
    a.add("github.com/acme/shop", "n1");
    a.add("github.com/acme/shop", "n2");
    const b = new JustFiled(store);
    const found = [[...b.for("github.com/acme/shop")].join(","), [...b.for("github.com/acme/billing")].join(",")];
    localStorage.setItem(store, JSON.stringify({ key: "github.com/acme/shop", items: [{ id: "old", at: Date.now() - 3 * 3600000 }, { id: "new", at: Date.now() }] }));
    found.push([...b.for("github.com/acme/shop")].join(","));
    localStorage.setItem(store, JSON.stringify({ key: "github.com/acme/shop", ids: 5, at: Date.now() }));
    found.push([...b.for("github.com/acme/shop")].join(","));
    b.add("github.com/acme/shop", "n3");
    b.clear();
    found.push([...b.for("github.com/acme/shop")].join(","));
    throw new Error("REPORT " + JSON.stringify(found));
  }
}
`);
    const result = spawnSync(HERDR, ["check", dir], { encoding: "utf8" });
    // Kept across a reload, per project, each note for two hours, any other shape as nothing, cleared.
    expect(`${result.stdout}${result.stderr}`).toContain('REPORT ["n1,n2","","new","",""]');
  }, 30000);
});
