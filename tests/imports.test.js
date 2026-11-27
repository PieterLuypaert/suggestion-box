// A Herdr function a mod file calls without importing it reaches a global of the same name, or
// nothing: the ticket chip once called window() that way and failed with "not a function".
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers.js";

const HERDR = ["appHome", "checking", "exec", "focused", "layout", "nextCommand", "notify", "props", "run", "setShared", "settings", "shared", "spaces", "terminals", "theme", "watchFolder", "window", "writeTextFile"];

test("every Herdr function a mod file calls is imported from herdr there", () => {
  const dir = join(ROOT, "mods", "suggestion-box");
  const missing = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".js"))) {
    const text = readFileSync(join(dir, file), "utf8");
    const imported = new Set((text.match(/import \{([^}]*)\} from "herdr"/)?.[1] ?? "").split(",").map((name) => name.trim()));
    for (const name of HERDR) {
      // A call of the bare name, not a method (`.run(`) or a word inside another name.
      const isCalled = new RegExp(`(?<![\\w.$])${name}\\(`).test(text);
      const isOwn = new RegExp(`(?:function|const|let) ${name}\\b`).test(text);
      if (isCalled && !isOwn && !imported.has(name)) missing.push(`${file}: ${name}`);
    }
  }
  expect(missing).toEqual([]);
});
