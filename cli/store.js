// The box on disk. The command only ever creates files, each complete and at once, so many agents
// can drop at the same moment and no agent write can undo what the box did:
//   <root>/settings.json                      the switches; only the box writes it
//   <root>/notes/<project>/<id>.json          a note
//   <root>/notes/<project>/numbers/<n>        one empty file per note number taken
//   <root>/notes/<project>/keys/<key>         the id of the note with that title and file
//   <root>/notes/<project>/events/<id>/*.json repeats and claims, folded in by the box
//   <root>/notes/<project>/tombstones/<id>.json what is left of an old note
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fold } from "../mods/suggestion-box/events.js";

export function boxRoot(env) {
  return env.SUGGESTION_BOX_HOME || join(homedir(), ".suggestion-box");
}

export function readSettings(root) {
  const file = join(root, "settings.json");
  if (!existsSync(file)) return { collecting: true, off: [] };
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`could not read ${file}: ${error.message}`);
  }
}

export function collecting(settings, key) {
  return settings.collecting !== false && !(settings.off ?? []).includes(key);
}

// Writes text to a file that must not exist yet, all at once: false when it already does.
function publish(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(temporary, text);
  try {
    linkSync(temporary, file);
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function claimKey(dir, key, id) {
  return publish(join(dir, "keys", key), id);
}

// Takes a key back, only while it still names this note.
export function dropKey(dir, key, id) {
  if (readKey(dir, key) === id) rmSync(join(dir, "keys", key), { force: true });
}

export function readKey(dir, key) {
  const file = join(dir, "keys", key);
  return existsSync(file) ? readFileSync(file, "utf8").trim() : null;
}

// The next free note number, taken by creating its file; numbers are never reused.
export function claimNumber(dir) {
  const folder = join(dir, "numbers");
  mkdirSync(folder, { recursive: true });
  const taken = readdirSync(folder).map(Number).filter(Number.isInteger);
  for (let number = Math.max(0, ...taken) + 1; number < Number.MAX_SAFE_INTEGER; number++) {
    if (publish(join(folder, String(number)), "")) return number;
  }
  throw new Error("no free note number");
}

export function writeNote(dir, note) {
  if (!publish(join(dir, `${note.id}.json`), `${JSON.stringify(note, null, 2)}\n`)) {
    throw new Error(`note ${note.id} exists already`);
  }
}

export function addEvent(dir, id, event) {
  const name = `${event.at.replace(/[:.]/g, "-")}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.json`;
  publish(join(dir, "events", id, name), `${JSON.stringify(event, null, 2)}\n`);
}

// A note with its events folded in, from its file or its tombstone; null when neither exists.
export function readNote(dir, id) {
  const note = readJson(join(dir, `${id}.json`));
  if (note) return fold(note, readEvents(dir, id));
  const tombstone = readJson(join(dir, "tombstones", `${id}.json`));
  return tombstone ? { ...fold(tombstone, readEvents(dir, id)), tombstone: true } : null;
}

// Every note of the project that still has its file, with its events folded in.
export function readNotes(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readNote(dir, name.slice(0, -5)))
    .filter(Boolean);
}

function readEvents(dir, id) {
  const folder = join(dir, "events", id);
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson(join(folder, name)))
    .filter(Boolean);
}

function readJson(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`could not read ${file}: ${error.message}`);
  }
}
