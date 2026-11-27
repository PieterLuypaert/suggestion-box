// Fix in new tab: the branch a fix gets, when the button shows, and box.js fix with a stand-in
// launcher that logs how it was run, so no tab, worktree or ticket is ever made.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../cli/box.js";
import { claudeBranch, loginShell } from "../cli/box/fix.js";
import { branchCandidates, fixGate, fixType, lastLine, pickBranch, readLaunch } from "../mods/suggestion-box/fix.js";
import { git, makeRepo, NOTE, suggest, tempDir } from "./helpers.js";

describe("the branch a fix gets", () => {
  test("fix, docs or chore, from the title", () => {
    expect(fixType("formatDate throws on a null date")).toBe("fix");
    expect(fixType("README lists env vars that are gone")).toBe("docs");
    expect(fixType("The linter config skips the tests folder")).toBe("chore");
  });

  test("the title's words, then -2 and -3, then under fix and chore", () => {
    expect(branchCandidates("formatDate throws on a null date")).toEqual([
      "fix/formatdate-throws-null-date", "fix/formatdate-throws-null-date-2", "fix/formatdate-throws-null-date-3",
      "chore/formatdate-throws-null-date", "chore/formatdate-throws-null-date-2", "chore/formatdate-throws-null-date-3",
    ]);
    expect(branchCandidates("README is stale")[0]).toBe("docs/readme-stale");
  });

  test("the first name issues branch calls ok", () => {
    expect(pickBranch("fix/a\tlocal\nfix/a-2\tci:fix/\nfix/a-3\tok\n")).toBe("fix/a-3");
    expect(pickBranch("fix/a\tremote\n")).toBeNull();
  });

  test("what the launcher printed, and its last line when it failed", () => {
    expect(readLaunch("hagent says hi\ntb2\tt2\tfix/a\n")).toEqual({ tab: "tb2", pane: "t2", branch: "fix/a" });
    expect(readLaunch("nothing")).toBeNull();
    expect(lastLine("issues launch: git fetch failed, so fix/a can't start from a fresh main\n", "")).toBe("git fetch failed, so fix/a can't start from a fresh main");
    expect(lastLine("", "")).toBe("the launcher stopped without saying why");
  });
});

describe("when Fix in new tab shows", () => {
  const ready = { hasLauncher: true, hasHagent: true, knowsSpace: true, originRepo: "acme/shop", tracker: null };

  test("the launcher with its hagent and --space, and a GitHub origin", () => {
    expect(fixGate(ready)).toEqual({ can: true });
    expect(fixGate({ ...ready, hasLauncher: false }).why).toBe("the parallel-tickets launcher is not installed");
    expect(fixGate({ ...ready, hasHagent: false }).can).toBe(false);
    expect(fixGate({ ...ready, knowsSpace: false }).why).toContain("--space");
    expect(fixGate({ ...ready, originRepo: null }).why).toContain("not on GitHub");
  });

  test("a config's tracker must be GitHub and this repo", () => {
    expect(fixGate({ ...ready, tracker: { kind: "github", repo: "Acme/Shop" } })).toEqual({ can: true });
    expect(fixGate({ ...ready, tracker: { kind: "github", repo: null } })).toEqual({ can: true });
    expect(fixGate({ ...ready, tracker: { kind: "monday", repo: null } }).why).toBe("this project's tracker is monday");
    expect(fixGate({ ...ready, tracker: { kind: "github", repo: "acme/issues" } }).why).toBe("issues go to acme/issues, not to this repo");
  });
});

// A filed note in a repo whose origin is on GitHub, a stand-in launcher beside a hagent, and a
// stand-in claude that names the branch `name` (or fails without one), logging how it was asked.
function setup({ knowsSpace = true, hagent = true, taken = [], fail = "", name = null } = {}) {
  const repo = makeRepo();
  git(repo, "update-ref", "refs/remotes/origin/main", "main");
  const box = join(tempDir(), "box");
  suggest(repo, box, [], NOTE);
  const notes = join(box, "notes");
  const folder = join(notes, readdirSync(notes)[0]);
  const file = join(folder, readdirSync(folder).find((n) => n.endsWith(".json")));
  const note = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, JSON.stringify({ ...note, status: "filed", issue: { number: 812, url: "https://github.com/acme/shop/issues/812", repo: "acme/shop", closes: "Closes #812" }, filed: { title: note.title } }, null, 2));
  const dir = tempDir("launcher-");
  const launcher = join(dir, "issues");
  writeFileSync(launcher, `#!/bin/bash
# ${knowsSpace ? "--space)" : "no space flag here"}
echo "$PWD|$*" >> "${dir}/log"
case "$1" in
  branch) shift; status=1; for b in "$@"; do case " ${taken.join(" ")} " in *" $b "*) printf '%s\\tlocal\\n' "$b" ;; *) printf '%s\\tok\\n' "$b"; status=0 ;; esac; done; exit $status ;;
  launch) ${fail ? `echo "hagent: making the worktree" >&2; echo "issues launch: ${fail}" >&2; exit 1` : `echo "hagent: opened" >&2; printf 'tb2\\tt2\\t%s\\n' "$7"`} ;;
esac
`);
  chmodSync(launcher, 0o755);
  if (hagent) writeFileSync(join(dir, "hagent"), "#!/bin/sh\n");
  const claude = join(dir, "claude");
  const said = name ? `echo '${JSON.stringify({ is_error: false, structured_output: { branch: name } })}'` : 'echo "stand-in: no name" >&2; exit 1';
  writeFileSync(claude, `#!/bin/sh\n{ echo "cwd=$PWD"; for a in "$@"; do printf '%s\\n--\\n' "$a"; done; } > "${dir}/claude.log"\n${said}\n`);
  chmodSync(claude, 0o755);
  const env = { SUGGESTION_BOX_HOME: box, SUGGESTION_BOX_LAUNCHER: launcher, SUGGESTION_BOX_CLAUDE: claude, SHELL: "/bin/sh", HOME: tempDir("home-") };
  return { repo, box, file, dir, id: note.id, env };
}

const calls = (s) => readFileSync(join(s.dir, "log"), "utf8").trim().split("\n");
const noteOf = (s) => JSON.parse(readFileSync(s.file, "utf8"));

describe("box.js fix", () => {
  test("the button shows on a filed issue of this repo where the launcher can start it", async () => {
    const s = setup();
    const answer = await run(["read", s.repo], s.env);
    expect(answer.fixing).toEqual({ can: true });
    expect(answer.history[0].actions).toEqual(["fix"]);
    const t = setup({ knowsSpace: false });
    const without = await run(["read", t.repo], t.env);
    expect(without.fixing.can).toBe(false);
    expect(without.history[0].actions).toEqual([]);
  });

  test("a free branch, then issues launch --space from the main checkout; the note keeps the fix", async () => {
    const s = setup({ taken: ["fix/formatdate-throws-null-date"] });
    const answer = await run(["fix", s.repo, s.id, "sp1"], s.env);
    expect(answer).toEqual({ ok: true, tab: "tb2", pane: "t2", branch: "fix/formatdate-throws-null-date-2" });
    const [branch, launch] = calls(s);
    expect(branch).toStartWith(`${s.repo}|branch fix/formatdate-throws-null-date fix/formatdate-throws-null-date-2`);
    expect(launch).toBe(`${s.repo}|launch --space sp1 --ticket 812 --branch fix/formatdate-throws-null-date-2`);
    expect(noteOf(s).fix).toMatchObject({ branch: "fix/formatdate-throws-null-date-2", tab: "tb2", pane: "t2", space: "sp1" });
    const read = await run(["read", s.repo], s.env);
    expect(read.history[0].actions).toEqual([]);
  });

  test("Claude names the branch like the repo's own tickets; a taken name gets -2", async () => {
    const s = setup({ name: "fix/null-due-date-breaks-export", taken: ["fix/null-due-date-breaks-export"] });
    const records = join(s.repo, ".git", "herdr-parallel-issues");
    mkdirSync(records, { recursive: true });
    writeFileSync(join(records, "700.json"), JSON.stringify({ ticket: 700, repo: "acme/shop", title: "Thumbnails are made but never served", branch: "cleanup/unused-thumbnail-copies", launched_at: "2026-11-20T10:00:00Z" }));
    writeFileSync(join(records, "701.json"), JSON.stringify({ ticket: 701, repo: "acme/shop", title: "Save on a document drops the last keystrokes", branch: "fix/save-document-drops-last-keystrokes", launched_at: "2026-11-21T10:00:00Z" }));
    const answer = await run(["fix", s.repo, s.id, "sp1"], s.env);
    expect(answer).toMatchObject({ ok: true, branch: "fix/null-due-date-breaks-export-2" });
    const [branch, launch] = calls(s);
    expect(branch).toStartWith(`${s.repo}|branch fix/null-due-date-breaks-export fix/null-due-date-breaks-export-2 fix/null-due-date-breaks-export-3 fix/formatdate-throws-null-date`);
    expect(launch).toEndWith("--branch fix/null-due-date-breaks-export-2");
    const asked = readFileSync(join(s.dir, "claude.log"), "utf8");
    // An example the person named counts; the box's own title-words name does not.
    expect(asked).toContain("- Thumbnails are made but never served → cleanup/unused-thumbnail-copies");
    expect(asked).not.toContain("fix/save-document-drops-last-keystrokes");
    expect(asked).toContain("one of: fix, feat, refactor, perf, docs, chore, ci, cleanup.");
    expect(asked).toContain("Title: formatDate throws on a null date");
    expect(asked).toContain("Problem: Invoices without a due date crash the PDF export.");
    expect(asked).toContain("--tools\n--\n\n--\n");
    expect(asked).not.toContain(`cwd=${s.repo}`);
  });

  test("naming never throws, also when claude cannot even start", async () => {
    expect(await claudeBranch({ title: "formatDate throws on a null date" }, [], { SUGGESTION_BOX_CLAUDE: "/no\0such/claude" })).toBeNull();
  });

  test("a name that breaks the rules, or a Claude that fails: the title's words", async () => {
    const wrong = setup({ name: "major/null-due-date" });
    expect((await run(["fix", wrong.repo, wrong.id, "sp1"], wrong.env)).branch).toBe("fix/formatdate-throws-null-date");
    const failing = setup();
    expect((await run(["fix", failing.repo, failing.id, "sp1"], failing.env)).branch).toBe("fix/formatdate-throws-null-date");
    expect(calls(failing)[0]).toStartWith(`${failing.repo}|branch fix/formatdate-throws-null-date `);
  });

  test("a ticket the launcher started for the issue another way is its fix: shown, and never a second one", async () => {
    const s = setup();
    const records = join(s.repo, ".git", "herdr-parallel-issues");
    mkdirSync(records, { recursive: true });
    writeFileSync(join(records, "812.json"), JSON.stringify({ ticket: 812, repo: "acme/shop", branch: "fix/started-by-hand", tab: "tb7", pane: "t7", workspace: "sp1" }));
    const note = (await run(["read", s.repo], s.env)).history[0];
    expect(note.fix).toEqual({ branch: "fix/started-by-hand", tab: "tb7", pane: "t7", space: "sp1", byLauncher: true });
    expect(note.actions).toEqual([]);
    expect((await run(["fix", s.repo, s.id, "sp1"], s.env)).error).toBe("note 1 is already fixing in fix/started-by-hand; nothing started");
    writeFileSync(join(records, "812.json"), JSON.stringify({ ticket: 812, repo: "acme/other", branch: "fix/elsewhere" }));
    expect((await run(["read", s.repo], s.env)).history[0].actions).toEqual(["fix"]);
  });

  test("a fix never starts twice", async () => {
    const s = setup();
    await run(["fix", s.repo, s.id, "sp1"], s.env);
    expect((await run(["fix", s.repo, s.id, "sp1"], s.env)).error).toBe("note 1 is already fixing in fix/formatdate-throws-null-date; nothing started");
    expect(calls(s).filter((line) => line.includes("|launch "))).toHaveLength(1);
  });

  test("a failing launcher: its last line on the note, and the button stays", async () => {
    const s = setup({ fail: "the primary checkout has uncommitted work" });
    expect((await run(["fix", s.repo, s.id, "sp1"], s.env)).error).toBe("the primary checkout has uncommitted work");
    expect(noteOf(s).fix).toBeNull();
    expect(noteOf(s).fixError).toMatchObject({ why: "the primary checkout has uncommitted work" });
    expect((await run(["read", s.repo], s.env)).history[0].actions).toEqual(["fix"]);
  });

  test("no free name, no launcher, no space, an issue of another repo: nothing starts", async () => {
    const all = setup({ taken: ["fix/formatdate-throws-null-date", "fix/formatdate-throws-null-date-2", "fix/formatdate-throws-null-date-3", "chore/formatdate-throws-null-date", "chore/formatdate-throws-null-date-2", "chore/formatdate-throws-null-date-3"] });
    expect((await run(["fix", all.repo, all.id, "sp1"], all.env)).error).toStartWith('no free branch name for "formatDate throws on a null date"');
    const none = setup({ hagent: false });
    expect((await run(["fix", none.repo, none.id, "sp1"], none.env)).error).toBe("the parallel-tickets launcher is not installed");
    const nowhere = setup();
    expect((await run(["fix", nowhere.repo, nowhere.id], nowhere.env)).error).toBe("say which space of the Herdr app the tab opens in");
    const other = setup();
    writeFileSync(other.file, JSON.stringify({ ...noteOf(other), issue: { ...noteOf(other).issue, repo: "acme/issues" } }));
    expect((await run(["fix", other.repo, other.id, "sp1"], other.env)).error).toBe("issue #812 is not in this repo, so a ticket cannot start here");
  });

  test("the watch asks about exactly the filed issues: closed, then open again", async () => {
    const s = setup();
    const gh = join(s.dir, "gh");
    const answer = (state, closedAt, boards = []) => writeFileSync(gh, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${s.dir}/gh.log"\necho '${JSON.stringify({ data: { repository: { i812: { number: 812, state, closedAt, projectItems: { nodes: boards } } } } })}'\n`);
    answer("CLOSED", "2026-11-26T10:00:00Z");
    chmodSync(gh, 0o755);
    expect(await run(["watch", s.repo], { ...s.env, SUGGESTION_BOX_GH: gh })).toEqual({ ok: true, watched: 0, closed: 1 });
    expect(readFileSync(join(s.dir, "gh.log"), "utf8")).toContain("i812: issue(number: 812)");
    let note = (await run(["read", s.repo], s.env)).history[0];
    expect(note.issue.closed).toEqual({ at: "2026-11-26T10:00:00Z" });
    expect(note.actions).toEqual([]);
    expect((await run(["fix", s.repo, s.id, "sp1"], s.env)).error).toBe("note 1 is filed and issue #812 is closed; nothing started");
    answer("OPEN", null);
    expect((await run(["watch", s.repo], { ...s.env, SUGGESTION_BOX_GH: gh })).closed).toBe(1);
    note = (await run(["read", s.repo], s.env)).history[0];
    expect(note.issue.closed).toBeNull();
    expect(note.actions).toEqual(["fix"]);
    // A board's own workflow put it on the board later: the next look says so.
    answer("OPEN", null, [{ project: { title: "Shop" }, fieldValueByName: { name: "Todo" } }]);
    expect((await run(["watch", s.repo], { ...s.env, SUGGESTION_BOX_GH: gh })).closed).toBe(1);
    expect((await run(["read", s.repo], s.env)).history[0].issue.boards).toEqual([{ title: "Shop", column: "Todo" }]);
    expect((await run(["watch", s.repo], { ...s.env, SUGGESTION_BOX_GH: gh })).closed).toBe(0);
  });

  test("a start under way stops a second one, from any panel; one that never reported back is stale", async () => {
    const s = setup();
    const now = new Date();
    writeFileSync(s.file, JSON.stringify({ ...noteOf(s), fix: { starting: true, space: "sp1", at: now.toISOString() } }));
    expect((await run(["fix", s.repo, s.id, "sp1"], s.env)).error).toBe("a fix for note 1 is starting already; nothing started");
    expect((await run(["read", s.repo], s.env)).history[0].actions).toEqual([]);
    const later = new Date(now.getTime() + 11 * 60000);
    const stale = (await run(["read", s.repo], s.env, later)).history[0];
    expect(stale.fix.isStale).toBe(true);
    expect(stale.actions).toEqual(["fix"]);
    expect((await run(["fix", s.repo, s.id, "sp1"], s.env, later)).ok).toBe(true);
  });

  test("a launcher that cannot be read never stops the box from reading", async () => {
    const s = setup();
    const answer = await run(["read", s.repo], { ...s.env, SUGGESTION_BOX_LAUNCHER: s.dir });
    expect(answer.fixing.can).toBe(false);
    expect(answer.history[0].actions).toEqual([]);
  });

  test("the launcher runs through a login shell that speaks sh", () => {
    expect(loginShell({ SHELL: "/bin/zsh" })).toBe("/bin/zsh");
    expect(loginShell({ SHELL: "/opt/homebrew/bin/bash" })).toBe("/opt/homebrew/bin/bash");
    expect(loginShell({ SHELL: "/opt/homebrew/bin/fish" })).toBe("/bin/zsh");
  });
});
