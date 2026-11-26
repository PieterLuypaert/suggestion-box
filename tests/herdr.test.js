// The Herdr app side of install.sh and uninstall.sh, and the layout changes they make, against a
// throwaway home with a stand-in herdr-app: the real app and its layouts are never touched.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, tempDir } from "./helpers.js";

const LAYOUT = {
  id: "root",
  type: "row",
  children: [
    { id: "sidebar", type: "column", size: { px: 268 }, children: [] },
    {
      id: "work",
      type: "column",
      children: [
        {
          id: "tabs-row",
          type: "row",
          size: { px: 42 },
          children: [
            { id: "tabs", type: "block", size: { weight: 1 }, content: { mod: "tabs" } },
            { id: "parrot-button", type: "block", size: { px: 92 }, content: { mod: "parrot", props: { button: true } } },
            { id: "quarterdeck-button", type: "block", size: { px: 124 }, content: { mod: "quarterdeck", props: { button: true } } },
          ],
        },
        { id: "work-body", type: "row", children: [] },
      ],
    },
    { id: "quarterdeck", type: "block", hidden: true, size: { px: 380 }, content: { mod: "quarterdeck" } },
  ],
};
const PLAIN = {
  id: "root",
  type: "row",
  children: [{ id: "work", type: "column", children: [{ id: "tabs", type: "block", size: { px: 40 }, content: { mod: "tabs" } }, { id: "body", type: "block", content: { tab: "active" } }] }],
};

const jq = (filter, value) => {
  const result = spawnSync("jq", ["-f", join(ROOT, filter)], { input: JSON.stringify(value), encoding: "utf8" });
  return { code: result.status, value: result.status === 0 ? JSON.parse(result.stdout) : null, err: result.stderr };
};
const find = (node, id) => (node?.id === id ? node : (node?.children ?? []).map((c) => find(c, id)).find(Boolean) ?? null);

describe("layout.jq and unlayout.jq", () => {
  test("the button goes after Quarterdeck's and the panel to the right of the window", () => {
    const { value } = jq("layout.jq", LAYOUT);
    expect(find(value, "tabs-row").children.map((c) => c.id)).toEqual(["tabs", "parrot-button", "quarterdeck-button", "suggestion-box-button"]);
    expect(value.children.map((c) => c.id)).toEqual(["sidebar", "work", "quarterdeck", "suggestion-box"]);
    expect(find(value, "suggestion-box")).toMatchObject({ hidden: true, size: { px: 400 }, content: { mod: "suggestion-box" } });
    expect(find(value, "suggestion-box-button").content).toEqual({ mod: "suggestion-box", props: { button: true } });
  });

  test("a tab bar without a row gets one, and running it twice changes nothing", () => {
    const once = jq("layout.jq", PLAIN).value;
    expect(find(once, "tabs-row")).toMatchObject({ size: { px: 40 }, children: [{ id: "tabs", size: { weight: 1 } }, { id: "suggestion-box-button" }] });
    expect(jq("layout.jq", once).value).toEqual(once);
  });

  test("unlayout gives back exactly the layout it was", () => {
    expect(jq("unlayout.jq", jq("layout.jq", LAYOUT).value).value).toEqual(LAYOUT);
    expect(jq("unlayout.jq", jq("layout.jq", PLAIN).value).value).toEqual(PLAIN);
  });

  test("a layout without a row at its root, or without a tab bar, is refused", () => {
    expect(jq("layout.jq", { id: "r", type: "column", children: [] }).err).toContain("its root is not a row");
    expect(jq("layout.jq", { id: "r", type: "row", children: [] }).err).toContain("it has no tab bar");
  });
});

// A throwaway home with a Herdr app folder and a stand-in herdr-app that logs its calls.
function appHome({ layout = "mine", shipped = false, keys = {} } = {}) {
  const home = tempDir("home-");
  const app = join(home, ".config", "herdr-app");
  mkdirSync(join(app, "layouts"), { recursive: true });
  mkdirSync(join(app, "mods"));
  writeFileSync(join(app, "layouts", `${layout}.json`), JSON.stringify(LAYOUT, null, 2));
  writeFileSync(join(app, "shared.json"), JSON.stringify({ layout }));
  writeFileSync(join(app, "installed.json"), JSON.stringify(shipped ? { [`layout:${layout}`]: "1" } : {}));
  writeFileSync(join(app, "keys.json"), JSON.stringify({ global: keys }, null, 2));
  const bin = join(home, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "herdr-app"), `#!/bin/sh
echo "$*" >> "${home}/herdr-calls"
if [ "$1" = do ] && [ "$2" = layout.clone ]; then
  from=$(echo "$3" | jq -r .name); to=$(echo "$3" | jq -r .as)
  cp "${app}/layouts/$from.json" "${app}/layouts/$to.json"
fi
exit 0
`);
  chmodSync(join(bin, "herdr-app"), 0o755);
  return { home, app };
}

const run = (script, home, args = []) => {
  const env = { ...process.env, HOME: home, PATH: `${join(home, "bin")}:${process.env.PATH}`, HERDR_APP_HOME: join(home, ".config", "herdr-app"), SUGGESTION_BOX_HOME: join(home, ".suggestion-box") };
  delete env.CLAUDE_CONFIG_DIR;
  const result = spawnSync("sh", [join(ROOT, script), ...args], { env, encoding: "utf8" });
  return { code: result.status, out: result.stdout, err: result.stderr };
};
const layoutOf = (app, name) => JSON.parse(readFileSync(join(app, "layouts", `${name}.json`), "utf8"));
const keysOf = (app) => JSON.parse(readFileSync(join(app, "keys.json"), "utf8")).global;

describe("install.sh with the Herdr app", () => {
  test("without a Herdr app only the command and the hook go in", () => {
    const home = tempDir("home-");
    const result = run("install.sh", home);
    expect(result.code).toBe(0);
    expect(result.out).toContain("no Herdr app here");
  });

  test("links the mod, adds the button and the panel, binds cmd-alt-s and checks the mod", () => {
    const { home, app } = appHome();
    const result = run("install.sh", home);
    expect(result.code).toBe(0);
    expect(lstatSync(join(app, "mods", "suggestion-box")).isSymbolicLink()).toBe(true);
    expect(realpathSync(join(app, "mods", "suggestion-box"))).toBe(join(ROOT, "mods", "suggestion-box"));
    expect(find(layoutOf(app, "mine"), "suggestion-box-button")).not.toBeNull();
    expect(find(layoutOf(app, "mine"), "suggestion-box")).not.toBeNull();
    expect(keysOf(app)["cmd-alt-s"]).toBe("layout.toggle:suggestion-box");
    expect(readFileSync(join(home, "herdr-calls"), "utf8")).toContain("check");
    expect(readdirSync(join(app, "layouts")).some((n) => n.startsWith("mine.json.old-"))).toBe(true);
  });

  test("runs again without changing the layout or the keys", () => {
    const { home, app } = appHome();
    run("install.sh", home);
    const layout = readFileSync(join(app, "layouts", "mine.json"), "utf8");
    const again = run("install.sh", home);
    expect(again.code).toBe(0);
    expect(again.out).toContain("has the button and the panel already");
    expect(again.out).toContain("does layout.toggle:suggestion-box already");
    expect(readFileSync(join(app, "layouts", "mine.json"), "utf8")).toBe(layout);
  });

  test("one of Herdr's own layouts gets a copy with the box in it", () => {
    const { home, app } = appHome({ layout: "main", shipped: true });
    const result = run("install.sh", home);
    expect(result.code).toBe(0);
    expect(find(layoutOf(app, "main"), "suggestion-box")).toBeNull();
    expect(find(layoutOf(app, "main-suggestion-box"), "suggestion-box")).not.toBeNull();
  });

  test("a cmd-alt-s that does something else is left alone", () => {
    const { home, app } = appHome({ keys: { "cmd-alt-s": "app.save" } });
    const result = run("install.sh", home);
    expect(result.code).toBe(0);
    expect(result.err).toContain("cmd-alt-s does app.save");
    expect(keysOf(app)["cmd-alt-s"]).toBe("app.save");
  });

  test("uninstall takes the mod, the button, the panel and the key out again", () => {
    const { home, app } = appHome();
    const before = layoutOf(app, "mine");
    run("install.sh", home);
    const result = run("uninstall.sh", home);
    expect(result.code).toBe(0);
    expect(existsSync(join(app, "mods", "suggestion-box"))).toBe(false);
    expect(layoutOf(app, "mine")).toEqual(before);
    expect(keysOf(app)["cmd-alt-s"]).toBeUndefined();
  });
});
