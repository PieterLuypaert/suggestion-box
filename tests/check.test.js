// The check: what it asks, how it reads the answer, and box.js check with a stand-in claude in a
// throwaway repo whose origin is a local bare repo, so nothing reaches the network or the real claude.
import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../cli/box.js";
import { claudeArgs, explain, prompt, readAnswer, stillHolds } from "../mods/suggestion-box/check.js";
import { git, makeRepo, NOTE, suggest, tempDir } from "./helpers.js";

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
function setup(reply, { sleep = 0 } = {}) {
  const bare = join(tempDir("bare-"), "shop.git");
  const repo = makeRepo({ origin: null });
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
