// Reading and writing a project's notes on the box's side: a note with its events, every note of a
// folder, and a write over a note that reads it again when something else wrote it in between.
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fold } from "../../mods/suggestion-box/events.js";

export const DAY = 86400000;

export const KEEP_DAYS = 30;

// Every note with a file, its events folded in, each with the names of the event files it holds.
export function notesOf(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => loadNote(dir, name.slice(0, -5)))
    .filter(Boolean)
    .map(({ note, events }) => ({ ...fold(note, events.map((e) => e.event)), eventFiles: events.map((e) => e.file) }));
}

export function loadNote(dir, id) {
  const file = join(dir, `${id}.json`);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  return { note: JSON.parse(text), text, events: eventsOf(dir, id) };
}

function eventsOf(dir, id) {
  const folder = join(dir, "events", id);
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ file: join(folder, name), event: JSON.parse(readFileSync(join(folder, name), "utf8")) }));
}

// Writes a note over itself with what `change` makes of it: `change({ note, view })` gets the note
// as on disk and with its events folded in, and returns { note } to write, { skip } or { error }.
// When something else wrote the note in between (a check finishing, a draft), it reads it again and
// asks once more. With foldEvents the written note holds the events, so their files go.
export function update(project, id, change, { foldEvents = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    const loaded = loadNote(project.dir, id);
    if (!loaded) return { error: `there is no note ${id}` };
    const result = change({ note: loaded.note, view: fold(loaded.note, loaded.events.map((e) => e.event)) });
    if (result.error) return { error: result.error };
    if (result.skip) return { ok: true, skipped: true };
    try {
      writeOver(join(project.dir, `${id}.json`), loaded.text, result.note);
    } catch (error) {
      if (attempt < 5 && error.message.startsWith("the note changed")) continue;
      throw error;
    }
    if (foldEvents) for (const { file: event } of loaded.events) rmSync(event, { force: true });
    return { ok: true, note: result.note };
  }
}

// Replaces a file in one step, and only while it still holds what was read.
function writeOver(file, expected, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  if (readFileSync(file, "utf8") !== expected) {
    rmSync(temporary, { force: true });
    throw new Error("the note changed meanwhile; try again");
  }
  renameSync(temporary, file);
}
