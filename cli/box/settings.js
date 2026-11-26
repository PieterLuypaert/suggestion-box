// The collecting switches: for the project here, by a project's key, or for every project.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boxRoot, collecting, readSettings } from "../shared/store.js";

export function switchCollecting(project, rest, env) {
  const [value, scope] = rest;
  if (value !== "on" && value !== "off") return { error: "say on or off" };
  if (scope !== undefined && scope !== "--all" && scope !== "--key") return { error: `unknown ${scope}; use --all or --key <project>` };
  // A key is a project as the box names it: a path-like name, such as github.com/acme/shop.
  const key = scope === "--key" ? rest[2] : project.key;
  if (scope === "--key" && !(typeof key === "string" && key.trim() === key && /\S\/\S/.test(key))) return { error: "--key needs a project, such as github.com/acme/shop" };
  const root = boxRoot(env);
  mkdirSync(root, { recursive: true });
  const settings = readSettings(root);
  const off = new Set(settings.off ?? []);
  if (scope === "--all") settings.collecting = value === "on";
  else if (value === "on") off.delete(key);
  else off.add(key);
  settings.off = [...off].sort();
  if (settings.collecting === undefined) settings.collecting = true;
  const file = join(root, "settings.json");
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(temporary, file);
  return { ok: true, collecting: { all: settings.collecting !== false, project: collecting(settings, key) } };
}
