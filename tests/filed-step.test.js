// What a note just filed still needs, and the order Just filed shows them in.
import { expect, test } from "bun:test";
import { byNextStep, filedStep } from "../mods/suggestion-box/filed-step.js";

const filed = { id: "a", issue: { number: 812, boards: [{ title: "QIT", column: "Backlog" }] } };

test("ready: on its board, start the fix whenever you like", () => {
  expect(filedStep(filed)).toEqual({ kind: "ready", text: "On QIT › Backlog · start the fix whenever you like" });
  expect(filedStep({ issue: { number: 3 } }).text).toBe("Filed · start the fix whenever you like");
});

test("needs you: a fix that did not start, one that never reported back, not on the board", () => {
  expect(filedStep({ ...filed, fixError: { why: "uncommitted work" } })).toEqual({ kind: "needs", text: "Fix in new tab did not start: uncommitted work" });
  expect(filedStep({ ...filed, fix: { starting: true, isStale: true } }).kind).toBe("needs");
  expect(filedStep({ ...filed, board: { error: "run gh auth refresh -s project" } })).toEqual({ kind: "needs", text: "Not on the board: run gh auth refresh -s project" });
});

test("under way, and done", () => {
  expect(filedStep({ ...filed, fix: { starting: true } }).kind).toBe("working");
  expect(filedStep({ ...filed, fix: { branch: "fix/a" } })).toEqual({ kind: "working", text: "Being fixed in fix/a" });
  expect(filedStep({ ...filed, issue: { number: 812, closed: { at: "t" } } })).toEqual({ kind: "done", text: "#812 is closed on GitHub" });
});

test("what needs you comes first", () => {
  const notes = [{ ...filed, id: "ready" }, { ...filed, id: "fixing", fix: { branch: "fix/x" } }, { ...filed, id: "needs", board: { error: "e" } }];
  expect(byNextStep(notes).map((n) => n.id)).toEqual(["needs", "fixing", "ready"]);
});
