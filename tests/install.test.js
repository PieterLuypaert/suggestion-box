// install.sh and uninstall.sh, each against a HOME of its own: the real ~/.claude and ~/.local/bin
// are never touched.
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, tempDir } from "./helpers.js";

const run = (script, home, args = []) => {
  const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: "", SUGGESTION_BOX_HOME: join(home, ".suggestion-box") };
  delete env.CLAUDE_CONFIG_DIR;
  const result = spawnSync("sh", [join(ROOT, script), ...args], { env, encoding: "utf8" });
  return { code: result.status, out: result.stdout, err: result.stderr };
};
const settingsOf = (home) => JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
const backups = (home) => readdirSync(join(home, ".claude")).filter((name) => name.startsWith("settings.json.backup-"));

const THEIRS = {
  model: "opus",
  permissions: { defaultMode: "auto", allow: ["Bash(git status:*)"] },
  hooks: { SessionStart: [{ matcher: "startup", hooks: [{ type: "command", command: "echo hi" }] }] },
};

test("install links the command and adds the hook and the rule, keeping everything else", () => {
  const home = tempDir("home-");
  mkdirSync(join(home, ".claude"));
  writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify(THEIRS, null, 2));
  const result = run("install.sh", home);
  expect(result.code).toBe(0);
  const link = join(home, ".local", "bin", "suggest");
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  expect(realpathSync(link)).toBe(join(ROOT, "bin", "suggest"));
  const settings = settingsOf(home);
  expect(settings.model).toBe("opus");
  expect(settings.permissions).toEqual({ defaultMode: "auto", allow: ["Bash(git status:*)", "Bash(suggest:*)"] });
  expect(settings.hooks.SessionStart).toEqual([
    THEIRS.hooks.SessionStart[0],
    { hooks: [{ type: "command", command: `"${link}" session-start` }] },
  ]);
  expect(backups(home)).toHaveLength(1);
});

test("install works without a settings.json and runs again without changing anything", () => {
  const home = tempDir("home-");
  expect(run("install.sh", home).code).toBe(0);
  const first = readFileSync(join(home, ".claude", "settings.json"), "utf8");
  const again = run("install.sh", home);
  expect(again.code).toBe(0);
  expect(again.out).toContain("there already");
  expect(readFileSync(join(home, ".claude", "settings.json"), "utf8")).toBe(first);
  expect(backups(home)).toHaveLength(1);
});

test("install points a hook of another checkout here instead of adding a second", () => {
  const home = tempDir("home-");
  mkdirSync(join(home, ".claude"));
  const old = { hooks: { SessionStart: [{ hooks: [{ type: "command", command: '"/old/bin/suggest" session-start' }] }] } };
  writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify(old));
  run("install.sh", home);
  const hooks = settingsOf(home).hooks.SessionStart;
  expect(hooks).toHaveLength(1);
  expect(hooks[0].hooks[0].command).toBe(`"${join(home, ".local", "bin", "suggest")}" session-start`);
});

test("install refuses to replace another tool called suggest", () => {
  const home = tempDir("home-");
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  writeFileSync(join(home, ".local", "bin", "suggest"), "#!/bin/sh\n");
  const result = run("install.sh", home);
  expect(result.code).toBe(1);
  expect(result.err).toContain("is not a suggestion-box command");
});

test("install refuses a settings.json that is not valid JSON, and changes nothing", () => {
  const home = tempDir("home-");
  mkdirSync(join(home, ".claude"));
  writeFileSync(join(home, ".claude", "settings.json"), "{ broken");
  const result = run("install.sh", home);
  expect(result.code).toBe(1);
  expect(readFileSync(join(home, ".claude", "settings.json"), "utf8")).toBe("{ broken");
});

test("install keeps a settings.json that links elsewhere a link", () => {
  const home = tempDir("home-");
  const dotfiles = tempDir("dot-");
  writeFileSync(join(dotfiles, "settings.json"), "{}");
  mkdirSync(join(home, ".claude"));
  symlinkSync(join(dotfiles, "settings.json"), join(home, ".claude", "settings.json"));
  run("install.sh", home);
  expect(lstatSync(join(home, ".claude", "settings.json")).isSymbolicLink()).toBe(true);
  expect(JSON.parse(readFileSync(join(dotfiles, "settings.json"), "utf8")).permissions.allow).toEqual(["Bash(suggest:*)"]);
});

test("uninstall takes out exactly what install added, and keeps the notes", () => {
  const home = tempDir("home-");
  mkdirSync(join(home, ".claude"));
  writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify(THEIRS, null, 2));
  run("install.sh", home);
  mkdirSync(join(home, ".suggestion-box", "notes"), { recursive: true });
  const result = run("uninstall.sh", home);
  expect(result.code).toBe(0);
  expect(existsSync(join(home, ".local", "bin", "suggest"))).toBe(false);
  expect(settingsOf(home)).toEqual(THEIRS);
  expect(existsSync(join(home, ".suggestion-box", "notes"))).toBe(true);
});

test("uninstall leaves an empty settings.json empty, and --purge removes the notes", () => {
  const home = tempDir("home-");
  run("install.sh", home);
  mkdirSync(join(home, ".suggestion-box"), { recursive: true });
  expect(run("uninstall.sh", home, ["--purge"]).code).toBe(0);
  expect(settingsOf(home)).toEqual({});
  expect(existsSync(join(home, ".suggestion-box"))).toBe(false);
});

test("uninstall leaves another tool called suggest alone", () => {
  const home = tempDir("home-");
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  symlinkSync("/usr/bin/true", join(home, ".local", "bin", "suggest"));
  run("uninstall.sh", home);
  expect(readlinkSync(join(home, ".local", "bin", "suggest"))).toBe("/usr/bin/true");
});

test("install.sh and uninstall.sh run as ./install.sh, as the readme says", () => {
  const home = tempDir("home-");
  const env = { ...process.env, HOME: home };
  delete env.CLAUDE_CONFIG_DIR;
  expect(spawnSync(join(ROOT, "install.sh"), [], { env }).status).toBe(0);
  expect(spawnSync(join(ROOT, "uninstall.sh"), [], { env }).status).toBe(0);
});

test("uninstall leaves another tool's bin/suggest alone", () => {
  const home = tempDir("home-");
  const other = join(tempDir("other-"), "bin");
  mkdirSync(other, { recursive: true });
  writeFileSync(join(other, "suggest"), "#!/bin/sh\n");
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  symlinkSync(join(other, "suggest"), join(home, ".local", "bin", "suggest"));
  run("uninstall.sh", home);
  expect(readlinkSync(join(home, ".local", "bin", "suggest"))).toBe(join(other, "suggest"));
});

test("--purge leaves a folder alone that holds more than a box", () => {
  const home = tempDir("home-");
  mkdirSync(join(home, ".suggestion-box", "notes"), { recursive: true });
  writeFileSync(join(home, ".suggestion-box", "thesis.docx"), "mine");
  const result = run("uninstall.sh", home, ["--purge"]);
  expect(result.code).toBe(1);
  expect(result.err).toContain("holds more than notes and settings.json");
  expect(existsSync(join(home, ".suggestion-box", "thesis.docx"))).toBe(true);
});
