// The issue editor's rules: what it opens with, the check's label on each field, and the line that
// says why Create issue is off, in the order the person meets them.
import { describe, expect, test } from "bun:test";
import { fieldLabel, fillProblem, isPublicTarget, offReason, startTexts, swapText, targetLine } from "../mods/suggestion-box/editor.js";

const sections = { problem: "p", evidence: "e", current: "c", desired: "Unsure: d?" };
const check = {
  sections: { problem: { verdict: "checked" }, evidence: { verdict: "checked" }, current: { verdict: "corrected", text: "c2" }, desired: { verdict: "unsure", question: "which?" } },
  gone: null,
};
const note = { title: "T", sections, check };
const texts = { title: "T", sections: { problem: "p", evidence: "e", current: "c2", desired: "d" } };
const target = { kind: "github", repo: "acme/shop", visibility: "private", label: "triage", labelMissing: false, board: null, hasConfig: true };

describe("what the editor opens with", () => {
  test("Claude's corrections, else the agent's text", () => {
    expect(startTexts(note)).toEqual({ title: "T", sections: { ...sections, current: "c2" } });
    expect(startTexts({ title: "T", sections })).toEqual({ title: "T", sections });
  });

  test("a draft wins, field by field", () => {
    expect(startTexts({ ...note, draft: { title: "T2", sections: { problem: "mine" } } })).toEqual({ title: "T2", sections: { ...sections, problem: "mine", current: "c2" } });
  });
});

describe("the check's label on a field", () => {
  test("checked, corrected, unsure with its question", () => {
    expect(fieldLabel(note, "problem", "p")).toEqual({ label: "checked", question: null });
    expect(fieldLabel(note, "current", "c2")).toEqual({ label: "corrected", swap: "agent" });
    expect(fieldLabel(note, "desired", "Unsure: d?")).toEqual({ label: "unsure", question: "which?" });
  });

  test("the agent's text put back over a correction, and the way back", () => {
    expect(fieldLabel(note, "current", "c")).toEqual({ label: "agent", swap: "claude" });
    expect(swapText(note, "current", "claude")).toBe("c2");
    expect(swapText(note, "current", "agent")).toBe("c");
  });

  test("a field you edit loses its label; spaces around it do not count", () => {
    expect(fieldLabel(note, "problem", "p, and more")).toBeNull();
    expect(fieldLabel(note, "current", "mine")).toBeNull();
    expect(fieldLabel(note, "problem", " p\n")).toEqual({ label: "checked", question: null });
  });

  test("while checking, after a failed check, and before any", () => {
    expect(fieldLabel(note, "problem", "p", { isChecking: true })).toEqual({ label: "checking" });
    expect(fieldLabel({ ...note, check: { error: "x" } }, "problem", "p")).toEqual({ label: "not-checked" });
    expect(fieldLabel({ title: "T", sections }, "problem", "p")).toBeNull();
  });
});

describe("what is missing", () => {
  test("the title first, then the sections in order", () => {
    expect(fillProblem({ title: " ", sections: texts.sections })).toBe("Fill in: Title");
    expect(fillProblem({ title: "T", sections: { ...texts.sections, current: "", desired: "" } })).toBe("Fill in: Current situation");
    expect(fillProblem({ title: "T", sections: { ...texts.sections, desired: "  " } })).toBe("Fill in: Desired situation");
    expect(fillProblem({ title: "a\nb", sections: texts.sections })).toContain("one line");
    expect(fillProblem({ title: "x".repeat(257), sections: texts.sections })).toContain("256");
    expect(fillProblem(texts)).toBeNull();
  });
});

describe("why Create issue is off", () => {
  const base = { note, texts, target };

  test("ready to go", () => {
    expect(offReason(base)).toBeNull();
  });

  test("in the order the person meets them", () => {
    expect(offReason({ ...base, isFiling: true })).toBe("Creating the issue…");
    expect(offReason({ ...base, isChecking: true })).toBe("Waiting for the check");
    expect(offReason({ ...base, note: { ...note, check: null } })).toBe("The check did not finish; check again");
    expect(offReason({ ...base, target: null })).toBe("Looking up where it goes");
    expect(offReason({ ...base, target: { kind: "github", why: "This project has no GitHub repo to file in" } })).toBe("This project has no GitHub repo to file in");
    expect(offReason({ ...base, texts: { ...texts, title: "" } })).toBe("Fill in: Title");
  });

  test("a failed check lets it go", () => {
    expect(offReason({ ...base, note: { ...note, check: { error: "timeout" } } })).toBeNull();
  });

  test("the check says the problem is gone, until you say it is not solved", () => {
    const gone = { ...note, check: { ...check, gone: { on: "main", why: "fixed" } } };
    expect(offReason({ ...base, note: gone })).toBe("The check says this is solved");
    expect(offReason({ ...base, note: gone, notGone: { reason: "" } })).toBeNull();
  });

  test("the scan: a token anywhere, other hits only where the repo may be public", () => {
    const withMail = { ...texts, sections: { ...texts.sections, evidence: "jan@acme.be saw it" } };
    expect(offReason({ ...base, texts: withMail })).toBeNull();
    expect(offReason({ ...base, texts: withMail, target: { ...target, visibility: "public" } })).toBe("Remove or mark fine an email address: this repo is public");
    expect(offReason({ ...base, texts: withMail, target: { ...target, visibility: null } })).toContain("mark fine");
    expect(offReason({ ...base, texts: withMail, target: { ...target, visibility: "public" }, fine: ["jan@acme.be"] })).toBeNull();
    expect(offReason({ ...base, texts: { ...texts, title: "ghp_0123456789abcdefghijABCDEFGHIJ0123" } })).toStartWith("Remove a GitHub token");
  });

  test("a tracker outside GitHub copies instead, under the same rules", () => {
    const monday = { kind: "monday", why: "This project's tracker is monday: Copy issue puts it on your clipboard" };
    expect(offReason({ ...base, target: monday })).toBeNull();
    expect(isPublicTarget(monday)).toBe(false);
    expect(offReason({ ...base, target: monday, texts: { ...texts, title: "" } })).toBe("Fill in: Title");
  });
});

describe("the target line", () => {
  test("each row of the table in PLAN.md section 7", () => {
    expect(targetLine({ ...target, visibility: "public", board: { owner: "acme", number: 41, column: "Backlog", title: "Shop" } })).toBe("→ acme/shop (public) · triage · board Shop › Backlog");
    expect(targetLine(target)).toBe("→ acme/shop (private) · triage · no board in the config");
    expect(targetLine({ kind: "github", repo: "acme/shop", visibility: "public", label: null, board: null, hasConfig: false })).toBe("→ acme/shop (public) · no config, so no label or board");
    expect(targetLine({ kind: "monday", why: "This project's tracker is monday: Copy issue puts it on your clipboard" })).toContain("Copy issue");
  });

  test("what it cannot do is said before anything is created", () => {
    expect(targetLine({ ...target, labelMissing: true })).toContain("no label: triage is not in the repo");
    expect(targetLine({ ...target, board: { number: 41, column: "Backlog", problem: "run gh auth refresh -s project" } })).toContain("board: run gh auth refresh -s project");
    expect(targetLine({ ...target, visibility: null })).toContain("(visibility unknown)");
    expect(targetLine(null)).toBe("Looking up where it goes…");
  });
});
