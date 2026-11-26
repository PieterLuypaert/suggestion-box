import { expect, test } from "bun:test";
import { findSnippet, noteRange, parseHunks, touches } from "../mods/suggestion-box/lines.js";

test("parseHunks reads git's hunk headers, counts left out meaning one", () => {
  const diff = "diff --git a/x b/x\n@@ -3 +3 @@\n-a\n+b\n@@ -10,0 +11,2 @@\n+c\n+d\n@@ -20,3 +22,0 @@\n";
  expect(parseHunks(diff)).toEqual([
    { oldStart: 3, oldCount: 1, newStart: 3, newCount: 1 },
    { oldStart: 10, oldCount: 0, newStart: 11, newCount: 2 },
    { oldStart: 20, oldCount: 3, newStart: 22, newCount: 0 },
  ]);
});

test("touches: a rewrite or removal of one of the lines, or an insertion between them", () => {
  const hunk = (oldStart, oldCount) => [{ oldStart, oldCount, newStart: 0, newCount: 0 }];
  expect(touches(hunk(42, 1), 40, 44)).toBe(true);
  expect(touches(hunk(38, 3), 40, 44)).toBe(true);
  expect(touches(hunk(45, 2), 40, 44)).toBe(false);
  expect(touches(hunk(10, 5), 40, 44)).toBe(false);
  expect(touches(hunk(41, 0), 40, 44)).toBe(true);
  expect(touches(hunk(44, 0), 40, 44)).toBe(false);
  expect(touches(hunk(39, 0), 40, 44)).toBe(false);
});

test("noteRange: the snippet, else the one line, else nothing", () => {
  expect(noteRange({ snippet: { start: 40, lines: ["a", "b", "c", "d", "e"] }, at: { line: 42 } })).toEqual({ first: 40, last: 44 });
  expect(noteRange({ at: { line: 7 } })).toEqual({ first: 7, last: 7 });
  expect(noteRange({ at: null })).toBeNull();
});

test("findSnippet finds the lines again, ignoring spacing, nearest the old place", () => {
  const snippet = { lines: ["const ms = date.getTime();", "return ms;"] };
  const text = ["x", "const ms = date.getTime();", "return ms;", "y", "  const ms =   date.getTime();", "return ms;"].join("\n");
  expect(findSnippet(text, snippet, 1)).toBe(2);
  expect(findSnippet(text, snippet, 6)).toBe(5);
  expect(findSnippet("nothing here", snippet, 1)).toBeNull();
});

test("findSnippet: lines of only brackets prove nothing", () => {
  expect(findSnippet("}\n}\n", { lines: ["}", "}"] }, 1)).toBeNull();
});
