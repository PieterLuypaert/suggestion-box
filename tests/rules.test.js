// The states table of docs/plan.md section 6c, row by row.
import { describe, expect, test } from "bun:test";
import { actionsFor, applyAction, buttonsFor, isWatched, moveNotice, recordIssue, recordLanded, shownFor } from "../mods/suggestion-box/rules.js";

const NOW = "2026-11-26T12:00:00Z";
const claim = { branch: "feat/x", sha: "abc", how: "h", proof: "p", by: "agent", at: "t", confirmed: null };
const rows = {
  open: { number: 1, status: "open", solved: null },
  "to verify": { number: 2, status: "open", solved: claim },
  solved: { number: 3, status: "solved", solved: { ...claim, confirmed: { at: "t" } } },
  filed: { number: 4, status: "filed", issue: { number: 812 }, solved: null },
  "filed, then claimed": { number: 5, status: "filed", issue: { number: 812 }, solved: claim },
  "filed, then solved": { number: 6, status: "filed", issue: { number: 812 }, solved: { ...claim, confirmed: { at: "t" } } },
  binned: { number: 7, status: "binned", solved: null },
};

describe("the actions each state allows", () => {
  const table = {
    open: ["mark-solved", "check", "file", "bin"],
    "to verify": ["confirm", "not-solved"],
    solved: ["reopen"],
    filed: ["fix"],
    "filed, then claimed": ["confirm", "not-solved"],
    "filed, then solved": [],
    binned: ["restore"],
  };
  for (const [name, actions] of Object.entries(table)) {
    test(name, () => expect(actionsFor(rows[name])).toEqual(actions));
  }

  test("a claimed or solved note can never be filed", () => {
    for (const name of ["to verify", "solved", "filed, then claimed", "filed, then solved"]) expect(actionsFor(rows[name])).not.toContain("file");
  });

  test("a filed note with a fix running offers no second fix", () => {
    expect(actionsFor({ ...rows.filed, fix: { branch: "fix/x" } })).toEqual([]);
  });

  test("the list shows Mark solved only while the code changed", () => {
    expect(shownFor(rows.open)).toEqual(["check", "file", "bin"]);
    expect(shownFor({ ...rows.open, changed: { on: "main", kind: "changed" } })).toEqual(["mark-solved", "check", "file", "bin"]);
  });
});

test("the buttons are every action the state allows", () => {
  expect(buttonsFor(rows.open)).toEqual(["check", "file", "bin"]);
  expect(buttonsFor(rows.filed)).toEqual(["fix"]);
  expect(buttonsFor({ ...rows.filed, issue: { number: 812, closed: { at: "t" } } })).toEqual([]);
  expect(buttonsFor({ ...rows.open, changed: { on: "main" } })).toEqual(["mark-solved", "check", "file", "bin"]);
});

describe("what each action does", () => {
  test("bin and restore", () => {
    const binned = applyAction(rows.open, "bin", NOW).note;
    expect(binned).toMatchObject({ status: "binned", binned: { at: NOW }, updated: NOW });
    expect(applyAction(binned, "restore", NOW).note).toMatchObject({ status: "open", binned: null });
  });

  test("an Undo right after Bin keeps the check; a Restore later reads the code anew", () => {
    const check = { at: NOW, sections: {} };
    const binned = applyAction({ ...rows.open, check }, "bin", NOW).note;
    expect(applyAction(binned, "restore", "2026-11-26T12:00:05Z").note.check).toEqual(check);
    expect(applyAction(binned, "restore", "2026-11-26T12:05:00Z").note.check).toBeNull();
  });

  test("mark solved sends an open note to To verify, by you", () => {
    const note = applyAction(rows.open, "mark-solved", NOW, { branch: "feat/y" }).note;
    expect(note.solved).toMatchObject({ branch: "feat/y", by: "you", confirmed: null });
    expect(actionsFor(note)).toEqual(["confirm", "not-solved"]);
  });

  test("confirm solves an open note, and keeps a filed one filed", () => {
    expect(applyAction(rows["to verify"], "confirm", NOW).note).toMatchObject({ status: "solved", solved: { confirmed: { at: NOW } } });
    expect(applyAction(rows["filed, then claimed"], "confirm", NOW).note).toMatchObject({ status: "filed", solved: { confirmed: { at: NOW } } });
  });

  test("not solved puts a note back exactly where it was", () => {
    const open = applyAction(rows["to verify"], "not-solved", NOW, { reason: "still throws" }).note;
    expect(open).toMatchObject({ status: "open", solved: null, notVerified: { branch: "feat/x", reason: "still throws" } });
    const filed = applyAction(rows["filed, then claimed"], "not-solved", NOW).note;
    expect(filed.status).toBe("filed");
    expect(actionsFor(filed)).toEqual(["fix"]);
  });

  test("reopen puts a solved note back with the open ones", () => {
    expect(applyAction(rows.solved, "reopen", NOW).note).toMatchObject({ status: "open", solved: null, reopened: { by: "you" } });
  });

  const filing = { issue: { number: 812, url: "https://github.com/acme/shop/issues/812" }, repo: "acme/shop", closes: "Closes #812", title: "T", sections: { problem: "p" }, board: { ok: true } };

  test("file makes an open note filed, with its issue, and its draft goes", () => {
    const note = applyAction({ ...rows.open, draft: { title: "x" } }, "file", NOW, filing).note;
    expect(note).toMatchObject({ status: "filed", issue: { number: 812, closes: "Closes #812", at: NOW }, filed: { title: "T" }, board: { ok: true }, draft: null });
    expect(actionsFor(note)).toEqual(["fix"]);
  });

  test("an issue that exists is recorded whatever happened meanwhile: a claim that came in stays", () => {
    const note = recordIssue(rows["to verify"], NOW, filing);
    expect(note.status).toBe("filed");
    expect(note.solved).toEqual(claim);
    expect(actionsFor(note)).toEqual(["confirm", "not-solved"]);
  });

  test("confirm keeps the proofs and starts watching the fix; a landed one is no longer watched", () => {
    const proofs = { commits: [{ sha: "abc", subject: "fix" }], verify: { verdict: "verified" }, landed: { state: "waiting", how: "PR #44 is open" } };
    const note = applyAction({ ...rows["to verify"], verify: { verdict: "verified" } }, "confirm", NOW, { proofs }).note;
    expect(note.solved).toMatchObject({ confirmed: { at: NOW, proofs }, landed: { state: "waiting", at: NOW } });
    expect(isWatched(note)).toBe(true);
    const landed = recordLanded(note, NOW, { state: "landed", how: "PR #44 merged" });
    expect(landed.solved.landed).toMatchObject({ state: "landed", how: "PR #44 merged" });
    expect(isWatched(landed)).toBe(false);
  });

  test("a fix that never landed brings the note back to To verify, open or filed as it was", () => {
    const solved = applyAction(rows["to verify"], "confirm", NOW).note;
    const back = recordLanded(solved, NOW, { state: "never", how: "PR #44 was closed without merging" });
    expect(back).toMatchObject({ status: "open", solved: { confirmed: null, neverLanded: { how: "PR #44 was closed without merging" } } });
    expect(actionsFor(back)).toEqual(["confirm", "not-solved"]);
    const filed = recordLanded(applyAction(rows["filed, then claimed"], "confirm", NOW).note, NOW, { state: "never", how: "x" });
    expect(filed.status).toBe("filed");
    expect(actionsFor(filed)).toEqual(["confirm", "not-solved"]);
  });

  test("a claim's independent check goes with the claim", () => {
    const checked = { ...rows["to verify"], verify: { verdict: "verified" } };
    expect(applyAction(checked, "not-solved", NOW).note.verify).toBeNull();
    expect(applyAction({ ...rows.solved, verify: { verdict: "verified" } }, "reopen", NOW).note.verify).toBeNull();
    expect(applyAction(checked, "confirm", NOW).note.verify).toEqual({ verdict: "verified" });
  });

  test("an action the state does not allow is refused", () => {
    expect(applyAction(rows["to verify"], "bin", NOW).error).toBe("note 2 is to verify; bin is not one of its actions");
    expect(applyAction(rows.solved, "confirm", NOW).error).toContain("not one of its actions");
    expect(applyAction(rows.binned, "mark-solved", NOW).error).toContain("not one of its actions");
    expect(applyAction(rows.open, "check", NOW).error).toBe("check does not change a note's state");
  });
});

test("the notice when a note moves to To verify by itself", () => {
  const claimed = { number: 7, state: "to verify", solved: { by: "agent", branch: "fix/a" } };
  expect(moveNotice(claimed, "open")).toBe("Note 7 moved to To verify: an agent claimed it solved on fix/a.");
  expect(moveNotice(claimed, "filed")).toBe("Note 7 moved to To verify: an agent claimed it solved on fix/a.");
  expect(moveNotice({ ...claimed, solved: { ...claimed.solved, neverLanded: { how: "PR #44 was closed without merging" } } }, "solved"))
    .toBe("Note 7 is back in To verify: its fix never landed (PR #44 was closed without merging).");
  expect(moveNotice(claimed, "to verify")).toBeNull();
  expect(moveNotice(claimed, undefined)).toBeNull();
  expect(moveNotice({ ...claimed, state: "open" }, "to verify")).toBeNull();
});
