import { expect, test } from "bun:test";
import { canClaim, fold, stateOf, waitsToVerify } from "../mods/suggestion-box/events.js";

const base = { id: "n1", number: 1, status: "open", spotted: 1, solved: null };
const claimEvent = { type: "claim", at: "2026-11-26T11:00:00Z", branch: "feat/x", sha: "abc", how: "h", proof: "p", by: "agent" };

test("fold leaves the note itself alone", () => {
  const note = { ...base };
  fold(note, [{ type: "spotted", at: "2026-11-26T10:00:00Z" }]);
  expect(note.spotted).toBe(1);
});

test("each repeat counts", () => {
  const view = fold(base, [
    { type: "spotted", at: "2026-11-26T10:00:00Z" },
    { type: "spotted", at: "2026-11-26T10:01:00Z" },
  ]);
  expect(view.spotted).toBe(3);
  expect(stateOf(view)).toBe("open");
});

test("a claim puts an open note in To verify, its state underneath unchanged", () => {
  const view = fold(base, [claimEvent]);
  expect(waitsToVerify(view)).toBe(true);
  expect(view.status).toBe("open");
  expect(stateOf(view)).toBe("to verify");
  expect(view.solved).toMatchObject({ branch: "feat/x", how: "h", proof: "p", confirmed: null });
});

test("a filed note can be claimed and stays filed underneath", () => {
  const view = fold({ ...base, status: "filed", issue: { number: 812 } }, [claimEvent]);
  expect(view.status).toBe("filed");
  expect(stateOf(view)).toBe("to verify");
});

test("a second claim, or a claim on a binned or solved note, changes nothing", () => {
  const twice = fold(base, [claimEvent, { ...claimEvent, at: "2026-11-26T12:00:00Z", branch: "feat/y" }]);
  expect(twice.solved.branch).toBe("feat/x");
  expect(canClaim(fold({ ...base, status: "binned" }))).toBe(false);
  expect(fold({ ...base, status: "binned" }, [claimEvent]).solved).toBeNull();
});

test("seeing a confirmed solved note again reopens it", () => {
  const solved = { ...base, status: "solved", solved: { branch: "feat/x", confirmed: { at: "2026-11-26T09:00:00Z" } } };
  const view = fold(solved, [{ type: "spotted", at: "2026-11-26T10:00:00Z" }]);
  expect(view.status).toBe("open");
  expect(view.reopened).toEqual({ after: "feat/x", at: "2026-11-26T10:00:00Z" });
  expect(view.previous).toHaveLength(1);
  expect(view.solved).toBeNull();
});

test("events apply in time order, whatever order they come in", () => {
  const solved = { ...base, status: "solved", solved: { branch: "feat/x", confirmed: { at: "t" } } };
  const view = fold(solved, [
    { ...claimEvent, at: "2026-11-26T12:00:00Z" },
    { type: "spotted", at: "2026-11-26T10:00:00Z" },
  ]);
  expect(view.status).toBe("open");
  expect(stateOf(view)).toBe("to verify");
});
