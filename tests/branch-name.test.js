// A fix's branch named like the repo's own tickets: the examples, the question, and Claude's answer.
import { expect, test } from "bun:test";
import { nameArgs, nameExamples, namePrompt, nameTypes, readName } from "../mods/suggestion-box/branch-name.js";

const records = [
  { ticket: 1, title: "Thumbnail copies are generated but never served", branch: "cleanup/unused-thumbnail-copies", launched_at: "2026-11-01" },
  { ticket: 2, title: "Invoices: a custom note per line", branch: "feat/invoice-line-custom-note", launched_at: "2026-11-03" },
  { ticket: 3, title: "Save on an invoice draft drops the last 200 ms of typing", branch: "fix/save-invoice-draft-drops-last", launched_at: "2026-11-05" },
  { ticket: 4, title: "Invoices slice 00", branch: "major/invoice-kinds", launched_at: "2026-11-06" },
  { ticket: 5, title: "No branch yet", launched_at: "2026-11-07" },
  { ticket: 6, title: "Save on a document drops typing", branch: "fix/save-document-drops-typing-2", launched_at: "2026-11-08" },
];

test("the examples: the person's own names, newest first, never major/ or the box's title words", () => {
  expect(nameExamples(records)).toEqual([
    { title: "Invoices: a custom note per line", branch: "feat/invoice-line-custom-note" },
    { title: "Thumbnail copies are generated but never served", branch: "cleanup/unused-thumbnail-copies" },
  ]);
  expect(nameExamples([])).toEqual([]);
  expect(nameExamples(undefined)).toEqual([]);
});

test("cleanup is a type only where the repo's tickets use it", () => {
  expect(nameTypes(nameExamples(records))).toContain("cleanup");
  expect(nameTypes([{ branch: "fix/a-b-c" }])).toEqual(["fix", "feat", "refactor", "perf", "docs", "chore", "ci"]);
});

test("the question: the rules, the examples and the ticket", () => {
  const examples = nameExamples(records);
  const question = namePrompt({ title: "formatDate throws on a null date", problem: "The PDF export crashes." }, examples, nameTypes(examples));
  expect(question).toContain("The type is one of: fix, feat, refactor, perf, docs, chore, ci, cleanup.");
  expect(question).toContain("- Invoices: a custom note per line → feat/invoice-line-custom-note");
  expect(question).toEndWith("Title: formatDate throws on a null date\nProblem: The PDF export crashes.");
  expect(namePrompt({ title: "A" }, [], nameTypes([]))).not.toContain("earlier tickets");
});

test("claude runs without tools, settings, MCP servers or a session", () => {
  const args = nameArgs("q");
  expect(args.slice(args.indexOf("--tools"), args.indexOf("--tools") + 2)).toEqual(["--tools", ""]);
  for (const flag of ["--strict-mcp-config", "--no-session-persistence", "--json-schema"]) expect(args).toContain(flag);
  expect(args.slice(args.indexOf("--setting-sources"), args.indexOf("--setting-sources") + 2)).toEqual(["--setting-sources", ""]);
  expect(args.at(-1)).toBe("q");
});

test("Claude's answer counts only when it keeps the rules", () => {
  const types = nameTypes([]);
  const said = (branch) => ({ code: 0, stdout: JSON.stringify({ is_error: false, structured_output: { branch } }), stderr: "" });
  expect(readName(said("fix/null-due-date-crashes-export"), types)).toEqual({ branch: "fix/null-due-date-crashes-export" });
  expect(readName(said("feat/csv-export"), types)).toEqual({ branch: "feat/csv-export" });
  for (const wrong of ["major/invoice-kinds", "cleanup/unused-copies", "fix/Null-Date", "fix/null", "fix/a-b-c-d-e-f-g", "fix/null_date_crash", `fix/${"a".repeat(30)}-${"b".repeat(30)}`]) {
    expect(readName(said(wrong), types).error).toBe(`"${wrong}" does not keep the rules`);
  }
  expect(readName({ code: 1, stdout: "", stderr: "Error: not logged in\n" }, types).error).toContain("not logged in");
  expect(readName({ code: null, stdout: "", stderr: "timed out" }, types).error).toContain("30 seconds");
});
