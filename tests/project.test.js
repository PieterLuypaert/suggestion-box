import { describe, expect, test } from "bun:test";
import { projectFolder, projectKey, projectName, ticketFor } from "../mods/suggestion-box/project.js";

describe("projectKey", () => {
  test("every way of writing the same GitHub repo gives one key", () => {
    const forms = [
      "git@github.com:Acme/shop.git",
      "https://github.com/Acme/shop",
      "https://github.com/Acme/shop.git/",
      "https://someone@github.com/acme/shop.git",
      "ssh://git@github.com/Acme/shop.git",
      "ssh://git@github.com:22/Acme/shop.git",
    ];
    for (const form of forms) expect(projectKey(form, "/x")).toBe("github.com/acme/shop");
  });

  test("a repo without an origin is keyed by its main checkout", () => {
    expect(projectKey(null, "/Users/you/code/scratch")).toBe("local/Users/you/code/scratch");
    expect(projectKey("  ", "/Users/you/code/scratch")).toBe("local/Users/you/code/scratch");
  });

  test("an origin that is a local path stays a local key", () => {
    expect(projectKey("/srv/git/shop.git", "/x")).toBe("local/srv/git/shop");
    expect(projectKey("file:///srv/git/shop.git", "/x")).toBe("local/srv/git/shop");
  });
});

test("projectFolder turns slashes into double underscores", () => {
  expect(projectFolder("github.com/acme/shop")).toBe("github.com__acme__shop");
  expect(projectFolder("local/Users/you/code/scratch")).toBe("local__Users__you__code__scratch");
  expect(projectFolder("local/Users/you/my code")).toBe("local__Users__you__my-code");
});

test("projectName is the key's last part", () => {
  expect(projectName("github.com/acme/shop")).toBe("shop");
});

describe("ticketFor", () => {
  test("parallel-tickets' record of the branch wins", () => {
    const records = [{ ticket: 812, branch: "fix/formatdate-null-date" }];
    expect(ticketFor("fix/formatdate-null-date", records)).toBe(812);
  });

  test("a <type>/<number>- branch names its ticket", () => {
    expect(ticketFor("feat/8504-group-records")).toBe(8504);
  });

  test("any other number in a branch name proves nothing", () => {
    expect(ticketFor("chore/bump-node-20")).toBeNull();
    expect(ticketFor("feat/s3-upload")).toBeNull();
    expect(ticketFor("main")).toBeNull();
    expect(ticketFor(null)).toBeNull();
  });
});
