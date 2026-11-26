import { describe, expect, test } from "bun:test";
import { age, dropProblem, noteId, parseAt, parseFields, sameNoteKey, snippetAround } from "../mods/suggestion-box/notes.js";

describe("parseFields", () => {
  test("reads key: value lines, with two-space continuations and blank lines kept", () => {
    const { fields } = parseFields("title: A\nevidence: first\n  second\n\n  third\ncurrent: c\n");
    expect(fields.title).toBe("A");
    expect(fields.evidence).toBe("first\nsecond\n\nthird");
    expect(fields.current).toBe("c");
  });

  test("keeps backticks, quotes and $ exactly as written", () => {
    const { fields } = parseFields("evidence: `x` \"y\" 'z' $(rm -rf /) $HOME\n");
    expect(fields.evidence).toBe("`x` \"y\" 'z' $(rm -rf /) $HOME");
  });

  test("a line that is not a field says how to fix it", () => {
    expect(parseFields("title: A\nError: boom\n").error).toContain("line 2 starts with 'Error:', which is not a field");
    expect(parseFields("title: A\njust text\n").error).toContain("line 2 is not a field");
  });

  test("a field given twice is refused", () => {
    expect(parseFields("title: A\ntitle: B\n").error).toBe("title is given twice");
  });

  test("an empty field reads as empty", () => {
    expect(parseFields("title:\n").fields.title).toBe("");
  });
});

describe("dropProblem", () => {
  const ok = { title: "T", problem: "p", evidence: "e", current: "c", desired: "d" };

  test("a complete note is fine", () => {
    expect(dropProblem(ok)).toBeNull();
  });

  test("the title must be one line of at most 100 characters", () => {
    const message = "keep the title to one line of at most 100 characters; put the rest in the sections";
    expect(dropProblem({ ...ok, title: "" })).toBe(message);
    expect(dropProblem({ ...ok, title: "a\nb" })).toBe(message);
    expect(dropProblem({ ...ok, title: "x".repeat(101) })).toBe(message);
    expect(dropProblem({ ...ok, title: "x".repeat(100) })).toBeNull();
  });

  test("missing sections are named", () => {
    expect(dropProblem({ title: "T", problem: "p", evidence: "e" })).toBe("missing current, desired; the issue needs all four sections");
    expect(dropProblem({ ...ok, current: "  " })).toBe("missing current; the issue needs all four sections");
  });

  test("a section over 500 characters is refused", () => {
    expect(dropProblem({ ...ok, evidence: "x".repeat(501) })).toBe("evidence is over 500 characters; keep it to the essentials");
  });
});

test("parseAt reads a path and an optional line", () => {
  expect(parseAt("src/a.ts:42")).toEqual({ path: "src/a.ts", line: 42 });
  expect(parseAt("src/a.ts")).toEqual({ path: "src/a.ts", line: null });
  expect(parseAt("src/a.ts:0")).toEqual({ path: "src/a.ts", line: null });
  expect(parseAt("")).toBeNull();
});

test("parseAt drops a column or the end of a range", () => {
  expect(parseAt("src/a.ts:42:7")).toEqual({ path: "src/a.ts", line: 42 });
  expect(parseAt("src/a.ts:10-20")).toEqual({ path: "src/a.ts", line: 10 });
});

test("sameNoteKey ignores case, spacing and a final full stop, but not the file", () => {
  const key = sameNoteKey("formatDate throws on a null date", "src/a.ts");
  expect(sameNoteKey("FormatDate  throws on a null date.", "src/a.ts")).toBe(key);
  expect(sameNoteKey("formatDate throws on a null date", "src/b.ts")).not.toBe(key);
  expect(key).toMatch(/^[0-9a-f]{16}$/);
});

test("noteId sorts by time", () => {
  expect(noteId(new Date("2026-11-26T10:45:12Z"), "k3f9")).toBe("20261126-104512-k3f9");
});

test("age reads like the box shows it", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  expect(age("2026-11-26T11:59:30Z", now)).toBe("now");
  expect(age("2026-11-26T11:56:00Z", now)).toBe("4m");
  expect(age("2026-11-26T10:00:00Z", now)).toBe("2h");
  expect(age("2026-11-23T12:00:00Z", now)).toBe("3d");
});

test("snippetAround keeps the five lines around a line, clipped at the file's ends", () => {
  const text = Array.from({ length: 10 }, (_, i) => `l${i + 1}`).join("\n");
  expect(snippetAround(text, 5)).toEqual({ start: 3, lines: ["l3", "l4", "l5", "l6", "l7"] });
  expect(snippetAround(text, 1)).toEqual({ start: 1, lines: ["l1", "l2", "l3"] });
  expect(snippetAround(text, 10)).toEqual({ start: 8, lines: ["l8", "l9", "l10"] });
  expect(snippetAround(text, 11)).toBeNull();
  expect(snippetAround(text, null)).toBeNull();
});
