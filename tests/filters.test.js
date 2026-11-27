// The panel's filters: what Now, Filed, Done and Binned hold, their counts, and a row's word.
import { describe, expect, test } from "bun:test";
import { filtered, rowState } from "../mods/suggestion-box/filters.js";

const open = { id: "o1", state: "open" };
const claim = { id: "v1", state: "to verify" };
const ready = { id: "f1", state: "filed", issue: { number: 1 }, actions: ["fix"] };
const fixing = { id: "f2", state: "filed", issue: { number: 2 }, fix: { branch: "fix/a" } };
const stuck = { id: "f3", state: "filed", issue: { number: 3 }, fixError: { why: "w" }, actions: ["fix"] };
const closed = { id: "c1", state: "filed", issue: { number: 4, closed: { at: "t" } } };
const landed = { id: "s1", state: "solved", solved: { confirmed: { at: "t" }, landed: { state: "landed", how: "PR #9 merged" } } };
const waiting = { id: "s2", state: "filed", issue: { number: 5 }, solved: { confirmed: { at: "t" } } };
const binned = { id: "b1", state: "binned" };
const answer = { notes: [claim, open], history: [ready, fixing, stuck, closed, landed, waiting, binned] };

describe("what each filter holds", () => {
  test("Now: claims, what needs you, open notes and what was just filed; the rest by state", () => {
    const f = filtered(answer, new Set(["f1"]));
    expect(f.now.toVerify).toEqual([claim]);
    expect(f.now.needs).toEqual([stuck]);
    expect(f.now.open).toEqual([open]);
    expect(f.now.justFiled).toEqual([ready]);
    // An issue still open on GitHub is under Filed, also when its fix is solved and waits to land.
    expect(f.filed.map((n) => n.id)).toEqual(["f3", "f2", "s2", "f1"]);
    expect(f.done.map((n) => n.id)).toEqual(["c1", "s1"]);
    expect(f.binned).toEqual([binned]);
    expect(f.counts).toEqual({ now: 4, filed: 4, done: 2, binned: 1 });
  });

  test("nothing at all, and no answer yet", () => {
    expect(filtered(null, null).counts).toEqual({ now: 0, filed: 0, done: 0, binned: 0 });
  });
});

test("a row's word and dot, in the panel's one colour language", () => {
  expect(rowState(stuck)).toEqual({ word: "needs you", kind: "needs" });
  expect(rowState(fixing)).toEqual({ word: "fixing", kind: "working" });
  expect(rowState({ ...fixing, fix: { starting: true } })).toEqual({ word: "starting", kind: "working" });
  expect(rowState(ready)).toEqual({ word: "ready", kind: "ready" });
  expect(rowState(closed)).toEqual({ word: "closed", kind: "done" });
  expect(rowState({ ...closed, solved: { confirmed: { at: "t" }, landed: { state: "landed" } } })).toEqual({ word: "landed", kind: "ready" });
  // Landed while its issue stayed open: that needs you, as in Now.
  expect(rowState({ ...waiting, solved: { confirmed: { at: "t" }, landed: { state: "landed", how: "PR #9 merged" } } })).toEqual({ word: "needs you", kind: "needs" });
  expect(rowState(landed)).toEqual({ word: "landed", kind: "ready" });
  expect(rowState(waiting)).toEqual({ word: "waiting to land", kind: "working" });
  expect(rowState({ id: "s3", state: "solved", solved: {} })).toEqual({ word: "solved", kind: "ready" });
  expect(rowState(binned)).toEqual({ word: "binned", kind: "done" });
});
