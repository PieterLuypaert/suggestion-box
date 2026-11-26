// Filing through box.js: where the issue goes, the issue text, the board, and the rules Create
// issue follows, with a stand-in gh that logs every call. The repo's origin/main is a local ref,
// so nothing reaches GitHub.
import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../cli/box.js";
import { searchWords } from "../cli/file.js";
import { BIN, git, makeRepo, NOTE, suggest, tempDir } from "./helpers.js";

const CONFIG = `tracker:
  kind: github
  repo: acme/shop
  project: { owner: acme, number: 41 }
  status: { field: Status, todo: Backlog }
labels:
  needs-triage: triage
`;
const CHECKED = { sections: { problem: { verdict: "checked" }, evidence: { verdict: "checked" }, current: { verdict: "checked" }, desired: { verdict: "checked" } }, gone: null };

// A ticket branch with a dropped, checked note; main (and origin/main) holds the config when given.
function setup({ config = null, check = CHECKED, gh = {} } = {}) {
  const repo = makeRepo();
  if (config) {
    git(repo, "switch", "-q", "main");
    mkdirSync(join(repo, ".ai-tooling"), { recursive: true });
    writeFileSync(join(repo, ".ai-tooling", "config.yml"), config);
    git(repo, "add", ".ai-tooling/config.yml");
    git(repo, "commit", "-qm", "config");
    git(repo, "switch", "-q", "feat/8504-group-records");
  }
  git(repo, "update-ref", "refs/remotes/origin/main", "main");
  git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  const box = join(tempDir(), "box");
  suggest(repo, box, [], NOTE);
  const file = noteFile(box);
  const note = JSON.parse(readFileSync(file, "utf8"));
  if (check) writeFileSync(file, `${JSON.stringify({ ...note, check }, null, 2)}\n`);
  const dir = tempDir("gh-");
  const stand = join(dir, "gh");
  writeFileSync(stand, `#!/bin/sh
printf '%s\\n' "---" "$@" >> "${dir}/log"
case "$1 $2" in
  "repo view") echo '{"visibility":"${gh.visibility ?? "PUBLIC"}","nameWithOwner":"${gh.name ?? "acme/shop"}"}' ;;
  "label list") echo '${JSON.stringify(gh.labels ?? [{ name: "triage" }])}' ;;
  "issue list") ${gh.searchFails ? "echo 'HTTP 502' >&2; exit 1" : `echo '[{"number":12,"title":"PDF export crashes","url":"https://github.com/acme/shop/issues/12"}]'`} ;;
  "issue create") cat > "${dir}/body"; ${gh.during ?? ":"}; ${gh.createFails ? "echo 'GraphQL: Could not resolve to a Repository' >&2; exit 1" : "echo 'Creating issue in acme/shop'; echo 'https://github.com/acme/shop/issues/812'"} ;;
  "api "*) exit ${gh.hasCommit ? 0 : 1} ;;
  "project view") ${gh.noScope ? "echo \"error: your authentication token is missing required scopes [read:project]\" >&2; exit 1" : `echo '{"id":"PVT_41","title":"Shop"}'`} ;;
  "project item-add") if [ -f "${dir}/no-scope" ]; then echo "error: your authentication token is missing required scopes [project]" >&2; exit 1; fi; echo '{"id":"PVTI_7"}' ;;
  "project field-list") echo '{"fields":[{"id":"F_S","name":"Status","options":[{"id":"O_T","name":"Todo"},{"id":"O_B","name":"Backlog"}]}]}' ;;
  "project item-edit") : ;;
  *) echo "unexpected gh $*" >&2; exit 2 ;;
esac
`);
  chmodSync(stand, 0o755);
  if (gh.boardFails) writeFileSync(join(dir, "no-scope"), "");
  // The stand-in runs from the test's own folder: what it does meanwhile finds the repo and the
  // note through these.
  return { repo, box, file, id: note.id, dir, env: { SUGGESTION_BOX_HOME: box, SUGGESTION_BOX_GH: stand, SBOX_REPO: repo, SBOX_NOTE: file } };
}

function noteFile(box) {
  const notes = join(box, "notes");
  const dir = join(notes, readdirSync(notes)[0]);
  return join(dir, readdirSync(dir).find((n) => n.endsWith(".json")));
}

const calls = (s) => (existsSync(join(s.dir, "log")) ? readFileSync(join(s.dir, "log"), "utf8").split("---\n").slice(1).map((c) => c.trim().split("\n")) : []);
const noteOf = (s) => JSON.parse(readFileSync(s.file, "utf8"));
const texts = { title: "formatDate throws on a null date", sections: { problem: "Invoices without a due date crash the PDF export.", evidence: "A fixture made exportPdf throw.", current: "formatDate(null) throws.", desired: "formatDate(null) returns a dash." } };
const filing = (over = {}) => JSON.stringify({ ...texts, fine: [], notGone: null, repo: "acme/shop", ...over });

describe("box.js target", () => {
  test("no config: the origin repo, no label, no board; similar issues; the code on main", async () => {
    const s = setup();
    const answer = await run(["target", s.repo, s.id], s.env);
    expect(answer.target).toMatchObject({ kind: "github", repo: "acme/shop", label: null, board: null, visibility: "public", hasConfig: false });
    expect(answer.similar).toEqual([{ number: 12, title: "PDF export crashes", url: "https://github.com/acme/shop/issues/12" }]);
    const main = git(s.repo, "rev-parse", "main");
    expect(answer.link).toEqual({ url: `https://github.com/acme/shop/blob/${main}/src/invoices.ts#L40-L44`, embed: true });
  });

  test("the config: its repo, label and board, with the board's title", async () => {
    const s = setup({ config: CONFIG });
    const { target } = await run(["target", s.repo, s.id], s.env);
    expect(target).toMatchObject({ repo: "acme/shop", label: "triage", labelMissing: false, board: { owner: "acme", number: 41, field: "Status", column: "Backlog", title: "Shop" }, hasConfig: true });
  });

  test("a label the repo lacks, a board out of reach, a failed search: said before anything is created", async () => {
    const s = setup({ config: CONFIG, gh: { labels: [{ name: "triaged" }], noScope: true, searchFails: true } });
    const answer = await run(["target", s.repo, s.id], s.env);
    expect(answer.target.labelMissing).toBe(true);
    expect(answer.target.board.problem).toBe("run gh auth refresh -s project");
    expect(answer.similar).toBeNull();
  });

  test("GitHub's own spelling of the repo, which a code link needs to show as code", async () => {
    const s = setup({ gh: { name: "Acme/Shop" } });
    const answer = await run(["target", s.repo, s.id], s.env);
    expect(answer.target.repo).toBe("Acme/Shop");
    expect(answer.link.url).toStartWith("https://github.com/Acme/Shop/blob/");
  });

  test("a board without the config's column says so before anything is created", async () => {
    const s = setup({ config: CONFIG.replace("todo: Backlog", "todo: Doing") });
    expect((await run(["target", s.repo, s.id], s.env)).target.board.problem).toBe("the board has no Status column called Doing");
  });

  test("a tracker on monday copies instead", async () => {
    const s = setup({ config: "tracker:\n  kind: monday\n" });
    const answer = await run(["target", s.repo, s.id], s.env);
    expect(answer.target.why).toContain("Copy issue");
    expect(answer.similar).toEqual([]);
    expect(answer.link.url).toContain("github.com/acme/shop/blob/");
  });

  test("the snippet gone from main: the note's commit when GitHub has it, else the file", async () => {
    const s = setup({ gh: { hasCommit: true } });
    git(s.repo, "switch", "-q", "main");
    writeFileSync(join(s.repo, "src", "invoices.ts"), "rewritten\n");
    git(s.repo, "commit", "-qam", "rewrite");
    git(s.repo, "update-ref", "refs/remotes/origin/main", "main");
    const sha = noteOf(s).from.sha;
    expect((await run(["target", s.repo, s.id], s.env)).link).toEqual({ url: `https://github.com/acme/shop/blob/${sha}/src/invoices.ts#L40-L44`, embed: true });
    const t = setup();
    git(t.repo, "switch", "-q", "main");
    writeFileSync(join(t.repo, "src", "invoices.ts"), "rewritten\n");
    git(t.repo, "commit", "-qam", "rewrite");
    git(t.repo, "update-ref", "refs/remotes/origin/main", "main");
    expect((await run(["target", t.repo, t.id], t.env)).link).toEqual({ url: "https://github.com/acme/shop/blob/main/src/invoices.ts", embed: false });
  });
});

describe("box.js file", () => {
  test("creates the issue in the config's repo with its label, puts it on the board, and the note records it", async () => {
    const s = setup({ config: CONFIG });
    const answer = await run(["file", s.repo, s.id, filing()], s.env);
    expect(answer).toMatchObject({ ok: true, issue: { number: 812, url: "https://github.com/acme/shop/issues/812" }, board: { ok: true } });
    const create = calls(s).find((c) => c[0] === "issue" && c[1] === "create");
    expect(create).toEqual(["issue", "create", "--repo", "acme/shop", "--title", texts.title, "--body-file", "-", "--label", "triage"]);
    const body = readFileSync(join(s.dir, "body"), "utf8");
    expect(body).toStartWith("## Problem\n\nInvoices without a due date crash the PDF export.\n\n## Evidence\n\nA fixture made exportPdf throw.\n\nhttps://github.com/acme/shop/blob/");
    expect(body).toContain("#L40-L44\n\n## Current situation");
    expect(calls(s).find((c) => c[1] === "item-edit")).toEqual(["project", "item-edit", "--id", "PVTI_7", "--project-id", "PVT_41", "--field-id", "F_S", "--single-select-option-id", "O_B"]);
    const note = noteOf(s);
    expect(note).toMatchObject({ status: "filed", issue: { number: 812, repo: "acme/shop", closes: "Closes #812" }, filed: { title: texts.title }, board: { ok: true }, draft: null });
    const read = await run(["read", s.repo], s.env);
    expect(read.notes).toEqual([]);
    expect(read.history.map((n) => n.state)).toEqual(["filed"]);
  });

  test("the board step failing keeps the issue; Add to board tries again", async () => {
    const s = setup({ config: CONFIG, gh: { boardFails: true } });
    const answer = await run(["file", s.repo, s.id, filing()], s.env);
    expect(answer.board).toEqual({ error: "run gh auth refresh -s project" });
    expect(noteOf(s)).toMatchObject({ status: "filed", board: { error: "run gh auth refresh -s project" } });
    expect((await run(["board", s.repo, s.id], s.env)).error).toBe("run gh auth refresh -s project");
    rmSync(join(s.dir, "no-scope"));
    expect(await run(["board", s.repo, s.id], s.env)).toEqual({ ok: true });
    expect(noteOf(s).board).toEqual({ ok: true });
  });

  test("a board without the column gets no card: the issue stays, and the note says why", async () => {
    const s = setup({ config: CONFIG.replace("todo: Backlog", "todo: Doing") });
    const answer = await run(["file", s.repo, s.id, filing()], s.env);
    expect(answer).toMatchObject({ ok: true, board: { error: "the board has no Status column called Doing" } });
    expect(calls(s).some((c) => c[1] === "item-add")).toBe(false);
  });

  test("GitHub's spelling: the issue goes there, and the closing words stay short", async () => {
    const s = setup({ gh: { name: "Acme/Shop" } });
    expect((await run(["file", s.repo, s.id, filing({ repo: "acme/shop" })], s.env)).ok).toBe(true);
    expect(calls(s).find((c) => c[1] === "create").slice(2, 4)).toEqual(["--repo", "Acme/Shop"]);
    expect(readFileSync(join(s.dir, "body"), "utf8")).toContain("https://github.com/Acme/Shop/blob/");
    expect(noteOf(s).issue.closes).toBe("Closes #812");
  });

  test("gh failing to create: its message, and the note stays open with its draft", async () => {
    const s = setup({ gh: { createFails: true } });
    await run(["draft", s.repo, s.id, filing()], s.env);
    const answer = await run(["file", s.repo, s.id, filing()], s.env);
    expect(answer.error).toBe("gh could not create the issue: GraphQL: Could not resolve to a Repository");
    expect(noteOf(s)).toMatchObject({ status: "open", draft: { title: texts.title } });
  });

  test("no config: the origin repo, no label, no board, and the closing words", async () => {
    const s = setup();
    await run(["file", s.repo, s.id, filing()], s.env);
    expect(calls(s).find((c) => c[1] === "create")).not.toContain("--label");
    expect(calls(s).some((c) => c[0] === "project")).toBe(false);
    expect(noteOf(s)).toMatchObject({ board: null, issue: { closes: "Closes #812" } });
  });

  test("a label the repo lacks is left off rather than failing the issue", async () => {
    const s = setup({ config: CONFIG, gh: { labels: [] } });
    await run(["file", s.repo, s.id, filing()], s.env);
    expect(calls(s).find((c) => c[1] === "create")).not.toContain("--label");
  });

  test("an agent's claim that comes in while gh creates the issue stays: the note goes to To verify, filed", async () => {
    const claim = `cd "$SBOX_REPO" && printf 'how: fixed it\\nproof: a test\\n' | HC_TERMINAL_ID=t7 CLAUDECODE=1 node ${BIN} solved 1 >/dev/null`;
    const s = setup({ gh: { during: claim } });
    const answer = await run(["file", s.repo, s.id, filing()], s.env);
    expect(answer.ok).toBe(true);
    const read = await run(["read", s.repo], s.env);
    expect(read.notes.map((n) => [n.state, n.issue?.number, n.solved?.how])).toEqual([["to verify", 812, "fixed it"]]);
  });

  test("the note rewritten while gh creates the issue: read again, and recorded", async () => {
    const rewrite = `node -e 'const fs = require("fs"); const n = JSON.parse(fs.readFileSync(process.env.SBOX_NOTE)); n.draft = { title: "x" }; fs.writeFileSync(process.env.SBOX_NOTE, JSON.stringify(n))'`;
    const s = setup({ gh: { during: rewrite } });
    expect((await run(["file", s.repo, s.id, filing()], s.env)).ok).toBe(true);
    expect(noteOf(s)).toMatchObject({ status: "filed", draft: null, issue: { number: 812 } });
  });
});

describe("what box.js file refuses", () => {
  const refused = async (s, value) => {
    const answer = await run(["file", s.repo, s.id, value], s.env);
    expect(calls(s).some((c) => c[1] === "create")).toBe(false);
    expect(noteOf(s).status).toBe("open");
    return answer.error;
  };

  test("a note that was never checked", async () => {
    expect(await refused(setup({ check: null }), filing())).toBe("check the note first");
  });

  test("a note the check says is solved, until you say it is not", async () => {
    const gone = { ...CHECKED, gone: { on: "main", why: "fixed" } };
    expect(await refused(setup({ check: gone }), filing())).toContain("the check says the problem is gone");
    const s = setup({ check: gone });
    expect((await run(["file", s.repo, s.id, filing({ notGone: { reason: "still throws" } })], s.env)).ok).toBe(true);
    expect(noteOf(s).filed.notGone).toEqual({ reason: "still throws" });
  });

  test("an empty field, or a title of more than one line", async () => {
    expect(await refused(setup(), filing({ sections: { ...texts.sections, desired: " " } }))).toBe("Fill in: Desired situation");
    expect(await refused(setup(), filing({ title: "a\nb" }))).toContain("one line");
  });

  test("a token anywhere; in a public repo an email until marked fine", async () => {
    const token = { ...texts.sections, evidence: "with ghp_0123456789abcdefghijABCDEFGHIJ0123" };
    expect(await refused(setup({ gh: { visibility: "PRIVATE" } }), filing({ sections: token }))).toStartWith("Remove a GitHub token");
    const mail = { ...texts.sections, evidence: "jan@acme.be saw it" };
    expect(await refused(setup(), filing({ sections: mail }))).toBe("Remove or mark fine an email address: this repo is public");
    const s = setup();
    expect((await run(["file", s.repo, s.id, filing({ sections: mail, fine: ["jan@acme.be"] })], s.env)).ok).toBe(true);
    const p = setup({ gh: { visibility: "PRIVATE" } });
    expect((await run(["file", p.repo, p.id, filing({ sections: mail })], p.env)).ok).toBe(true);
  });

  test("a target that is not the one the editor showed", async () => {
    expect(await refused(setup({ config: CONFIG }), filing({ repo: "acme/other" }))).toContain("now files in acme/shop");
  });

  test("a tracker outside GitHub, and a note that is not open", async () => {
    expect(await refused(setup({ config: "tracker:\n  kind: monday\n" }), filing())).toContain("monday");
    const s = setup();
    await run(["act", s.repo, s.id, "bin"], s.env);
    expect((await run(["file", s.repo, s.id, filing()], s.env)).error).toBe("note 1 is binned; only an open note is filed");
  });

  test("a filed note is never filed twice", async () => {
    const s = setup();
    await run(["file", s.repo, s.id, filing()], s.env);
    expect((await run(["file", s.repo, s.id, filing()], s.env)).error).toBe("note 1 is filed; only an open note is filed");
    expect(calls(s).filter((c) => c[1] === "create")).toHaveLength(1);
  });
});

describe("box.js draft", () => {
  test("keeps what was typed, and null drops it", async () => {
    const s = setup();
    expect(await run(["draft", s.repo, s.id, filing({ fine: ["x@y.be"], notGone: { reason: "r" } })], s.env)).toEqual({ ok: true });
    expect(noteOf(s).draft).toEqual({ title: texts.title, sections: texts.sections, fine: ["x@y.be"], notGone: { reason: "r" } });
    await run(["draft", s.repo, s.id, "null"], s.env);
    expect(noteOf(s).draft).toBeNull();
  });
});

test("the search for similar issues uses the title's three main words", () => {
  expect(searchWords("formatDate throws on a null date")).toBe("formatDate throws null");
  expect(searchWords("Fix it")).toBe("");
  expect(searchWords("When the cache: the cache, again")).toBe("cache again");
});
