import { describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sameNoteKey } from "../mods/suggestion-box/notes.js";
import { git, makeRepo, note, NOTE, suggest, suggestLater, tempDir } from "./helpers.js";

const FOLDER = "github.com__acme__shop";
const notesIn = (box) => {
  const dir = join(box, "notes", FOLDER);
  return readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));
};
const setup = () => ({ repo: makeRepo(), box: join(tempDir(), "box") });

describe("drop", () => {
  test("a complete note is written with everything the command knows", () => {
    const { repo, box } = setup();
    const run = suggest(repo, box, [], NOTE);
    expect(run).toMatchObject({ code: 0, out: "Dropped in shop's suggestion box as note 1 (1 open). Carry on with your task." });
    const [written] = notesIn(box);
    expect(written).toMatchObject({
      number: 1,
      project: "github.com/acme/shop",
      title: "formatDate throws on a null date",
      at: { path: "src/invoices.ts", line: 42 },
      snippet: { start: 40, lines: ["line 40", "line 41", "line 42", "line 43", "line 44"] },
      from: { branch: "feat/8504-group-records", ticket: 8504, terminal: "t7", agent: "claude", worktree: repo, checkout: repo },
      status: "open",
      spotted: 1,
    });
    expect(written.sections.evidence).toBe("A fixture with `dueDate: null` made `exportPdf` throw a TypeError.");
    expect(written.from.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  test("backticks, quotes and $(…) pass a real shell's quoted heredoc unchanged", () => {
    const { repo, box } = setup();
    const script = `node ${JSON.stringify(join(import.meta.dir, "..", "bin", "suggest"))} <<'EOF'\n${note("Quoting", "").replace("a TypeError.", "a TypeError: `x` \"y\" 'z' $(echo RAN) $HOME.")}EOF\n`;
    const run = Bun.spawnSync(["sh", "-c", script], { cwd: repo, env: { ...process.env, SUGGESTION_BOX_HOME: box } });
    expect(run.exitCode).toBe(0);
    expect(notesIn(box)[0].sections.evidence).toContain("`x` \"y\" 'z' $(echo RAN) $HOME.");
  });

  test("the same fields work as flags", () => {
    const { repo, box } = setup();
    const run = suggest(repo, box, ["--title", "Flag note", "--problem", "p", "--evidence", "e", "--current=c", "--desired", "d"]);
    expect(run.code).toBe(0);
    expect(notesIn(box)[0]).toMatchObject({ title: "Flag note", at: null, sections: { current: "c" } });
  });

  test("missing sections and a bad title are refused, and nothing is written", () => {
    const { repo, box } = setup();
    expect(suggest(repo, box, [], "title: x\nproblem: p\n")).toMatchObject({
      code: 2,
      err: "suggest: missing evidence, current, desired; the issue needs all four sections",
    });
    expect(suggest(repo, box, [], note("x".repeat(101))).err).toBe(
      "suggest: keep the title to one line of at most 100 characters; put the rest in the sections",
    );
    expect(suggest(repo, box, [], NOTE.replace(/evidence: .*/, `evidence: ${"x".repeat(501)}`)).err).toBe(
      "suggest: evidence is over 500 characters; keep it to the essentials",
    );
    expect(suggest(repo, box, [], "").err).toContain("give the fields on stdin");
    expect(suggest(repo, box, ["--color", "red"]).err).toBe("suggest: unknown argument --color; suggest --help shows how");
  });

  test("outside a git repo it is refused", () => {
    const run = suggest(tempDir(), join(tempDir(), "box"), [], NOTE);
    expect(run).toMatchObject({ code: 2, err: "suggest: not in a git repo; the box is per project" });
  });

  test("a file that is not in the repo is kept as written, with a warning", () => {
    const { repo, box } = setup();
    const run = suggest(repo, box, [], NOTE.replace("src/invoices.ts:42", "src/invoce.ts:3"));
    expect(run.code).toBe(0);
    expect(run.err).toBe("warning: src/invoce.ts is not in the repo; kept as written");
    expect(notesIn(box)[0]).toMatchObject({ at: { path: "src/invoce.ts", line: 3 }, snippet: null });
  });

  test("a path is read from the repo root, also from a subfolder", () => {
    const { repo, box } = setup();
    expect(suggest(join(repo, "src"), box, [], NOTE).code).toBe(0);
    expect(notesIn(box)[0].at.path).toBe("src/invoices.ts");
  });

  test("a worktree and the main checkout land in the same box", () => {
    const { repo, box } = setup();
    const worktree = join(tempDir(), "wt");
    git(repo, "worktree", "add", "-q", "-b", "fix/other", worktree);
    suggest(repo, box, [], note("From the checkout"));
    suggest(worktree, box, [], note("From the worktree"));
    const notes = notesIn(box);
    expect(notes).toHaveLength(2);
    expect(notes.find((n) => n.title === "From the worktree").from).toMatchObject({ worktree, checkout: repo, branch: "fix/other", ticket: null });
  });

  test("the ticket comes from parallel-tickets' record of the branch first", () => {
    const repo = makeRepo({ branch: "fix/formatdate-null-date" });
    const box = join(tempDir(), "box");
    const registry = join(repo, ".git", "herdr-parallel-issues");
    mkdirSync(registry);
    writeFileSync(join(registry, "812.json"), JSON.stringify({ ticket: 812, branch: "fix/formatdate-null-date" }));
    suggest(repo, box, [], NOTE);
    expect(notesIn(box)[0].from.ticket).toBe(812);
  });
});

describe("the same note again", () => {
  test("only counts, by title (any case, spaces, final full stop) and file", () => {
    const { repo, box } = setup();
    suggest(repo, box, [], NOTE);
    const again = suggest(repo, box, [], NOTE.replace("formatDate throws on a null date", "FormatDate  throws on a null date.").replace(":42", ":44"));
    expect(again.out).toBe("Already in shop's box as note 1 (spotted 2×). Carry on with your task.");
    expect(notesIn(box)).toHaveLength(1);
    expect(suggest(repo, box, [], NOTE.replace("src/invoices.ts:42", "")).out).toContain("as note 2");
  });

  test("answers by the note's state: filed, binned, to verify, solved", () => {
    const { repo, box } = setup();
    suggest(repo, box, [], note("Filed one"));
    suggest(repo, box, [], note("Binned one"));
    suggest(repo, box, [], note("Claimed one"));
    suggest(repo, box, [], note("Solved one"));
    const dir = join(box, "notes", FOLDER);
    for (const written of notesIn(box)) {
      if (written.title === "Filed one") Object.assign(written, { status: "filed", issue: { number: 812 } });
      if (written.title === "Binned one") written.status = "binned";
      if (written.title === "Solved one") Object.assign(written, { status: "solved", solved: { branch: "feat/x", confirmed: { at: "t" } } });
      writeFileSync(join(dir, `${written.id}.json`), JSON.stringify(written));
    }
    suggest(repo, box, ["solved", "3"], "how: h\nproof: p\n");
    expect(suggest(repo, box, [], note("Filed one")).out).toBe("Already filed as #812 (note 1, spotted 2×). Carry on with your task.");
    expect(suggest(repo, box, [], note("Binned one")).out).toBe("Already binned by the user (note 2). Carry on with your task.");
    expect(suggest(repo, box, [], note("Claimed one")).out).toBe("Note 3 is claimed solved and waits for the user to verify. Carry on with your task.");
    expect(suggest(repo, box, [], note("Solved one")).out).toBe("Note 4 was solved on feat/x; reopened it, as you see it again. Carry on with your task.");
    expect(suggest(repo, box, ["list"]).out).toContain("Solved one");
  });
});

describe("left-overs", () => {
  test("a key left by a drop that died halfway does not block the title", () => {
    const { repo, box } = setup();
    const keys = join(box, "notes", FOLDER, "keys");
    mkdirSync(keys, { recursive: true });
    writeFileSync(join(keys, sameNoteKey("formatDate throws on a null date", "src/invoices.ts")), "20261126-000000-gone");
    const run = suggest(repo, box, [], NOTE);
    expect(run).toMatchObject({ code: 0, out: "Dropped in shop's suggestion box as note 1 (1 open). Carry on with your task." });
    expect(suggest(repo, box, [], NOTE).out).toContain("spotted 2×");
  });

  test("a solved note that is only a tombstone comes back as a new note", () => {
    const { repo, box } = setup();
    suggest(repo, box, [], NOTE);
    const dir = join(box, "notes", FOLDER);
    const [written] = notesIn(box);
    mkdirSync(join(dir, "tombstones"));
    writeFileSync(join(dir, "tombstones", `${written.id}.json`), JSON.stringify({ ...written, status: "solved", solved: { branch: "feat/x", confirmed: { at: "t" } } }));
    renameSync(join(dir, `${written.id}.json`), join(tempDir(), "gone.json"));
    const run = suggest(repo, box, [], NOTE);
    expect(run.out).toBe("Note 1 was solved on feat/x and has left the box; it is back, so it is note 2 now (1 open). Carry on with your task.");
    expect(notesIn(box)[0]).toMatchObject({ number: 2, reopened: { after: "feat/x", number: 1 } });
  });

  test("a binned note that is only a tombstone still only counts", () => {
    const { repo, box } = setup();
    suggest(repo, box, [], NOTE);
    const dir = join(box, "notes", FOLDER);
    const [written] = notesIn(box);
    mkdirSync(join(dir, "tombstones"));
    writeFileSync(join(dir, "tombstones", `${written.id}.json`), JSON.stringify({ ...written, status: "binned" }));
    renameSync(join(dir, `${written.id}.json`), join(tempDir(), "gone.json"));
    expect(suggest(repo, box, [], NOTE).out).toBe("Already binned by the user (note 1). Carry on with your task.");
  });

  test("an error says which command it came from", () => {
    const { repo, box } = setup();
    mkdirSync(box, { recursive: true });
    writeFileSync(join(box, "settings.json"), "{ broken");
    expect(suggest(repo, box, ["list"])).toMatchObject({ code: 1 });
    expect(suggest(repo, box, ["list"]).err).toStartWith("suggest list: could not read");
  });

  test("a note at file:line:column is the same note as at file:line", () => {
    const { repo, box } = setup();
    suggest(repo, box, [], NOTE);
    expect(suggest(repo, box, [], NOTE.replace("src/invoices.ts:42", "src/invoices.ts:42:7")).out).toContain("spotted 2×");
  });
});

describe("many agents at once", () => {
  test("twenty drops get twenty notes with twenty different numbers", async () => {
    const { repo, box } = setup();
    const runs = await Promise.all(Array.from({ length: 20 }, (_, i) => suggestLater(repo, box, [], note(`Note ${i}`))));
    expect(runs.every((run) => run.code === 0)).toBe(true);
    const numbers = notesIn(box).map((n) => n.number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  test("ten drops of the same note give one note, spotted ten times", async () => {
    const { repo, box } = setup();
    const runs = await Promise.all(Array.from({ length: 10 }, () => suggestLater(repo, box, [], NOTE)));
    expect(runs.every((run) => run.code === 0)).toBe(true);
    expect(notesIn(box)).toHaveLength(1);
    expect(suggest(repo, box, [], NOTE).out).toBe("Already in shop's box as note 1 (spotted 11×). Carry on with your task.");
  });

  test("the command only creates files: a note's own file never changes after its drop", () => {
    const { repo, box } = setup();
    suggest(repo, box, [], NOTE);
    const file = join(box, "notes", FOLDER, `${notesIn(box)[0].id}.json`);
    const before = readFileSync(file, "utf8");
    suggest(repo, box, [], NOTE);
    suggest(repo, box, ["solved", "1"], "how: h\nproof: p\n");
    expect(readFileSync(file, "utf8")).toBe(before);
  });
});

describe("list and solved", () => {
  test("a claim records whether its commit is the branch's own work: not before a commit, yes after one", () => {
    const claimOf = (box) => {
      const dir = join(box, "notes", FOLDER, "events");
      const files = readdirSync(dir, { recursive: true }).filter((name) => String(name).endsWith(".json"));
      return files.map((name) => JSON.parse(readFileSync(join(dir, String(name)), "utf8"))).find((event) => event.type === "claim");
    };
    const before = setup();
    suggest(before.repo, before.box, [], NOTE);
    suggest(before.repo, before.box, ["solved", "1"], "how: h\nproof: p\n");
    expect(claimOf(before.box).own).toBe(false);
    const after = setup();
    suggest(after.repo, after.box, [], NOTE);
    writeFileSync(join(after.repo, "src", "fix.ts"), "fixed\n");
    git(after.repo, "add", "src/fix.ts");
    git(after.repo, "commit", "-qm", "fix: a dash");
    suggest(after.repo, after.box, ["solved", "1"], "how: h\nproof: p\n");
    expect(claimOf(after.box).own).toBe(true);
  });

  test("list shows open, to verify and filed notes, newest first, with their numbers", () => {
    const { repo, box } = setup();
    expect(suggest(repo, box, ["list"]).out).toBe("shop's box has no open, to verify or filed notes.");
    suggest(repo, box, [], NOTE);
    suggest(repo, box, [], note("Second", "").replace("src/invoices.ts:42", "src/invoices.ts"));
    suggest(repo, box, ["solved", "1"], "how: h\nproof: p\n");
    const lines = suggest(repo, box, ["list"]).out.split("\n");
    expect(lines[0]).toBe("2  now  invoices.ts  Second  (#8504)");
    expect(lines[1]).toBe("1  now  invoices.ts:42  formatDate throws on a null date  (#8504)  [to verify]");
  });

  test("solved needs how and proof, and refuses unknown or already claimed notes", () => {
    const { repo, box } = setup();
    suggest(repo, box, [], NOTE);
    expect(suggest(repo, box, ["solved", "1"], "how: h\n").err).toBe("suggest: say what fixed it (how) and the test or check that shows it (proof)");
    expect(suggest(repo, box, ["solved", "9"], "how: h\nproof: p\n").err).toBe("suggest: shop's box has no open or filed note 9; suggest list shows them");
    const claimed = suggest(repo, box, ["solved", "1", "--how", "guard added", "--proof", "invoices.test.ts"]);
    expect(claimed.out).toMatch(/^Note 1 claimed solved on feat\/8504-group-records \([0-9a-f]{7}\); it waits in the box for the user to verify\.$/);
    expect(suggest(repo, box, ["solved", "1"], "how: h\nproof: p\n")).toMatchObject({ code: 2, err: "suggest: note 1 is already claimed; nothing changes" });
  });
});

describe("collecting off", () => {
  const off = (box, settings) => {
    mkdirSync(box, { recursive: true });
    writeFileSync(join(box, "settings.json"), JSON.stringify(settings));
  };

  test("a drop answers calmly, exits 0 and writes nothing, for all or for this project", () => {
    for (const settings of [{ collecting: false }, { collecting: true, off: ["github.com/acme/shop"] }]) {
      const { repo, box } = setup();
      off(box, settings);
      expect(suggest(repo, box, [], NOTE)).toMatchObject({
        code: 0,
        out: "The suggestion box is off for shop. Do not drop notes for the rest of this task; name findings in your final report instead.",
      });
      expect(readdirSync(box)).toEqual(["settings.json"]);
    }
  });

  test("list and solved still work", () => {
    const { repo, box } = setup();
    suggest(repo, box, [], NOTE);
    off(box, { collecting: false });
    expect(suggest(repo, box, ["list"]).out).toContain("formatDate throws");
    expect(suggest(repo, box, ["solved", "1"], "how: h\nproof: p\n").code).toBe(0);
  });

  test("another project stays on", () => {
    const { repo, box } = setup();
    off(box, { collecting: true, off: ["github.com/acme/other"] });
    expect(suggest(repo, box, [], NOTE).out).toContain("Dropped");
  });
});

describe("session-start", () => {
  const hook = (cwd, box, input) => suggest(tempDir(), box, ["session-start"], JSON.stringify({ cwd, source: "startup" }), input);

  test("gives the instructions in a git repo while collecting is on", () => {
    const { repo, box } = setup();
    const run = hook(repo, box);
    expect(run.code).toBe(0);
    const output = JSON.parse(run.out);
    expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(output.hookSpecificOutput.additionalContext).toContain("## Suggestion box");
    expect(output.hookSpecificOutput.additionalContext).toContain("suggest solved <number>");
  });

  test("gives nothing outside a git repo, or with collecting off", () => {
    const { repo, box } = setup();
    expect(hook(tempDir(), box)).toEqual({ code: 0, out: "", err: "" });
    mkdirSync(box, { recursive: true });
    writeFileSync(join(box, "settings.json"), JSON.stringify({ off: ["github.com/acme/shop"] }));
    expect(hook(repo, box)).toEqual({ code: 0, out: "", err: "" });
  });

  test("never fails a session's start: a broken settings file goes to stderr, exit 0", () => {
    const { repo, box } = setup();
    mkdirSync(box, { recursive: true });
    writeFileSync(join(box, "settings.json"), "{ not json");
    const run = hook(repo, box);
    expect(run.code).toBe(0);
    expect(run.out).toBe("");
    expect(run.err).toContain("could not read");
  });
});

test("--help and --version", () => {
  const { repo, box } = setup();
  expect(suggest(repo, box, ["--version"]).out).toBe(JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")).version);
  expect(suggest(repo, box, ["--help"]).out).toContain("suggest solved <number>");
});
