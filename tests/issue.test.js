// The issue text a note becomes, exactly as PLAN.md section 7 shows it.
import { expect, test } from "bun:test";
import { branchName, githubRepo, issueText, permalink } from "../mods/suggestion-box/issue.js";

const sections = {
  problem: "Invoices without a due date crash the PDF export.",
  evidence: "A fixture with `dueDate: null` made `exportPdf` throw.",
  current: "`formatDate(null)` throws, so the export answers with a 500.",
  desired: "`formatDate(null)` returns a dash and the export works.",
};

test("the four headings in order, the code under Evidence, the ticket at the end", () => {
  const link = { url: "https://github.com/acme/shop/blob/abc1234/src/invoices.ts#L40-L44", embed: true };
  expect(issueText({ sections }, { link, ticket: 8504 })).toBe(`## Problem

Invoices without a due date crash the PDF export.

## Evidence

A fixture with \`dueDate: null\` made \`exportPdf\` throw.

https://github.com/acme/shop/blob/abc1234/src/invoices.ts#L40-L44

## Current situation

\`formatDate(null)\` throws, so the export answers with a 500.

## Desired situation

\`formatDate(null)\` returns a dash and the export works.

---

Spotted while working on #8504.
`);
});

test("a link GitHub cannot show as code is a Where: line; no ticket, no ticket line", () => {
  const text = issueText({ sections }, { link: { url: "https://github.com/acme/shop/blob/main/src/invoices.ts", embed: false } });
  expect(text).toContain("throw.\n\nWhere: https://github.com/acme/shop/blob/main/src/invoices.ts\n\n## Current situation");
  expect(text).not.toContain("Spotted");
  expect(text).not.toContain("---");
});

test("no file, no link; no mention of Claude or agents", () => {
  const text = issueText({ sections }, {});
  expect(text).not.toContain("http");
  expect(text).not.toMatch(/claude|agent/i);
  expect(text.endsWith("export works.\n")).toBe(true);
});

test("the repo of a GitHub project, else null", () => {
  expect(githubRepo("github.com/acme/shop")).toBe("acme/shop");
  expect(githubRepo("gitlab.com/acme/shop")).toBeNull();
  expect(githubRepo("local/Users/x/shop")).toBeNull();
  expect(githubRepo(null)).toBeNull();
});

test("permalinks to a line, a range or a file", () => {
  expect(permalink("acme/shop", "abc", "src/a.ts", 40, 44)).toBe("https://github.com/acme/shop/blob/abc/src/a.ts#L40-L44");
  expect(permalink("acme/shop", "abc", "src/a.ts", 40, 40)).toBe("https://github.com/acme/shop/blob/abc/src/a.ts#L40");
  expect(permalink("acme/shop", "abc", "src/a.ts", null, null)).toBe("https://github.com/acme/shop/blob/abc/src/a.ts");
});

test("branch names as parallel-tickets makes them", () => {
  expect(branchName("formatDate throws on a null date")).toBe("fix/formatdate-throws-null-date");
  expect(branchName("Add the export of all the invoices to the CSV file", "feat")).toBe("feat/add-export-all-invoices-csv");
  expect(branchName("!!!")).toBe("fix/note");
});
