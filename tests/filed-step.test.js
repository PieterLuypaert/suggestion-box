// What a note just filed still needs, and the order Just filed shows them in.
import { expect, test } from "bun:test";
import { byNextStep, filedStep } from "../mods/suggestion-box/filed-step.js";

const filed = { id: "a", issue: { number: 812, boards: [{ title: "Shop", column: "Backlog" }] } };

test("ready: on its board, start the fix whenever you like", () => {
  expect(filedStep(filed)).toEqual({ kind: "ready", text: "On Shop › Backlog · start the fix whenever you like" });
  expect(filedStep({ issue: { number: 3 } }).text).toBe("Filed · start the fix whenever you like");
});

test("needs you: a fix that did not start, one that never reported back, not on the board", () => {
  expect(filedStep({ ...filed, fixError: { why: "uncommitted work" } })).toEqual({ kind: "needs", text: "Fix in new tab did not start: uncommitted work" });
  expect(filedStep({ ...filed, fix: { starting: true, isStale: true } }).kind).toBe("needs");
  expect(filedStep({ ...filed, board: { error: "run gh auth refresh -s project" } })).toEqual({ kind: "needs", text: "Not on the board: run gh auth refresh -s project", isBoard: true });
  expect(filedStep({ ...filed, board: { error: "e" }, fixError: { why: "w" } }).isBoard).toBeUndefined();
});

test("under way, and done", () => {
  expect(filedStep({ ...filed, fix: { starting: true } }).kind).toBe("working");
  expect(filedStep({ ...filed, fix: { branch: "fix/a" } })).toEqual({ kind: "working", text: "Being fixed in its own tab", branch: "fix/a" });
  expect(filedStep({ ...filed, issue: { number: 812, closed: { at: "t" } } })).toEqual({ kind: "done", text: "Closed on GitHub" });
});

test("a solved fix: waiting to land, landed but the issue still open, closed with its PR", () => {
  const solved = { branch: "fix/a", confirmed: { at: "t" } };
  expect(filedStep({ ...filed, fix: { branch: "fix/a" }, solved })).toEqual({ kind: "working", text: "Solved · waiting to land" });
  expect(filedStep({ ...filed, solved: { ...solved, landed: { state: "waiting", how: "PR #9 is open" } } })).toEqual({ kind: "working", text: "Solved · waiting to land · PR #9 is open" });
  const landed = { ...solved, landed: { state: "landed", how: "PR #9 merged" } };
  expect(filedStep({ ...filed, solved: landed })).toEqual({ kind: "needs", text: "The fix landed (PR #9 merged), but the issue is still open: close it on GitHub" });
  expect(filedStep({ ...filed, issue: { number: 812, closed: { at: "t" } }, solved: landed })).toEqual({ kind: "done", text: "Closed · PR #9 merged" });
});

test("what needs you comes first", () => {
  const notes = [{ ...filed, id: "ready" }, { ...filed, id: "fixing", fix: { branch: "fix/x" } }, { ...filed, id: "needs", board: { error: "e" } }];
  expect(byNextStep(notes).map((n) => n.id)).toEqual(["needs", "fixing", "ready"]);
});
