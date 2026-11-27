// The three proofs of a claim: following the note's lines through commits, the landed rules, the
// independent check's question and answer, and box.js proofs, verify, confirm and watch, in
// throwaway repos with stand-ins for gh and claude.
import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { run } from "../cli/box.js";
import { changeProof, landedProof } from "../cli/box/proofs.js";
import { fetch, FETCH_FRESH_MS } from "../cli/box/claude.js";
import { parseHunks } from "../mods/suggestion-box/lines.js";
import { changeRow, claimKey, claimVerdict, landedState, mapRange, pickPr, PROOFS_REFRESH_MS, proofsDue, readVerify, touchingLines, verifyArgs, verifyHolds, verifyPrompt } from "../mods/suggestion-box/proofs.js";
import { git, makeRepo, NOTE, RUN, suggest, tempDir } from "./helpers.js";

const BRANCH = "feat/8504-group-records";

describe("mapping a note's lines through a diff", () => {
  const map = (diff) => mapRange({ first: 40, last: 44 }, parseHunks(diff));

  test("lines added or removed above move it; below leave it", () => {
    expect(map("@@ -3,0 +4,2 @@")).toEqual({ first: 42, last: 46, isTouched: false });
    expect(map("@@ -3,2 +2,0 @@")).toEqual({ first: 38, last: 42, isTouched: false });
    expect(map("@@ -50,2 +50,9 @@")).toEqual({ first: 40, last: 44, isTouched: false });
  });

  test("a change inside it touches it; its lines follow the hunk's new lines", () => {
    expect(map("@@ -42 +42 @@")).toEqual({ first: 40, last: 44, isTouched: true });
    expect(map("@@ -38,10 +38,3 @@")).toEqual({ first: 38, last: 40, isTouched: true });
    expect(map("@@ -41,2 +41,0 @@")).toEqual({ first: 40, last: 42, isTouched: true });
    expect(map("@@ -1,5 +1,0 @@\n@@ -42,0 +38,3 @@")).toEqual({ first: 35, last: 42, isTouched: true });
  });

  test("all of it deleted shrinks to where it was", () => {
    expect(map("@@ -40,5 +39,0 @@")).toEqual({ first: 40, last: 40, isTouched: true });
  });

  test("a removed SQL comment or an added ++i is a line, not a file header", () => {
    const diff = "--- a/x\n+++ b/x\n@@ -42 +42 @@\n--- TODO: N+1 here\n+++i;";
    expect(touchingLines(diff, { first: 40, last: 44 })).toEqual([{ kind: "@", text: "@@ -42 +42 @@" }, { kind: "-", text: "-- TODO: N+1 here" }, { kind: "+", text: "++i;" }]);
  });

  test("the diff lines shown are those of the hunks that touch it", () => {
    const diff = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@ top\n-a\n+b\n@@ -42 +42 @@ fn\n-old\n+new";
    expect(touchingLines(diff, { first: 40, last: 44 })).toEqual([{ kind: "@", text: "@@ -42 +42 @@" }, { kind: "-", text: "old" }, { kind: "+", text: "new" }]);
  });
});

describe("the landed rules", () => {
  test("a merged PR counts first, whatever the merge style", () => {
    expect(landedState({ pr: { number: 44, state: "MERGED", mergeCommit: "abc" }, hasBranch: false })).toMatchObject({ state: "landed", how: "PR #44 merged", sha: "abc" });
  });

  test("else the solving commit in main, else the same patch there", () => {
    expect(landedState({ inMain: "9f3e21c4a8" })).toMatchObject({ state: "landed", how: "in main (9f3e21c)" });
    expect(landedState({ samePatch: "1234567890" })).toMatchObject({ state: "landed", how: "the same change is in main (1234567)" });
  });

  test("never: a PR closed unmerged, or the branch gone with nothing in main", () => {
    expect(landedState({ pr: { number: 44, state: "CLOSED" } })).toMatchObject({ state: "never", how: "PR #44 was closed without merging" });
    expect(landedState({ hasBranch: false })).toMatchObject({ state: "never" });
    expect(landedState({ hasBranch: false, knowsPrs: false })).toMatchObject({ state: "waiting", how: "its branch is gone, and its PR could not be looked up" });
    expect(landedState({ hasBranch: false, isDefault: true }).state).toBe("waiting");
  });

  test("waiting: an open PR, no PR yet, no commit yet", () => {
    expect(landedState({ pr: { number: 44, state: "OPEN" } })).toMatchObject({ state: "waiting", how: "PR #44 is open" });
    expect(landedState({})).toMatchObject({ state: "waiting", how: "no PR yet" });
    expect(landedState({ hasCommit: false }).how).toBe("no commit with the fix yet");
  });

  test("the PR that counts: merged, then open, then the newest", () => {
    expect(pickPr([{ number: 1, state: "CLOSED" }, { number: 2, state: "MERGED" }]).number).toBe(2);
    expect(pickPr([{ number: 1, state: "CLOSED" }, { number: 3, state: "OPEN" }]).number).toBe(3);
    expect(pickPr([{ number: 4, state: "CLOSED" }]).number).toBe(4);
    expect(pickPr(null)).toBeNull();
  });
});

describe("the independent check", () => {
  const out = (structured) => ({ code: 0, stdout: JSON.stringify({ is_error: false, structured_output: structured }), stderr: "" });

  test("it asks with the note, the claim and the change, read-only, on Sonnet", () => {
    const text = verifyPrompt({ title: "T", sections: { problem: "p" }, at: { path: "a.ts" } }, { branch: "feat/x", how: "h", proof: "t.test.ts", by: "agent" }, { path: "a.ts", commits: [{ sha: "abc", subject: "fix: it", lines: [{ kind: "-", text: "old" }, { kind: "+", text: "new" }] }] });
    for (const part of ['<claim branch="feat/x" by="an agent">', "<how>h</how>", "<proof>t.test.ts</proof>", '<commit sha="abc" subject="fix: it">', "-old\n+new"]) expect(text).toContain(part);
    const args = verifyArgs("q");
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
    expect(args[args.indexOf("--tools") + 1]).toBe("Read,Grep,Glob");
    expect(args).toContain("--no-session-persistence");
  });

  test("its answer: a verdict, why, and whether the named test asserts the fix", () => {
    expect(readVerify(out({ verdict: "verified", why: " gone ", test: { found: true, asserts_fix: true } }))).toEqual({ verdict: "verified", why: "gone", test: { found: true, assertsFix: true, why: null } });
    expect(readVerify(out({ verdict: "partly", why: "w", test: { found: false, asserts_fix: true } })).test.assertsFix).toBe(false);
    expect(readVerify(out({ verdict: "maybe", why: "w", test: {} })).error).toContain("could not check the fix");
    expect(readVerify({ code: null, stdout: "", stderr: "timed out" }).error).toContain("90 seconds");
  });

  test("a kept check holds while the branch's diff of the file is the same", () => {
    expect(verifyHolds({ basis: "a", verdict: "verified" }, "a")).toBe(true);
    expect(verifyHolds({ basis: "a", verdict: "verified" }, "b")).toBe(false);
    expect(verifyHolds({ basis: "a", error: "x" }, "a")).toBe(false);
    expect(verifyHolds(null, "a")).toBe(false);
  });
});

// A repo whose origin is a local bare repo, a note dropped on the ticket branch at line 42, after
// what `beforeDrop` does on that branch.
function setup({ verify = { verdict: "verified", why: "formatDate returns a dash now.", test: { found: true, asserts_fix: true } }, beforeDrop = null } = {}) {
  const bare = join(tempDir("bare-"), "shop.git");
  const repo = makeRepo({ origin: null });
  git(repo, "clone", "-q", "--bare", repo, bare);
  git(repo, `--git-dir=${bare}`, "symbolic-ref", "HEAD", "refs/heads/main");
  git(repo, "remote", "add", "origin", bare);
  git(repo, "fetch", "-q", "origin");
  git(repo, "remote", "set-head", "origin", "main");
  const box = join(tempDir(), "box");
  beforeDrop?.(repo);
  suggest(repo, box, [], NOTE);
  const dir = tempDir("stand-");
  const claude = join(dir, "claude");
  writeFileSync(claude, `#!/bin/sh\n{ echo "cwd=$PWD"; ls branch/src; } > "${dir}/claude.log"\ncat <<'JSON'\n${JSON.stringify({ is_error: false, structured_output: verify })}\nJSON\n`);
  chmodSync(claude, 0o755);
  const notes = join(box, "notes");
  const folder = join(notes, readdirSync(notes)[0]);
  const file = join(folder, readdirSync(folder).find((n) => n.endsWith(".json")));
  return { repo, bare, box, dir, file, id: JSON.parse(readFileSync(file, "utf8")).id, env: { SUGGESTION_BOX_HOME: box, SUGGESTION_BOX_CLAUDE: claude } };
}

describe("one fetch for the looks close together", () => {
  test("a fetch younger than 20 seconds is used again, an older one is fetched anew", () => {
    const s = setup();
    const before = git(s.repo, "rev-parse", "origin/main").trim();
    const other = join(tempDir("other-"), "shop");
    git(s.repo, "clone", "-q", s.bare, other);
    writeFileSync(join(other, "later.txt"), "later\n");
    git(other, "add", ".");
    git(other, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "later");
    git(other, "push", "-q", "origin", "HEAD:main");
    expect(fetch(s.repo)).toBe(true);
    expect(git(s.repo, "rev-parse", "origin/main").trim()).toBe(before);
    expect(fetch(s.repo, { now: Date.now() + FETCH_FRESH_MS + 1000 })).toBe(true);
    expect(git(s.repo, "rev-parse", "origin/main").trim()).not.toBe(before);
  });
});

// Rewrites lines of src/invoices.ts (1-based) and commits.
function edit(repo, message, change) {
  const path = join(repo, "src", "invoices.ts");
  const lines = readFileSync(path, "utf8").split("\n");
  change(lines);
  writeFileSync(path, lines.join("\n"));
  git(repo, "commit", "-qam", message);
  return git(repo, "rev-parse", "HEAD");
}

const claimOn = (s, branch = BRANCH) => suggest(s.repo, s.box, ["solved", "1"], "how: formatDate returns a dash\nproof: invoices.test.ts: a dash for null\n");
const noteOf = (s) => JSON.parse(readFileSync(s.file, "utf8"));

describe("proof 1: the change", () => {
  test("the commits that changed the note's lines, with those lines, and not the ones that only moved them", () => {
    const s = setup();
    edit(s.repo, "chore: a header", (lines) => lines.unshift("// header", ""));
    const fix = edit(s.repo, "fix: a dash for null", (lines) => (lines[43] = "line 42 fixed"));
    edit(s.repo, "chore: the end", (lines) => lines.push("end"));
    const change = changeProof(s.repo, noteOf(s), { branch: BRANCH });
    expect(change.ref).toBe(`refs/heads/${BRANCH}`);
    expect(change.commits.map((c) => [c.sha, c.subject])).toEqual([[fix, "fix: a dash for null"]]);
    expect(change.commits[0].lines).toEqual([{ kind: "@", text: "@@ -44 +44 @@" }, { kind: "-", text: "line 42" }, { kind: "+", text: "line 42 fixed" }]);
  });

  test("followed through a rename", () => {
    const s = setup();
    git(s.repo, "mv", "src/invoices.ts", "src/billing.ts");
    git(s.repo, "commit", "-qm", "refactor: rename");
    const path = join(s.repo, "src", "billing.ts");
    writeFileSync(path, readFileSync(path, "utf8").replace("line 43\n", "line 43 fixed\n"));
    git(s.repo, "commit", "-qam", "fix: in the renamed file");
    const change = changeProof(s.repo, noteOf(s), { branch: BRANCH });
    expect(change.path).toBe("src/billing.ts");
    expect(change.commits.map((c) => c.subject)).toEqual(["fix: in the renamed file"]);
  });

  test("a deleted file is a change", () => {
    const s = setup();
    git(s.repo, "rm", "-q", "src/invoices.ts");
    git(s.repo, "commit", "-qm", "chore: drop invoices");
    expect(changeProof(s.repo, noteOf(s), { branch: BRANCH }).commits.map((c) => c.subject)).toEqual(["chore: drop invoices"]);
  });

  test("after a rebase the note's commit is gone: its lines are found by the snippet on the branch's base", () => {
    const s = setup();
    git(s.repo, "switch", "-q", "main");
    edit(s.repo, "chore: main moves", (lines) => lines.unshift("// main"));
    git(s.repo, "push", "-q", "origin", "main");
    git(s.repo, "switch", "-q", "-c", "feat/redo");
    const fix = edit(s.repo, "fix: on a fresh branch", (lines) => (lines[42] = "line 42 fixed"));
    const change = changeProof(s.repo, noteOf(s), { branch: "feat/redo" });
    expect(change.commits.map((c) => c.sha)).toEqual([fix]);
  });

  test("a long branch is walked from the drop, however many commits it has", () => {
    const s = setup();
    git(s.repo, "mv", "src/invoices.ts", "src/billing.ts");
    git(s.repo, "commit", "-qm", "refactor: rename first");
    for (let i = 0; i < 55; i++) {
      writeFileSync(join(s.repo, "other.txt"), `${i}\n`);
      git(s.repo, "add", "other.txt");
      git(s.repo, "commit", "-qm", `chore: ${i}`);
    }
    const path = join(s.repo, "src", "billing.ts");
    writeFileSync(path, readFileSync(path, "utf8").replace("line 42\n", "line 42 fixed\n"));
    git(s.repo, "commit", "-qam", "fix: late");
    expect(changeProof(s.repo, noteOf(s), { branch: BRANCH }).commits.map((c) => c.subject)).toEqual(["fix: late"]);
  });

  test("main merged into the branch moves the lines but is never the fix", () => {
    const s = setup();
    git(s.repo, "switch", "-q", "main");
    edit(s.repo, "fix: a teammate on main", (lines) => (lines[41] = "line 42 by a teammate"));
    git(s.repo, "switch", "-q", BRANCH);
    git(s.repo, "merge", "-q", "--no-edit", "--no-ff", "main");
    edit(s.repo, "chore: elsewhere", (lines) => (lines[2] = "line 3 changed"));
    expect(changeProof(s.repo, noteOf(s), { branch: BRANCH }).commits).toEqual([]);
  });

  test("Open finds each commit's file under the name it had then", () => {
    const s = setup();
    const fix = edit(s.repo, "fix: before the rename", (lines) => (lines[41] = "line 42 fixed"));
    git(s.repo, "mv", "src/invoices.ts", "src/billing.ts");
    git(s.repo, "commit", "-qm", "refactor: rename");
    git(s.repo, "rm", "-q", "src/billing.ts");
    const gone = (git(s.repo, "commit", "-qm", "chore: drop billing"), git(s.repo, "rev-parse", "HEAD"));
    const change = changeProof(s.repo, noteOf(s), { branch: BRANCH });
    expect(change.commits.map((c) => [c.subject, c.path, c.at])).toEqual([["fix: before the rename", "src/invoices.ts", fix], ["chore: drop billing", "src/billing.ts", git(s.repo, "rev-parse", `${gone}^`)]]);
  });

  test("a fix committed on main but not pushed is seen", () => {
    const s = setup();
    git(s.repo, "switch", "-q", "main");
    const fix = edit(s.repo, "fix: on local main", (lines) => (lines[41] = "line 42 fixed"));
    const change = changeProof(s.repo, noteOf(s), { branch: "main", sha: fix });
    expect(change.ref).toBe("refs/heads/main");
    expect(change.commits.map((c) => c.sha)).toEqual([fix]);
  });

  test("a fix in another file than the note's: its commits and their files, as the change", () => {
    const s = setup();
    writeFileSync(join(s.repo, "src", "other.ts"), "fixed\n");
    git(s.repo, "add", "src/other.ts");
    git(s.repo, "commit", "-qm", "fix: in the file that really had it");
    const fix = git(s.repo, "rev-parse", "HEAD");
    const change = changeProof(s.repo, noteOf(s), { branch: BRANCH });
    expect(change.commits).toEqual([]);
    expect(change.elsewhere).toEqual([{ sha: fix, subject: "fix: in the file that really had it", files: ["src/other.ts"] }]);
    expect(verifyPrompt(noteOf(s), { branch: BRANCH }, change)).toContain(`<commit sha="${fix}" subject="fix: in the file that really had it" files="src/other.ts"/>`);
  });

  test("a fix branch that started from a newer main: only its own commits count, never main's in between", () => {
    const s = setup();
    git(s.repo, "switch", "-q", "main");
    git(s.repo, "merge", "-q", "--no-ff", "--no-edit", BRANCH);
    writeFileSync(join(s.repo, "src", "teammate.ts"), "x\n");
    git(s.repo, "add", "src/teammate.ts");
    git(s.repo, "commit", "-qm", "feat: a teammate's work on main");
    git(s.repo, "push", "-q", "origin", "main");
    git(s.repo, "fetch", "-q", "origin");
    git(s.repo, "switch", "-q", "-c", "fix/elsewhere");
    writeFileSync(join(s.repo, "src", "fix.ts"), "fixed\n");
    git(s.repo, "add", "src/fix.ts");
    git(s.repo, "commit", "-qm", "fix: the real fix");
    const change = changeProof(s.repo, noteOf(s), { branch: "fix/elsewhere" });
    expect(change.elsewhere.map((c) => c.subject)).toEqual(["fix: the real fix"]);
  });

  test("a fix in another file stays the change after its branch is merged into main", () => {
    const s = setup();
    writeFileSync(join(s.repo, "src", "fix.ts"), "fixed\n");
    git(s.repo, "add", "src/fix.ts");
    git(s.repo, "commit", "-qm", "fix: in another file");
    const fix = git(s.repo, "rev-parse", "HEAD");
    git(s.repo, "switch", "-q", "main");
    git(s.repo, "merge", "-q", "--no-ff", "--no-edit", BRANCH);
    git(s.repo, "push", "-q", "origin", "main");
    git(s.repo, "fetch", "-q", "origin");
    git(s.repo, "switch", "-q", BRANCH);
    const change = changeProof(s.repo, noteOf(s), { branch: BRANCH });
    expect(change.elsewhere.map((c) => c.sha)).toEqual([fix]);
    expect(landedProof(s.repo, "github.com/acme/shop", { branch: BRANCH }, change, { SUGGESTION_BOX_GH: "/usr/bin/false" })).toMatchObject({ state: "landed", how: `in main (${fix.slice(0, 7)})` });
  });

  test("more than ten other changes: the newest kept, and how many more", () => {
    const s = setup();
    for (let i = 0; i < 12; i++) {
      writeFileSync(join(s.repo, "src", `f${i}.ts`), `${i}\n`);
      git(s.repo, "add", `src/f${i}.ts`);
      git(s.repo, "commit", "-qm", `chore: ${i}`);
    }
    const change = changeProof(s.repo, noteOf(s), { branch: BRANCH });
    expect(change.elsewhere).toHaveLength(10);
    expect(change.elsewhere.at(-1).subject).toBe("chore: 11");
    expect(change.elsewhereMore).toBe(2);
  });

  test("on the default branch other files are teammates' work, never the fix", () => {
    const s = setup();
    git(s.repo, "switch", "-q", "main");
    edit(s.repo, "chore: a teammate elsewhere", (lines) => (lines[2] = "line 3 changed"));
    writeFileSync(join(s.repo, "src", "other.ts"), "x\n");
    git(s.repo, "add", "src/other.ts");
    git(s.repo, "commit", "-qm", "feat: a teammate's file");
    expect(changeProof(s.repo, noteOf(s), { branch: "main", sha: git(s.repo, "rev-parse", "HEAD") }).elsewhere).toEqual([]);
  });

  test("no commit yet, and a branch that is not here", () => {
    const s = setup();
    expect(changeProof(s.repo, noteOf(s), { branch: BRANCH }).commits).toEqual([]);
    expect(changeProof(s.repo, noteOf(s), { branch: "feat/elsewhere" }).why).toBe("feat/elsewhere is not here, not even fetched");
  });
});

// The ticket's own work before the drop: a commit only the ticket branch has.
const ticketWork = (repo) => {
  writeFileSync(join(repo, "other.txt"), "ticket work\n");
  git(repo, "add", "other.txt");
  git(repo, "commit", "-qm", "feat: ticket work");
};

// A fix on main, pushed and fetched; the ticket branch checked out again.
function fixOnMain(s, change = (lines) => (lines[41] = "line 42 fixed")) {
  git(s.repo, "switch", "-q", "main");
  const fix = edit(s.repo, "fix: formatDate returns a dash", change);
  git(s.repo, "push", "-q", "origin", "main");
  git(s.repo, "fetch", "-q", "origin");
  git(s.repo, "switch", "-q", BRANCH);
  return fix;
}

describe("claims on main, and claimed commits that cannot be the fix", () => {
  const noPrs = (s) => {
    const file = join(s.dir, "gh");
    writeFileSync(file, "#!/bin/sh\necho '[]'\n");
    chmodSync(file, 0o755);
    return { ...s.env, SUGGESTION_BOX_GH: file };
  };
  const proofs = (s, claim) => {
    const note = noteOf(s);
    const change = changeProof(s.repo, note, claim);
    return { change, landed: landedProof(s.repo, "github.com/acme/shop", claim, change, noPrs(s), { since: note.created, from: note.from.sha }) };
  };

  test("marked solved on main for a note from a ticket with its own commits: main's fix is found where the two met", () => {
    const s = setup({ beforeDrop: ticketWork });
    const fix = fixOnMain(s);
    const { change, landed } = proofs(s, { branch: "main", by: "you" });
    expect(change.why).toBeUndefined();
    expect(change.commits.map((c) => c.sha)).toEqual([fix]);
    expect(landed).toMatchObject({ state: "landed", how: `in main (${fix.slice(0, 7)})` });
  });

  test("marked solved on main by you with no commit on its lines: main is where it lands, so it has", () => {
    const s = setup();
    const { change, landed } = proofs(s, { branch: "main", by: "you" });
    expect(change.commits).toEqual([]);
    expect(landed).toEqual({ state: "landed", how: "you marked it solved on main itself" });
  });

  test("an agent on main without a commit on its lines has not landed anything yet", () => {
    const s = setup();
    expect(proofs(s, { branch: "main", by: "agent", sha: noteOf(s).from.sha }).landed).toMatchObject({ state: "waiting", how: "no commit with the fix yet" });
  });

  test("an agent that claims before committing, on the commit it was dropped on, has no fix in main", () => {
    const s = setup();
    const drop = noteOf(s).from.sha;
    expect(proofs(s, { branch: BRANCH, by: "agent", sha: drop }).landed).toMatchObject({ state: "waiting", how: "no commit with the fix yet" });
  });

  test("a fresh branch from a newer main: the commit it claims on is main's own, not the fix", () => {
    const s = setup();
    const newer = fixOnMain(s, (lines) => (lines[2] = "line 3, a teammate's change"));
    git(s.repo, "switch", "-q", "-c", "fix/fresh", "origin/main");
    expect(proofs(s, { branch: "fix/fresh", by: "agent", sha: newer }).landed).toMatchObject({ state: "waiting", how: "no commit with the fix yet" });
  });

  test("the branch's own commit after the drop still counts, also once the branch is gone after its merge", () => {
    const s = setup();
    writeFileSync(join(s.repo, "src", "fix.ts"), "fixed\n");
    git(s.repo, "add", "src/fix.ts");
    git(s.repo, "commit", "-qm", "fix: in another file");
    const fix = git(s.repo, "rev-parse", "HEAD");
    git(s.repo, "switch", "-q", "main");
    git(s.repo, "merge", "-q", "--no-ff", "--no-edit", BRANCH);
    git(s.repo, "push", "-q", "origin", "main");
    git(s.repo, "fetch", "-q", "origin");
    git(s.repo, "branch", "-q", "-D", BRANCH);
    git(s.repo, "push", "-q", "origin", "--delete", BRANCH);
    git(s.repo, "update-ref", "-d", `refs/remotes/origin/${BRANCH}`);
    const { change, landed } = proofs(s, { branch: BRANCH, by: "agent", sha: fix });
    expect(change.why).toBe(`${BRANCH} is not here, not even fetched`);
    expect(landed).toMatchObject({ state: "landed", how: `in main (${fix.slice(0, 7)})` });
  });

  test("Confirm is refused once the fix never landed, and says what to do", async () => {
    // A GitHub origin, so its PR is looked up (from the stand-in); a dead proxy keeps git off the network.
    const s = setup({ beforeDrop: (repo) => {
      git(repo, "remote", "set-url", "origin", "https://github.com/Acme/shop.git");
      git(repo, "config", "http.proxy", "http://127.0.0.1:9");
    } });
    edit(s.repo, "fix: a dash", (lines) => (lines[41] = "line 42 fixed"));
    claimOn(s);
    const file = join(s.dir, "gh");
    writeFileSync(file, `#!/bin/sh\necho '${JSON.stringify([{ number: 44, state: "CLOSED", url: "u", mergeCommit: null, mergedAt: null, closedAt: new Date(Date.now() + 60000).toISOString() }])}'\n`);
    chmodSync(file, 0o755);
    const answer = await run(["act", s.repo, s.id, "confirm"], { ...s.env, SUGGESTION_BOX_GH: file });
    expect(answer.error).toBe("Its fix never landed (PR #44 was closed without merging): Not solved puts the note back, and a new claim can follow.");
    expect((await run(["read", s.repo], s.env)).notes.map((n) => n.state)).toEqual(["to verify"]);
  });
});

describe("proof 3: landed", () => {
  const gh = (dir, prs) => {
    const file = join(dir, "gh");
    writeFileSync(file, `#!/bin/sh\necho '${JSON.stringify(prs)}'\n`);
    chmodSync(file, 0o755);
    return { SUGGESTION_BOX_GH: file };
  };
  const landed = (s, branch, env = gh(s.dir, [])) => {
    const change = changeProof(s.repo, noteOf(s), { branch });
    return landedProof(s.repo, "github.com/acme/shop", { branch }, change, { ...s.env, ...env });
  };

  test("a merge: the solving commit is in the fetched main", () => {
    const s = setup();
    const fix = edit(s.repo, "fix: a dash", (lines) => (lines[41] = "line 42 fixed"));
    expect(landed(s, BRANCH).state).toBe("waiting");
    git(s.repo, "push", "-q", "origin", `${BRANCH}:main`);
    git(s.repo, "fetch", "-q", "origin");
    expect(landed(s, BRANCH)).toMatchObject({ state: "landed", how: `in main (${fix.slice(0, 7)})` });
  });

  test("a squash or rebase merge: the same patch is in main", () => {
    const s = setup();
    const fix = edit(s.repo, "fix: a dash", (lines) => (lines[41] = "line 42 fixed"));
    git(s.repo, "switch", "-q", "main");
    edit(s.repo, "chore: main moves", (lines) => lines.push("end"));
    git(s.repo, "cherry-pick", fix);
    git(s.repo, "push", "-q", "origin", "main");
    git(s.repo, "fetch", "-q", "origin");
    git(s.repo, "switch", "-q", BRANCH);
    expect(landed(s, BRANCH)).toMatchObject({ state: "landed", how: `the same change is in main (${fix.slice(0, 7)})` });
  });

  test("the branch's PR: merged, open, closed unmerged", () => {
    const s = setup();
    edit(s.repo, "fix: a dash", (lines) => (lines[41] = "line 42 fixed"));
    expect(landed(s, BRANCH, gh(s.dir, [{ number: 44, state: "MERGED", mergeCommit: { oid: "abc" } }]))).toMatchObject({ state: "landed", how: "PR #44 merged" });
    expect(landed(s, BRANCH, gh(s.dir, [{ number: 44, state: "OPEN" }]))).toMatchObject({ state: "waiting", how: "PR #44 is open" });
    expect(landed(s, BRANCH, gh(s.dir, [{ number: 44, state: "CLOSED" }]))).toMatchObject({ state: "never", how: "PR #44 was closed without merging" });
  });

  test("a branch that is gone here and on origin, with no merged PR and nothing in main, never landed", () => {
    const s = setup();
    const fix = edit(s.repo, "fix: a dash", (lines) => (lines[41] = "line 42 fixed"));
    const change = changeProof(s.repo, noteOf(s), { branch: BRANCH });
    git(s.repo, "switch", "-q", "main");
    git(s.repo, "branch", "-q", "-D", BRANCH);
    const proof = () => landedProof(s.repo, "github.com/acme/shop", { branch: BRANCH }, change, { ...s.env, ...gh(s.dir, []) });
    expect(proof().state).toBe("waiting");
    git(s.repo, "push", "-q", "origin", "--delete", BRANCH);
    // A fetched copy outlives a branch deleted on origin: origin itself is asked.
    git(s.repo, "update-ref", `refs/remotes/origin/${BRANCH}`, fix);
    expect(proof().state).toBe("never");
  });
});

describe("box.js proofs, verify, confirm and watch", () => {
  test("proofs: the change and where it stands, after a fetch", async () => {
    const s = setup();
    const fix = edit(s.repo, "fix: a dash", (lines) => (lines[41] = "line 42 fixed"));
    claimOn(s);
    const answer = await run(["proofs", s.repo, s.id], s.env);
    expect(answer.change.commits.map((c) => c.sha)).toEqual([fix]);
    expect(answer.landed.state).toBe("waiting");
  });

  test("verify: your claude reads a snapshot of the claim's branch; kept until the file's diff moves", async () => {
    const s = setup();
    edit(s.repo, "fix: a dash", (lines) => (lines[41] = "line 42 fixed"));
    claimOn(s);
    const first = await run(["verify", s.repo, s.id], s.env);
    expect(first.verify).toMatchObject({ verdict: "verified", why: "formatDate returns a dash now.", test: { found: true, assertsFix: true } });
    expect(readFileSync(join(s.dir, "claude.log"), "utf8")).toContain("invoices.ts");
    expect(noteOf(s).verify.verdict).toBe("verified");
    expect(await run(["verify", s.repo, s.id], s.env)).toEqual({ ok: true, reused: true });
    edit(s.repo, "fix: more", (lines) => (lines[42] = "line 43 fixed"));
    expect((await run(["verify", s.repo, s.id], s.env)).verify).toBeDefined();
    expect((await run(["verify", s.repo, s.id, "--again"], s.env)).verify).toBeDefined();
  });

  test("verify only a claim waiting to be verified", async () => {
    const s = setup();
    expect((await run(["verify", s.repo, s.id], s.env)).error).toBe("note 1 is open; only a claim waiting to be verified is checked");
  });

  test("confirm keeps the proofs as they stood; not solved drops the claim and its check", async () => {
    const s = setup();
    const fix = edit(s.repo, "fix: a dash", (lines) => (lines[41] = "line 42 fixed"));
    claimOn(s);
    await run(["verify", s.repo, s.id], s.env);
    await run(["act", s.repo, s.id, "confirm"], s.env);
    const confirmed = noteOf(s).solved;
    expect(confirmed.confirmed.proofs.commits).toEqual([{ sha: fix, subject: "fix: a dash" }]);
    expect(confirmed.confirmed.proofs.verify.verdict).toBe("verified");
    expect(confirmed.landed.state).toBe("waiting");
    const t = setup({ verify: { verdict: "not_fixed", why: "still throws", test: { found: false, asserts_fix: false } } });
    claimOn(t);
    await run(["verify", t.repo, t.id], t.env);
    await run(["act", t.repo, t.id, "not-solved", "--reason", "still throws"], t.env);
    expect(noteOf(t)).toMatchObject({ status: "open", solved: null, verify: null, notVerified: { reason: "still throws" } });
  });

  test("watch: a confirmed fix that lands says so; one that never lands comes back to To verify", async () => {
    const s = setup();
    edit(s.repo, "fix: a dash", (lines) => (lines[41] = "line 42 fixed"));
    claimOn(s);
    await run(["act", s.repo, s.id, "confirm"], s.env);
    expect((await run(["watch", s.repo], s.env)).results).toEqual([{ number: 1, state: "waiting", how: "no PR yet" }]);
    git(s.repo, "push", "-q", "origin", `${BRANCH}:main`);
    const watched = await run(["watch", s.repo], s.env);
    expect(watched.results[0].state).toBe("landed");
    expect(noteOf(s).solved.landed).toMatchObject({ state: "landed" });
    expect((await run(["watch", s.repo], s.env)).watched).toBe(0);

    const t = setup();
    edit(t.repo, "fix: a dash", (lines) => (lines[41] = "line 42 fixed"));
    claimOn(t);
    await run(["act", t.repo, t.id, "confirm"], t.env);
    git(t.repo, "switch", "-q", "main");
    git(t.repo, "branch", "-q", "-D", BRANCH);
    git(t.repo, "push", "-q", "origin", "--delete", BRANCH);
    // This origin is not on GitHub, so its PRs cannot be looked up: a gone branch is no proof.
    expect((await run(["watch", t.repo], t.env)).results).toEqual([{ number: 1, state: "waiting", how: "its branch is gone, and its PR could not be looked up" }]);
    expect((await run(["read", t.repo], t.env)).history[0].solved.confirmed).not.toBeNull();
  });

  test("watch: a fix that never landed brings the note back to To verify", async () => {
    const s = setup();
    edit(s.repo, "fix: a dash", (lines) => (lines[41] = "line 42 fixed"));
    claimOn(s);
    await run(["act", s.repo, s.id, "confirm"], s.env);
    const gh = join(s.dir, "gh");
    writeFileSync(gh, `#!/bin/sh\necho '[{"number":44,"state":"CLOSED","closedAt":"2099-01-01T00:00:00Z"}]'\n`);
    chmodSync(gh, 0o755);
    const note = noteOf(s);
    const change = changeProof(s.repo, note, note.solved);
    expect(landedProof(s.repo, "github.com/acme/shop", note.solved, change, { SUGGESTION_BOX_GH: gh }, { since: note.created })).toMatchObject({ state: "never", how: "PR #44 was closed without merging" });
  });

  test("a PR that closed before the note was dropped is an older use of the branch name", () => {
    expect(pickPr([{ number: 12, state: "MERGED", mergedAt: "2026-01-01T00:00:00Z" }, { number: 40, state: "OPEN" }], "2026-06-01T00:00:00Z").number).toBe(40);
    expect(pickPr([{ number: 12, state: "CLOSED", closedAt: "2026-01-01T00:00:00Z" }], "2026-06-01T00:00:00Z")).toBeNull();
    expect(pickPr([{ number: 41, state: "MERGED", mergedAt: "2026-07-01T00:00:00Z" }], "2026-06-01T00:00:00Z").number).toBe(41);
  });

  test("a fix still watched is never pruned, and stays in the history past 30 days", async () => {
    const s = setup();
    edit(s.repo, "fix: a dash", (lines) => (lines[41] = "line 42 fixed"));
    claimOn(s);
    await run(["act", s.repo, s.id, "confirm"], s.env);
    const later = new Date(Date.now() + 40 * 86400000);
    expect(await run(["prune", s.repo], s.env, later)).toEqual({ ok: true, pruned: 0 });
    expect((await run(["read", s.repo], s.env, later)).history.map((n) => n.number)).toEqual([1]);
  });

  test("show: the file as the solving commit has it", async () => {
    const s = setup();
    const fix = edit(s.repo, "fix: a dash", (lines) => (lines[41] = "line 42 fixed"));
    const shown = await run(["show", s.repo, fix, "src/invoices.ts", "42"], s.env);
    expect(readFileSync(shown.file, "utf8")).toContain("line 42 fixed");
    expect(shown.line).toBe(42);
  });

  test("prune removes the editor's copies a day after they were written, and keeps one shown since", async () => {
    const s = setup();
    const fix = edit(s.repo, "fix: a dash", (lines) => (lines[41] = "line 42 fixed"));
    const show = () => run(["show", s.repo, fix, "src/invoices.ts", "42"], s.env);
    const { file } = await show();
    expect(basename(RUN)).toStartWith("sbox-run-");
    expect(file.startsWith(join(RUN, "suggestion-box-files"))).toBe(true);
    const age = () => {
      const dayAgo = new Date(Date.now() - 86400000);
      utimesSync(file, dayAgo, dayAgo);
      utimesSync(dirname(file), dayAgo, dayAgo);
    };
    age();
    await show();
    expect(await run(["prune", s.repo], s.env)).toEqual({ ok: true, pruned: 0 });
    expect(existsSync(file)).toBe(true);
    age();
    expect(await run(["prune", s.repo], s.env)).toEqual({ ok: true, pruned: 0 });
    expect(existsSync(dirname(file))).toBe(false);
  });
});

describe("the verdict a claim's card leads with", () => {
  const change = { change: { path: "src/store.ts", commits: [{ sha: "415d818b35aa", path: "src/add-event/index.tsx" }], elsewhere: [] } };
  const landedAs = (state, how) => ({ ...change, landed: { state, how } });
  const verified = { verdict: "verified", why: "w", test: { found: true, assertsFix: true } };

  test("all three hold, or the fix still waits to land", () => {
    expect(claimVerdict({ found: landedAs("landed", "PR #10178 merged"), verify: verified })).toMatchObject({ tone: "fixed", text: "Looks fixed · 3 of 3 proofs hold" });
    const waiting = claimVerdict({ found: landedAs("waiting", "PR #44 is open"), verify: verified });
    expect(waiting).toMatchObject({ tone: "fixed", text: "Looks fixed · waiting to land" });
    expect(waiting.rows.map((r) => [r.name, r.text, r.state])).toEqual([["Change", "415d818 · index.tsx", "holds"], ["Claude", "Verified", "holds"], ["Landed", "PR #44 is open", "waiting"]]);
  });

  test("not fixed, partly, never landed, no commit found", () => {
    expect(claimVerdict({ found: landedAs("waiting", "no PR yet"), verify: { verdict: "not_fixed", why: "w" } }).tone).toBe("not-fixed");
    expect(claimVerdict({ found: landedAs("waiting", "no PR yet"), verify: { verdict: "partly", why: "w" } }).text).toBe("Partly fixed, says your Claude");
    expect(claimVerdict({ found: landedAs("never", "PR #44 was closed without merging"), verify: verified }).text).toBe("Looks fixed, but it never landed");
    expect(claimVerdict({ found: landedAs("never", "PR #44 was closed without merging"), verify: null })).toMatchObject({ tone: "not-fixed", text: "Its fix never landed" });
    expect(claimVerdict({ found: landedAs("never", "PR #44 was closed without merging"), verify: { verdict: "partly", why: "w" } }).text).toBe("Its fix never landed");
    expect(claimVerdict({ found: { change: { commits: [], elsewhere: [] }, landed: { state: "waiting", how: "no PR yet" } }, verify: verified }).text).toBe("Verified, but no commit of the fix was found");
  });

  test("still looking: a check running or waiting its turn; one that never ran or failed is not checked", () => {
    expect(claimVerdict({ found: { isLoading: true }, verify: null }).tone).toBe("looking");
    expect(claimVerdict({ found: landedAs("landed", "PR #1 merged"), verify: null, isVerifying: true }).text).toBe("Looking at the proofs…");
    expect(claimVerdict({ found: landedAs("landed", "PR #1 merged"), verify: null, isQueued: true }).rows[1]).toEqual({ name: "Claude", text: "waiting its turn…", state: "looking" });
    expect(claimVerdict({ found: landedAs("landed", "PR #1 merged"), verify: null })).toMatchObject({ tone: "unchecked", text: "2 of 3 proofs hold · not checked by your Claude" });
    expect(claimVerdict({ found: landedAs("landed", "PR #1 merged"), verify: { error: "timeout" } })).toMatchObject({ tone: "unchecked", text: "2 of 3 proofs hold · not checked by your Claude" });
  });

  test("verified, but the other proofs could not be looked up", () => {
    expect(claimVerdict({ found: { error: "gh failed" }, verify: verified })).toMatchObject({ tone: "partly", text: "Verified by your Claude, but the change or its PR could not be looked up" });
  });

  test("a claim's own key: a new claim on the same note is another key", () => {
    expect(claimKey({ id: "n1", solved: { at: "a" } })).not.toBe(claimKey({ id: "n1", solved: { at: "b" } }));
  });

  test("proofs are looked at again every half minute until the fix landed", () => {
    const at = 1_000_000;
    const waiting = { change: {}, landed: { state: "waiting", how: "PR #3 is open" }, at };
    expect(proofsDue(undefined, at)).toBe(true);
    expect(proofsDue(waiting, at + 10000)).toBe(false);
    // Due a little before the next half-minute beat, so a late beat never skips a round.
    expect(proofsDue(waiting, at + PROOFS_REFRESH_MS - 5000)).toBe(true);
    expect(proofsDue(waiting, at + PROOFS_REFRESH_MS + 1)).toBe(true);
    expect(proofsDue({ ...waiting, isRefreshing: true }, at + PROOFS_REFRESH_MS + 1)).toBe(false);
    expect(proofsDue({ isLoading: true }, at + PROOFS_REFRESH_MS + 1)).toBe(false);
    expect(proofsDue({ ...waiting, landed: { state: "landed", how: "PR #3 merged" } }, at + 10 * PROOFS_REFRESH_MS)).toBe(false);
    expect(proofsDue({ error: "gh failed", at }, at + PROOFS_REFRESH_MS + 1)).toBe(true);
  });

  test("a fix in another file names that file, and how many more", () => {
    const elsewhere = { change: { commits: [], elsewhere: [{ sha: "8f329a2aaaa", files: ["a/index.tsx", "a/index.test.tsx"] }] }, landed: { state: "waiting", how: "no PR yet" } };
    expect(changeRow(elsewhere)).toEqual({ name: "Change", text: "8f329a2 · index.tsx +1", state: "holds" });
  });
});
