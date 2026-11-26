// The box's own side (cli/box.js) and its git changes (cli/changes.js), in throwaway repos and boxes.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../cli/box.js";
import { changeFor } from "../cli/changes.js";
import { git, makeRepo, note, NOTE, ROOT, suggest, tempDir } from "./helpers.js";

const FOLDER = "github.com__acme__shop";
const setup = () => {
  const repo = makeRepo();
  const box = join(tempDir(), "box");
  return { repo, box, env: { SUGGESTION_BOX_HOME: box } };
};
const idOf = (box, number) => {
  const dir = join(box, "notes", FOLDER);
  const name = readdirSync(dir).find((n) => n.endsWith(".json") && JSON.parse(readFileSync(join(dir, n), "utf8")).number === number);
  return name.slice(0, -5);
};
const commitLine = (repo, line, text) => {
  const file = join(repo, "src", "invoices.ts");
  const lines = readFileSync(file, "utf8").split("\n");
  lines[line - 1] = text;
  writeFileSync(file, lines.join("\n"));
  git(repo, "commit", "-qam", `edit line ${line}`);
};

describe("read", () => {
  test("outside a git repo there is no project", async () => {
    expect(await run(["read", tempDir()], { SUGGESTION_BOX_HOME: tempDir() })).toEqual({ project: null, why: "no git repo here" });
  });

  test("the project, the switches, its live notes newest first, and the counts", async () => {
    const { repo, box, env } = setup();
    suggest(repo, box, [], note("First"));
    suggest(repo, box, [], note("Second"));
    suggest(repo, box, ["solved", "1"], "how: h\nproof: p\n");
    const answer = await run(["read", repo], env);
    expect(answer.project).toMatchObject({ key: "github.com/acme/shop", name: "shop", top: repo, checkout: repo });
    expect(answer.collecting).toEqual({ all: true, project: true });
    expect(answer.notes.map((n) => [n.number, n.state])).toEqual([[2, "open"], [1, "to verify"]]);
    expect(answer.notes[0].actions).toEqual(["check", "file", "bin"]);
    expect(answer.notes[1].actions).toEqual(["confirm", "not-solved"]);
    expect(answer.counts).toEqual({ open: 1, toVerify: 1 });
  });

  test("the history holds binned and solved notes of the last 30 days", async () => {
    const { repo, box, env } = setup();
    suggest(repo, box, [], note("Binned"));
    await run(["act", repo, idOf(box, 1), "bin"], env);
    const answer = await run(["read", repo], env);
    expect(answer.notes).toEqual([]);
    expect(answer.history.map((n) => [n.number, n.state, n.actions])).toEqual([[1, "binned", ["restore"]]]);
  });
});

test("reading a repo that never had a note leaves no folder for it", async () => {
  const { repo, box, env } = setup();
  const answer = await run(["read", repo], env);
  expect(answer.project.exists).toBe(false);
  expect(answer.notes).toEqual([]);
  expect(existsSync(join(box, "notes", FOLDER))).toBe(false);
  expect(existsSync(join(box, "notes"))).toBe(true);
});

describe("act", () => {
  test("bin, restore, mark solved, not solved, confirm and reopen, each by the states table", async () => {
    const { repo, box, env } = setup();
    suggest(repo, box, [], NOTE);
    const id = idOf(box, 1);
    expect(await run(["act", repo, id, "bin"], env)).toEqual({ ok: true, state: "binned" });
    expect(await run(["act", repo, id, "restore"], env)).toEqual({ ok: true, state: "open" });
    expect(await run(["act", repo, id, "mark-solved", "--branch", "feat/y"], env)).toEqual({ ok: true, state: "to verify" });
    expect(await run(["act", repo, id, "not-solved", "--reason", "still throws"], env)).toEqual({ ok: true, state: "open" });
    expect((await run(["act", repo, id, "mark-solved"], env)).state).toBe("to verify");
    expect(await run(["act", repo, id, "confirm"], env)).toEqual({ ok: true, state: "solved" });
    expect(await run(["act", repo, id, "reopen"], env)).toEqual({ ok: true, state: "open" });
  });

  test("an action the state does not allow is refused, and the note stays as it was", async () => {
    const { repo, box, env } = setup();
    suggest(repo, box, [], NOTE);
    suggest(repo, box, ["solved", "1"], "how: h\nproof: p\n");
    const id = idOf(box, 1);
    const file = join(box, "notes", FOLDER, `${id}.json`);
    const before = readFileSync(file, "utf8");
    expect((await run(["act", repo, id, "bin"], env)).error).toBe("note 1 is to verify; bin is not one of its actions");
    expect((await run(["act", repo, id, "file"], env)).error).toBe("file is not something the box does here");
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  test("an act folds the events in and removes exactly those event files", async () => {
    const { repo, box, env } = setup();
    suggest(repo, box, [], NOTE);
    suggest(repo, box, [], NOTE);
    suggest(repo, box, [], NOTE);
    const id = idOf(box, 1);
    await run(["act", repo, id, "bin"], env);
    const written = JSON.parse(readFileSync(join(box, "notes", FOLDER, `${id}.json`), "utf8"));
    expect(written).toMatchObject({ spotted: 3, status: "binned" });
    expect(readdirSync(join(box, "notes", FOLDER, "events", id))).toEqual([]);
    expect(suggest(repo, box, [], NOTE).out).toBe("Already binned by the user (note 1). Carry on with your task.");
  });

  test("a claim that races the user's click: the store refuses a bin on a note just claimed", async () => {
    const { repo, box, env } = setup();
    suggest(repo, box, [], NOTE);
    const id = idOf(box, 1);
    suggest(repo, box, ["solved", "1"], "how: h\nproof: p\n");
    expect((await run(["act", repo, id, "bin"], env)).error).toContain("to verify");
  });
});

describe("collecting", () => {
  test("off and on for this project, and for all", async () => {
    const { repo, box, env } = setup();
    expect((await run(["collecting", repo, "off"], env)).collecting).toEqual({ all: true, project: false });
    expect(suggest(repo, box, [], NOTE).out).toContain("off for shop");
    expect((await run(["collecting", repo, "on"], env)).collecting).toEqual({ all: true, project: true });
    expect((await run(["collecting", repo, "off", "--all"], env)).collecting).toEqual({ all: false, project: false });
    expect((await run(["collecting", repo, "on", "--all"], env)).collecting).toEqual({ all: true, project: true });
    expect(JSON.parse(readFileSync(join(box, "settings.json"), "utf8"))).toEqual({ collecting: true, off: [] });
  });
});

describe("prune", () => {
  test("old filed, solved and binned notes become tombstones; open ones stay", async () => {
    const { repo, box, env } = setup();
    suggest(repo, box, [], note("Old binned"));
    suggest(repo, box, [], note("Old open"));
    await run(["act", repo, idOf(box, 1), "bin"], env);
    const later = new Date(Date.now() + 31 * 86400000);
    expect(await run(["prune", repo], env, later)).toEqual({ ok: true, pruned: 1 });
    const dir = join(box, "notes", FOLDER);
    expect(readdirSync(join(dir, "tombstones"))).toHaveLength(1);
    expect((await run(["read", repo], env)).notes.map((n) => n.title)).toEqual(["Old open"]);
    expect(suggest(repo, box, [], note("Old binned")).out).toBe("Already binned by the user (note 1). Carry on with your task.");
  });
});

test("prune keeps a filed note that waits in To verify, and a note with events not folded in yet", async () => {
  const { repo, box, env } = setup();
  suggest(repo, box, [], note("Filed, then claimed"));
  suggest(repo, box, [], note("Binned, seen again"));
  const dir = join(box, "notes", FOLDER);
  const filedId = idOf(box, 1);
  const filed = JSON.parse(readFileSync(join(dir, `${filedId}.json`), "utf8"));
  writeFileSync(join(dir, `${filedId}.json`), JSON.stringify({ ...filed, status: "filed", issue: { number: 812 } }));
  suggest(repo, box, ["solved", "1"], "how: h\nproof: p\n");
  await run(["act", repo, idOf(box, 2), "bin"], env);
  suggest(repo, box, [], note("Binned, seen again"));
  const later = new Date(Date.now() + 40 * 86400000);
  expect(await run(["prune", repo], env, later)).toEqual({ ok: true, pruned: 0 });
  expect((await run(["read", repo], env)).notes.map((n) => n.state)).toEqual(["to verify"]);
});

test("box.js answers one line of JSON when run as a program", async () => {
  const { repo, box } = setup();
  suggest(repo, box, [], NOTE);
  const result = spawnSync("node", [join(ROOT, "cli", "box.js"), "read", repo], { encoding: "utf8", env: { ...process.env, SUGGESTION_BOX_HOME: box } });
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).notes).toHaveLength(1);
  const bad = spawnSync("node", [join(ROOT, "cli", "box.js"), "act", repo, "nope", "bin"], { encoding: "utf8", env: { ...process.env, SUGGESTION_BOX_HOME: box } });
  expect(bad.status).toBe(1);
  expect(JSON.parse(bad.stdout)).toEqual({ error: "there is no note nope" });
});

describe("changes since the drop", () => {
  const dropped = (repo, box) => {
    suggest(repo, box, [], NOTE);
    return JSON.parse(readFileSync(join(box, "notes", FOLDER, `${idOf(box, 1)}.json`), "utf8"));
  };

  test("nothing changed: no chip", async () => {
    const { repo, box } = setup();
    expect(changeFor(repo, dropped(repo, box))).toBeNull();
  });

  test("a change to the note's lines on its own branch", async () => {
    const { repo, box } = setup();
    const n = dropped(repo, box);
    commitLine(repo, 42, "fixed line 42");
    expect(changeFor(repo, n)).toEqual({ on: "feat/8504-group-records", kind: "changed" });
  });

  test("a change elsewhere in the file, or lines moved down by an insertion above, is no change", async () => {
    const { repo, box } = setup();
    const n = dropped(repo, box);
    commitLine(repo, 5, "line 5\nnew line\nanother new line");
    commitLine(repo, 58, "changed far below");
    expect(changeFor(repo, n)).toBeNull();
  });

  test("a change on the default branch", async () => {
    const { repo, box } = setup();
    const n = dropped(repo, box);
    git(repo, "switch", "-q", "main");
    git(repo, "merge", "-q", "--no-edit", "feat/8504-group-records");
    commitLine(repo, 41, "fixed on main");
    git(repo, "switch", "-q", "feat/8504-group-records");
    expect(changeFor(repo, n, "main")).toEqual({ on: "main", kind: "changed" });
  });

  test("a removed file, and a renamed file whose lines stayed", async () => {
    const { repo, box } = setup();
    const n = dropped(repo, box);
    git(repo, "mv", "src/invoices.ts", "src/billing.ts");
    git(repo, "commit", "-qm", "rename");
    expect(changeFor(repo, n)).toBeNull();
    git(repo, "rm", "-q", "src/billing.ts");
    git(repo, "commit", "-qm", "remove");
    expect(changeFor(repo, n)).toEqual({ on: "feat/8504-group-records", kind: "removed" });
  });

  test("after a rebase the snippet decides", async () => {
    const { repo, box } = setup();
    const n = dropped(repo, box);
    git(repo, "switch", "-q", "main");
    commitLine(repo, 1, "main moved on");
    git(repo, "switch", "-q", "feat/8504-group-records");
    commitLine(repo, 30, "branch work");
    git(repo, "rebase", "-q", "main");
    n.from.sha = "0".repeat(40);
    expect(changeFor(repo, n, "main")).toBeNull();
    commitLine(repo, 42, "fixed after the rebase");
    expect(changeFor(repo, n, "main")).toEqual({ on: "feat/8504-group-records", kind: "changed" });
  });

  test("a note dropped on the default branch is checked against the fetched one", async () => {
    const repo = makeRepo({ branch: null });
    const box = join(tempDir(), "box");
    suggest(repo, box, [], NOTE);
    const n = JSON.parse(readFileSync(join(box, "notes", FOLDER, `${idOf(box, 1)}.json`), "utf8"));
    expect(n.from.branch).toBe("main");
    git(repo, "switch", "-q", "-c", "upstream");
    commitLine(repo, 42, "fixed upstream");
    git(repo, "update-ref", "refs/remotes/origin/main", "upstream");
    git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    git(repo, "switch", "-q", "main");
    expect(changeFor(repo, n)).toEqual({ on: "main", kind: "changed" });
  });

  test("read --changes puts the chip on open notes and shows Mark solved", async () => {
    const { repo, box, env } = setup();
    dropped(repo, box);
    commitLine(repo, 43, "fixed");
    const [shown] = (await run(["read", repo, "--changes"], env)).notes;
    expect(shown.changed).toEqual({ on: "feat/8504-group-records", kind: "changed" });
    expect(shown.actions).toEqual(["mark-solved", "check", "file", "bin"]);
  });
});

describe("the settings view's projects", () => {
  test("the open spaces' projects and every project with notes, the focused one first, each with its own switch", async () => {
    const { repo, box, env } = setup();
    suggest(repo, box, [], NOTE);
    const other = makeRepo({ origin: "git@github.com:acme/billing.git" });
    const plain = tempDir("plain-");
    const answer = await run(["projects", other, repo, other, plain], env);
    expect(answer.all).toBe(true);
    expect(answer.projects.map((p) => [p.name, p.isHere, p.isOn, p.hasSpace])).toEqual([["billing", true, true, true], ["shop", false, true, true]]);
    expect(answer.projects[1].counts).toEqual({ open: 1, toVerify: 0, filed: 0 });
  });

  test("a project with notes but no open space, and one switched off, are listed too", async () => {
    const { repo, box, env } = setup();
    suggest(repo, box, [], NOTE);
    await run(["collecting", repo, "off", "--key", "github.com/acme/gone"], env);
    const answer = await run(["projects", repo], env);
    expect(answer.projects.map((p) => [p.key, p.isOn, p.hasSpace])).toEqual([["github.com/acme/shop", true, false], ["github.com/acme/gone", false, false]]);
  });

  test("a switch by project, and collecting everywhere, which overrules it but keeps it", async () => {
    const { repo, env } = setup();
    expect((await run(["collecting", repo, "off", "--key", "github.com/acme/shop"], env)).collecting).toEqual({ all: true, project: false });
    expect((await run(["collecting", repo, "off", "--all"], env)).collecting).toEqual({ all: false, project: false });
    expect((await run(["projects", repo], env)).projects[0]).toMatchObject({ key: "github.com/acme/shop", isOn: false });
    await run(["collecting", repo, "on", "--all"], env);
    await run(["collecting", repo, "on", "--key", "github.com/acme/shop"], env);
    expect((await run(["read", repo], env)).collecting).toEqual({ all: true, project: true });
    expect((await run(["collecting", repo, "off", "--key", "not a key"], env)).error).toContain("--key needs a project");
  });
});
