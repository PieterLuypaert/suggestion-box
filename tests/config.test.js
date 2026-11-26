// Reading the project's config: the small part of YAML it uses, and where an issue goes for each
// row of the table in docs/plan.md section 7.
import { describe, expect, test } from "bun:test";
import { filingTarget, readYaml } from "../mods/suggestion-box/config.js";

const FULL = `# The team's config
tracker:
  kind: github
  repo: acme/shop          # where issues go
  project: { owner: acme, number: 41 }
  status:
    field: "Status"
    todo: 'Backlog'
labels:
  needs-triage: triage
  ready-for-agent: ready
pr:
  link_keyword: Fixes
apps:
  - name: web
    check: pnpm test
`;

describe("readYaml", () => {
  test("nested maps, quoted and plain values, numbers, flow maps and comments", () => {
    const config = readYaml(FULL);
    expect(config.tracker).toEqual({ kind: "github", repo: "acme/shop", project: { owner: "acme", number: 41 }, status: { field: "Status", todo: "Backlog" } });
    expect(config.labels["needs-triage"]).toBe("triage");
    expect(config.pr.link_keyword).toBe("Fixes");
  });

  test("a # inside quotes or a word is not a comment; lists are left out", () => {
    const config = readYaml('a: "x # y"\nb: c#d\nlist:\n  - one\n  - two\n');
    expect(config).toEqual({ a: "x # y", b: "c#d", list: {} });
  });

  test("Windows line ends and an empty file", () => {
    expect(readYaml("tracker:\r\n  kind: github\r\n").tracker.kind).toBe("github");
    expect(readYaml("")).toEqual({});
  });
});

describe("where an issue goes", () => {
  test("the config with a board: its repo, the needs-triage label, the board and its todo column", () => {
    expect(filingTarget(FULL)).toEqual({ kind: "github", repo: "acme/shop", label: "triage", board: { owner: "acme", number: 41, field: "Status", column: "Backlog" }, linkKeyword: "Fixes" });
  });

  test("the config without project or status: no board", () => {
    const text = "tracker:\n  kind: github\n  repo: acme/shop\nlabels:\n  needs-triage: triage\n";
    expect(filingTarget(text)).toMatchObject({ repo: "acme/shop", label: "triage", board: null, linkKeyword: "Closes" });
    expect(filingTarget(`${text}  project: { owner: acme, number: 41 }\n`.replace("labels", "x")).board).toBeNull();
  });

  test("the field defaults to Status", () => {
    const text = "tracker:\n  repo: acme/shop\n  project: { owner: acme, number: 41 }\n  status:\n    todo: Todo\n";
    expect(filingTarget(text).board).toEqual({ owner: "acme", number: 41, field: "Status", column: "Todo" });
  });

  test("a tracker on monday or asana says so", () => {
    expect(filingTarget("tracker:\n  kind: monday\n").kind).toBe("monday");
  });

  test("no config: null, so the origin repo is used without a label", () => {
    expect(filingTarget(null)).toBeNull();
    expect(filingTarget(undefined)).toBeNull();
    expect(filingTarget("")).toEqual({ kind: "github", repo: null, label: null, board: null, linkKeyword: "Closes" });
  });
});
