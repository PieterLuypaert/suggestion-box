// What a note just filed still needs, and the order Just filed shows them in.
import { describe, expect, test } from "bun:test";
import { byNextStep, filedGroups, filedStep, inHistory, isOffBoard } from "../mods/suggestion-box/filed-step.js";

const filed = { id: "a", issue: { number: 812, boards: [{ title: "Shop", column: "Backlog" }] }, actions: ["fix"] };
const offBoard = { id: "b", issue: { number: 813 }, board: { error: "run gh auth refresh -s project" }, actions: ["fix"] };

test("ready: on its board, start the fix whenever you like, where Fix in new tab is offered", () => {
  expect(filedStep(filed)).toEqual({ kind: "ready", text: "On Shop › Backlog · start the fix whenever you like" });
  expect(filedStep({ issue: { number: 3 }, actions: ["fix"] }).text).toBe("Filed · start the fix whenever you like");
  expect(filedStep({ ...filed, actions: [] }).text).toBe("On Shop › Backlog");
  expect(filedStep({ issue: { number: 3 } }).text).toBe("Filed");
});

test("needs you: a fix that did not start, one that never reported back, not on the board", () => {
  expect(filedStep({ ...filed, fixError: { why: "uncommitted work" } })).toEqual({ kind: "needs", text: "Fix in new tab did not start: uncommitted work" });
  expect(filedStep({ ...filed, fix: { starting: true, isStale: true } }).kind).toBe("needs");
  expect(filedStep(offBoard)).toEqual({ kind: "needs", text: "Not on the board: run gh auth refresh -s project", isBoard: true });
  expect(filedStep({ ...offBoard, fixError: { why: "w" } }).isBoard).toBeUndefined();
});

test("the board's failure counts until GitHub shows the issue on a board, or the issue closes", () => {
  expect(isOffBoard(offBoard)).toBe(true);
  expect(isOffBoard({ ...offBoard, issue: { number: 813, boards: [{ title: "Shop" }] } })).toBe(false);
  expect(filedStep({ ...offBoard, issue: { number: 813, boards: [{ title: "Shop" }] } }).kind).toBe("ready");
  expect(isOffBoard({ ...offBoard, issue: { number: 813, closed: { at: "t" } } })).toBe(false);
});

test("a solve you confirmed outranks a fix that failed or never answered before it", () => {
  const confirmed = { branch: "fix/a", confirmed: { at: "t" } };
  expect(filedStep({ ...filed, fixError: { why: "w" }, solved: confirmed }).kind).toBe("working");
  expect(filedStep({ ...filed, fix: { starting: true, isStale: true }, solved: confirmed }).kind).toBe("working");
  expect(filedStep({ ...offBoard, solved: confirmed }).kind).toBe("working");
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
  const notes = [{ ...filed, id: "ready" }, { ...filed, id: "fixing", fix: { branch: "fix/x" } }, { ...offBoard, id: "needs" }];
  expect(byNextStep(notes).map((n) => n.id)).toEqual(["needs", "fixing", "ready"]);
});

describe("the list's filed groups", () => {
  const ready = { ...filed, id: "ready", state: "filed" };
  const working = { ...filed, id: "working", state: "filed", fix: { branch: "fix/a" } };
  const stale = { ...filed, id: "stale", state: "filed", fix: { starting: true, isStale: true } };
  const landedOpen = { ...filed, id: "landed", state: "filed", solved: { confirmed: { at: "t" }, landed: { state: "landed", how: "PR #9 merged" } } };
  const binned = { id: "binned", state: "binned" };
  const history = [ready, working, stale, landedOpen, binned];

  test("needs you holds every filed note that needs you, also one filed long ago; just filed the rest of the new ones", () => {
    const groups = filedGroups(history, new Set(["ready", "working", "stale"]));
    expect(groups.needs.map((n) => n.id)).toEqual(["stale", "landed"]);
    expect(groups.justFiled.map((n) => n.id)).toEqual(["working", "ready"]);
    expect(filedGroups(history, null)).toEqual({ needs: [stale, landedOpen], justFiled: [] });
    expect(filedGroups(undefined, new Set())).toEqual({ needs: [], justFiled: [] });
  });

  test("the history leaves out what the list shows", () => {
    expect(inHistory(history, new Set(["ready"])).map((n) => n.id)).toEqual(["working", "binned"]);
    expect(inHistory(history, new Set()).map((n) => n.id)).toEqual(["ready", "working", "binned"]);
  });
});
