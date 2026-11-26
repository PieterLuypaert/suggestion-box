// What must not go out in an issue: tokens always block; other hits block only in a public repo,
// until marked fine.
import { describe, expect, test } from "bun:test";
import { scan, scanBlock } from "../mods/suggestion-box/scan.js";

const kinds = (text) => scan(text).map((hit) => hit.kind);

describe("tokens, which always block", () => {
  test.each([
    ["a GitHub token", "token ghp_0123456789abcdefghijABCDEFGHIJ0123 here"],
    ["a GitHub token", "github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ"],
    ["an AWS key", "AKIAIOSFODNN7EXAMPLE"],
    ["a Slack token", "xoxb-1234567890-abcdefghij"],
    ["an Anthropic key", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"],
    ["an OpenAI key", "sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8t"],
    ["a private key", "-----BEGIN RSA PRIVATE KEY-----"],
    ["a bearer token", "Authorization: Bearer abcdefghijklmnopqrstuvwxyz.123"],
  ])("%s", (kind, text) => {
    const hit = scan(text).find((one) => one.kind === kind);
    expect(hit?.blocking).toBe(true);
    expect(scanBlock(scan(text), { isPublic: false })).toStartWith(`Remove ${kind}`);
  });
});

describe("other hits", () => {
  test("an email, a home path, an IP address and a long random string", () => {
    expect(kinds("mail jan@acme.be")).toEqual(["an email address"]);
    expect(kinds("in /Users/jan/code")).toEqual(["a home path"]);
    expect(kinds("server 10.0.4.12 is down")).toEqual(["an IP address"]);
    expect(kinds("key a8Fk2LmQ9zXv3Rt7Yp1Wn5Bc6Dh0Js4Ge")).toEqual(["a long random string"]);
    expect(scan("jan@acme.be")[0].blocking).toBe(false);
  });

  test("never: example addresses, placeholder homes, localhost, versions, SHAs, UUIDs, words", () => {
    const text = [
      "dev@example.com", "1234+jan@users.noreply.github.com", "/Users/you/x", "/home/runner/work",
      "127.0.0.1", "0.0.0.0", "v1.2.3.4", "999.1.1.1",
      "9f3e21c4a8b7d6e5f4a3b2c1d0e9f8a7b6c5d4e3", "123e4567-e89b-12d3-a456-426614174000",
      "formatDateWithTheLocaleOfTheInvoiceOwner", "src/very/long/path/to/some/file/that/is/deep.ts",
    ].join("\n");
    expect(scan(text)).toEqual([]);
  });

  test("placeholders and slugs that look like a token's start are not tokens", () => {
    expect(scan("the client sends Authorization: Bearer YOUR_ACCESS_TOKEN_HERE")).toEqual([]);
    expect(scan("the sk-some-long-kebab-case-name-here package")).toEqual([]);
  });

  test("macOS's shared folder is nobody's home; a home next to it still is", () => {
    expect(scan("the fixture lives in /Users/Shared/fixtures")).toEqual([]);
    expect(kinds("from /Users/Shared/x and /Users/jan/y")).toEqual(["a home path"]);
  });

  test("a token is not found again as a long random string", () => {
    expect(kinds("ghp_0123456789abcdefghijABCDEFGHIJ0123")).toEqual(["a GitHub token"]);
  });
});

describe("scanBlock", () => {
  const hits = scan("mail jan@acme.be from /Users/jan");

  test("a private repo only shows them", () => {
    expect(scanBlock(hits, { isPublic: false })).toBeNull();
  });

  test("a public repo waits until each is gone or marked fine", () => {
    expect(scanBlock(hits, { isPublic: true })).toBe("Remove or mark fine 2 items: this repo is public");
    expect(scanBlock(hits, { isPublic: true, fine: ["jan@acme.be"] })).toBe("Remove or mark fine a home path: this repo is public");
    expect(scanBlock(hits, { isPublic: true, fine: ["jan@acme.be", "/Users/jan"] })).toBeNull();
  });

  test("a token cannot be marked fine", () => {
    const token = scan("ghp_0123456789abcdefghijABCDEFGHIJ0123");
    expect(scanBlock(token, { isPublic: false, fine: [token[0].text] })).toStartWith("Remove a GitHub token");
  });
});
