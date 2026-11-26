// GPUI tracks a click by its element's id. Two elements of one note card with the same id swallow
// each other's clicks: the file link once had the id of the File issue button, so File issue did
// nothing. A button's id is `<action>:<note id>`, so no other id may start with an action's name.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACTIONS } from "../mods/suggestion-box/rules.js";
import { ROOT } from "./helpers.js";

test("no element id of the panel starts with the name of a button's action", () => {
  const text = readFileSync(join(ROOT, "mods", "suggestion-box", "panel.js"), "utf8");
  const prefixes = new Set([...text.matchAll(/(?:\.id\(|link\(t, |plainButton\(t, |card\(t, |messageCard\(t, )`([a-z-]+):/g)].map((match) => match[1]));
  expect(prefixes.size).toBeGreaterThan(10);
  expect([...prefixes].filter((prefix) => ACTIONS.includes(prefix))).toEqual([]);
});
