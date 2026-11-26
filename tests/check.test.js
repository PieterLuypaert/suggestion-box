// The check: what it asks, how it reads the answer, and box.js check with a stand-in claude in a
// throwaway repo whose origin is a local bare repo, so nothing reaches the network or the real claude.
import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../cli/box.js";
import { checkedSummary, claudeArgs, explain, prompt, readAnswer, stillHolds } from "../mods/suggestion-box/check.js";
import { git, makeRepo, NOTE, ROOT, suggest, tempDir } from "./helpers.js";
import { applyAction } from "../mods/suggestion-box/rules.js";

const note = {
  title: "formatDate throws on a null date",
  at: { path: "src/invoices.ts", line: 42 },
  from: { sha: "abc", branch: "feat/x" },
  sections: { problem: "p", evidence: "e", current: "c", desired: "Unsure: d?" },
  snippet: { start: 40, lines: ["a", "b"] },
};
const answer = (out) => ({ code: 0, stdout: JSON.stringify({ is_error: false, structured_output: out }), stderr: "" });
const sections = (overrides = {}) => ({ problem: { verdict: "checked" }, evidence: { verdict: "checked" }, current: { verdict: "checked" }, desired: { verdict: "checked" }, ...overrides });

describe("what the check asks", () => {
  test("the prompt holds the note, its snippet, its diffs and the worktree's change", () => {
    const text = prompt(note, { mainRef: "origin/main", branch: "feat/x", diffs: { main: "@@ -42 +42 @@", branch: "" }, worktreeDiff: "+fix" });
    for (const part of ['title="formatDate throws on a null date"', 'file="src/invoices.ts"', "<desired>Unsure: d?</desired>", 'start_line="40"', "@@ -42 +42 @@", "+fix", "main/ (origin/main)", "branch/ (feat/x)"]) {
      expect(text).toContain(part);
    }
  });

  test("claude runs with the read tools only and none of the person's settings, memory or MCP servers", () => {
    const args = claudeArgs("q");
    const after = (flag) => args[args.indexOf(flag) + 1];
    expect(after("--tools")).toBe("Read,Grep,Glob");
    expect(after("--allowedTools")).toBe("Read,Grep,Glob");
    expect(after("--setting-sources")).toBe("");
    expect(after("--model")).toBe("sonnet");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--no-session-persistence");
    expect(JSON.parse(after("--json-schema")).required).toEqual(["sections", "gone"]);
    expect(args[args.length - 1]).toBe("q");
  });
});

describe("the line a checked note shows", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  const at = (minutes) => new Date(now - minutes * 60000).toISOString();

  test("who checked it, how long ago, and what it found", () => {
    expect(checkedSummary({ at: at(2), sections: sections({ current: { verdict: "corrected", text: "x" } }), gone: null }, now)).toBe("Checked by your Claude · 2m ago · 3 hold, 1 corrected");
    expect(checkedSummary({ at: at(0), sections: sections(), gone: null }, now)).toBe("Checked by your Claude · just now · 4 hold");
    expect(checkedSummary({ at: at(180), sections: sections({ desired: { verdict: "unsure", question: "?" } }), gone: { on: "main", why: "w" } }, now)).toBe("Checked by your Claude · 3h ago · 3 hold, 1 unsure · looks solved");
  });

  test("no line before a check, after a failed one, and no time when it has none", () => {
    expect(checkedSummary(null, now)).toBeNull();
    expect(checkedSummary({ at: at(1), error: "timeout" }, now)).toBeNull();
    expect(checkedSummary({ sections: sections(), gone: null }, now)).toBe("Checked by your Claude · 4 hold");
  });
});

describe("reading the answer", () => {
  test("a verdict per section, and gone when the problem is no longer there", () => {
    const read = readAnswer(answer({ sections: sections({ current: { verdict: "corrected", text: " better " }, desired: { verdict: "unsure", question: "which?" } }), gone: { is_gone: true, on: "main", why: "fixed in 9f3e21c" } }));
    expect(read.sections.current).toEqual({ verdict: "corrected", text: "better" });
    expect(read.sections.desired).toEqual({ verdict: "unsure", question: "which?" });
    expect(read.gone).toEqual({ on: "main", why: "fixed in 9f3e21c" });
    expect(readAnswer(answer({ sections: sections(), gone: { is_gone: false } })).gone).toBeNull();
  });

  test("a correction without its text becomes a question", () => {
    expect(readAnswer(answer({ sections: sections({ problem: { verdict: "corrected" } }), gone: { is_gone: false } })).sections.problem.verdict).toBe("unsure");
  });

  test("no answer says why in words a person reads", () => {
    expect(readAnswer({ code: 1, stdout: JSON.stringify({ is_error: true, result: "Not logged in · Please run /login" }), stderr: "" }).error).toContain("not logged in");
    expect(readAnswer({ code: null, stdout: "", stderr: "timed out" }).error).toContain("took longer than 90 seconds");
    expect(readAnswer({ code: 1, stdout: "garbage", stderr: "" }).error).toBe("Claude could not check the note: garbage");
    expect(readAnswer(answer({ sections: { problem: { verdict: "maybe" } }, gone: { is_gone: false } })).error).toBeDefined();
    expect(explain("API Error: 529 overloaded")).toContain("overloaded");
  });

  test("a kept check holds while the code it read stays the same", () => {
    const basis = { main: "m", branch: "b", worktree: null };
    expect(stillHolds({ basis }, basis)).toBe(true);
    expect(stillHolds({ basis }, { ...basis, main: "m2" })).toBe(false);
    expect(stillHolds({ basis, error: "x" }, basis)).toBe(false);
    expect(stillHolds(null, basis)).toBe(false);
  });
});

// A repo whose origin is a local bare clone, a box, and a stand-in claude that logs how it was run.
function setup(reply, { sleep = 0, branch = "feat/8504-group-records", during = "" } = {}) {
  const bare = join(tempDir("bare-"), "shop.git");
  const repo = makeRepo({ origin: null, branch });
  git(repo, "clone", "-q", "--bare", repo, bare);
  git(repo, "remote", "add", "origin", bare);
  git(repo, "fetch", "-q", "origin");
  git(repo, "remote", "set-head", "origin", "main");
  const box = join(tempDir(), "box");
  const log = join(tempDir(), "claude.log");
  const stand = join(tempDir(), "claude");
  writeFileSync(stand, `#!/bin/sh
{ echo "cwd=$PWD"; ls main/src branch/src 2>&1; for a in "$@"; do echo "arg=$a"; done; } > "${log}"
sleep ${sleep}
${during}
cat <<'JSON'
${JSON.stringify({ is_error: false, structured_output: reply })}
JSON
`);
  chmodSync(stand, 0o755);
  return { repo, box, log, env: { SUGGESTION_BOX_HOME: box, SUGGESTION_BOX_CLAUDE: stand } };
}
const noteFile = (box) => {
  const notes = join(box, "notes");
  const dir = join(notes, readdirSync(notes)[0]);
  return join(dir, readdirSync(dir).find((n) => n.endsWith(".json")));
};

describe("box.js check", () => {
  test("checks a note on two snapshots with the person's claude, keeps the result, and cleans up", async () => {
    const s = setup({ sections: sections({ current: { verdict: "corrected", text: "It throws a TypeError." } }), gone: { is_gone: false } });
    suggest(s.repo, s.box, [], NOTE);
    const id = JSON.parse(readFileSync(noteFile(s.box), "utf8")).id;
    const result = await run(["check", s.repo, id], s.env);
    expect(result.ok).toBe(true);
    expect(result.check.sections.current).toEqual({ verdict: "corrected", text: "It throws a TypeError." });
    expect(result.check).toMatchObject({ fetched: true, gone: null });
    const log = readFileSync(s.log, "utf8");
    const cwd = log.match(/^cwd=(.*)$/m)[1];
    expect(log).toContain("invoices.ts");
    expect(log).toContain("arg=--setting-sources");
    expect(cwd).toContain("suggestion-box-check-");
    expect(existsSync(cwd)).toBe(false);
    expect(JSON.parse(readFileSync(noteFile(s.box), "utf8")).check.sections.current.verdict).toBe("corrected");
  });

  test("a kept check is reused until the note's file changes", async () => {
    const s = setup({ sections: sections(), gone: { is_gone: false } });
    suggest(s.repo, s.box, [], NOTE);
    const id = JSON.parse(readFileSync(noteFile(s.box), "utf8")).id;
    await run(["check", s.repo, id], s.env);
    expect(await run(["check", s.repo, id], s.env)).toEqual({ ok: true, reused: true });
    writeFileSync(join(s.repo, "src", "invoices.ts"), "changed\n");
    git(s.repo, "commit", "-qam", "change");
    expect((await run(["check", s.repo, id], s.env)).check).toBeDefined();
  });

  test("gone on main is named after the default branch", async () => {
    const s = setup({ sections: sections(), gone: { is_gone: true, on: "main", why: "returns a dash now" } });
    suggest(s.repo, s.box, [], NOTE);
    const id = JSON.parse(readFileSync(noteFile(s.box), "utf8")).id;
    expect((await run(["check", s.repo, id], s.env)).check.gone).toEqual({ on: "main", why: "returns a dash now" });
  });

  test("a check that takes too long is kept as not checked, with why", async () => {
    const s = setup({ sections: sections(), gone: { is_gone: false } }, { sleep: 3 });
    suggest(s.repo, s.box, [], NOTE);
    const id = JSON.parse(readFileSync(noteFile(s.box), "utf8")).id;
    const result = await run(["check", s.repo, id], { ...s.env, SUGGESTION_BOX_CHECK_TIMEOUT_MS: "300" });
    expect(result.check.error).toContain("took longer than");
    expect(result.check.sections).toBeUndefined();
  });

  test("only an open note is checked", async () => {
    const s = setup({ sections: sections(), gone: { is_gone: false } });
    suggest(s.repo, s.box, [], NOTE);
    suggest(s.repo, s.box, ["solved", "1"], "how: h\nproof: p\n");
    const id = JSON.parse(readFileSync(noteFile(s.box), "utf8")).id;
    expect((await run(["check", s.repo, id], s.env)).error).toBe("note 1 is to verify; only an open note is checked");
  });
});

describe("box.js check, after the review", () => {
  test("Check again runs anew even when nothing moved", async () => {
    const s = setup({ sections: sections(), gone: { is_gone: false } });
    suggest(s.repo, s.box, [], NOTE);
    const id = JSON.parse(readFileSync(noteFile(s.box), "utf8")).id;
    await run(["check", s.repo, id], s.env);
    expect(await run(["check", s.repo, id], s.env)).toEqual({ ok: true, reused: true });
    expect((await run(["check", s.repo, id, "--again"], s.env)).check).toBeDefined();
  });

  test("a check that ends after the note was binned is dropped", async () => {
    const s = setup({ sections: sections(), gone: { is_gone: false } });
    suggest(s.repo, s.box, [], NOTE);
    const id = JSON.parse(readFileSync(noteFile(s.box), "utf8")).id;
    writeFileSync(join(s.repo, ".bin-during"), `node "${join(ROOT, "cli", "box.js")}" act "${s.repo}" ${id} bin >/dev/null`);
    const stand = s.env.SUGGESTION_BOX_CLAUDE;
    writeFileSync(stand, readFileSync(stand, "utf8").replace("cat <<'JSON'", `SUGGESTION_BOX_HOME="${s.box}" sh "${join(s.repo, ".bin-during")}"\ncat <<'JSON'`));
    expect(await run(["check", s.repo, id], s.env)).toEqual({ ok: true, dropped: true });
    const written = JSON.parse(readFileSync(noteFile(s.box), "utf8"));
    expect(written.status).toBe("binned");
    expect(written.check ?? null).toBeNull();
  });

  test("a note dropped on the default branch gets no stale branch snapshot", async () => {
    const s = setup({ sections: sections(), gone: { is_gone: true, on: "branch", why: "x" } }, { branch: null });
    suggest(s.repo, s.box, [], NOTE);
    const id = JSON.parse(readFileSync(noteFile(s.box), "utf8")).id;
    const result = await run(["check", s.repo, id], s.env);
    expect(readFileSync(s.log, "utf8")).toMatch(/branch\/src.*No such file/);
    expect(result.check.basis.branch).toBeNull();
    expect(result.check.gone).toBeNull();
  });

  test("a timeout says how long the box really waited", async () => {
    const s = setup({ sections: sections(), gone: { is_gone: false } }, { sleep: 4 });
    suggest(s.repo, s.box, [], NOTE);
    const id = JSON.parse(readFileSync(noteFile(s.box), "utf8")).id;
    const result = await run(["check", s.repo, id], { ...s.env, SUGGESTION_BOX_CHECK_TIMEOUT_MS: "2000" });
    expect(result.check.error).toContain("longer than 2 seconds");
  });

  test("a stop from the panel ends claude and leaves no snapshot behind", async () => {
    const s = setup({ sections: sections(), gone: { is_gone: false } }, { sleep: 20 });
    suggest(s.repo, s.box, [], NOTE);
    const id = JSON.parse(readFileSync(noteFile(s.box), "utf8")).id;
    const tmp = tempDir("tmp-");
    const child = spawn("node", [join(ROOT, "cli", "box.js"), "check", s.repo, id], { env: { ...process.env, ...s.env, TMPDIR: tmp } });
    await new Promise((done) => setTimeout(done, 2500));
    expect(readdirSync(tmp).some((n) => n.startsWith("suggestion-box-check-"))).toBe(true);
    child.kill("SIGTERM");
    await new Promise((done) => child.on("close", done));
    expect(readdirSync(tmp).filter((n) => n.startsWith("suggestion-box-check-"))).toEqual([]);
  });

  test("not solved, restore and reopen clear the old check and its banner", () => {
    const old = { verdict: "checked" };
    const view = { number: 1, status: "open", solved: { branch: "b", confirmed: null }, check: { gone: { on: "main", why: "w" }, sections: { problem: old } } };
    expect(applyAction(view, "not-solved", "t").note.check).toBeNull();
    expect(applyAction({ ...view, status: "binned", solved: null }, "restore", "t").note.check).toBeNull();
  });
});
