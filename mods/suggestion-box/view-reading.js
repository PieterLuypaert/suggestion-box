// Which box the panel shows: the focused space's folder, reading its box for every copy, the read
// that shows while you move between tabs, the folder buttons act on, and notices.
import { focused, setShared, shared, spaces } from "herdr";
import { buttonsFor, moveNotice } from "./rules.js";
import { BLOCK, box, DATA, isShown, NOTICE_MS, READ_WAIT_MS, READING, sleep, WIGGLE_MS } from "./view-host.js";

// The view's methods for this part, added to it in main.js.
export const reading = {
  // The focused space's folder, or why there is no box here.
  here() {
    const at = focused();
    const space = spaces().find((one) => one.id === at?.space) ?? spaces().find((one) => one.active);
    if (!space) return { none: "No space is open." };
    if (space.machine) return { none: "This space is on another machine; its notes stay there.", remote: true };
    // While the panel itself (or another mod) has the keyboard there is no terminal folder: the
    // space's last terminal folder still says which project it is.
    this.folders ??= new Map();
    if (at?.terminal && at.cwd) this.folders.set(space.id, at.cwd);
    const folder = this.folders.get(space.id) || space.folder;
    return folder ? { folder, space: space.id } : { none: "This space has no folder." };
  },

  read(cx, withChanges) {
    const here = this.here();
    if (!this.boxJs || !here.folder) return;
    setShared(READING, { folder: here.folder, at: Date.now() });
    cx.spawn(async (cx) => {
      try {
        const answer = await box(this.node, this.boxJs, ["read", here.folder, ...(withChanges ? ["--changes"] : [])]);
        if (!withChanges) this.keepChanges(answer);
        this.error = "";
        this.arrived(cx, here.folder, answer);
        setShared(DATA, { folder: here.folder, space: here.space, answer });
        if (!this.isButton) this.syncEditor(answer);
      } catch (error) {
        this.error = `Could not read the box: ${error.message}`;
        if (shared(READING)?.folder === here.folder) setShared(READING, null);
      }
      cx.notify();
    });
  },

  // A quick read (after an action, or a new drop) asks git nothing: what the last full read found
  // about each note's lines stays, with its Mark solved button, until the next full read.
  keepChanges(answer) {
    const before = new Map((shared(DATA)?.answer?.notes ?? []).map((note) => [note.id, note.changed]));
    for (const note of answer.notes ?? []) {
      if (note.state !== "open" || !before.get(note.id)) continue;
      note.changed = before.get(note.id);
      note.actions = buttonsFor(note);
    }
  },

  // The last read of the focused space's box. Moving to another tab of the space (Main and its
  // ticket worktrees: other folders, the same project) shows that read while the read for the new
  // folder is on its way, so the panel never flashes empty or closes what you opened; and while a mod
  // has the keyboard (the panel itself), as no terminal says which folder that is. A read that failed
  // or never came ends it; another space starts empty. While it shows, every button acts on the box
  // shown (shownFolder), never on the folder you moved to.
  answer() {
    const data = shared(DATA);
    if (!data) return null;
    const here = this.here();
    if (data.folder === here.folder) return data.answer;
    if (!data.space || data.space !== here.space) return null;
    const reading = shared(READING);
    const isOnItsWay = reading?.folder === here.folder && Date.now() - reading.at < READ_WAIT_MS;
    return isOnItsWay || !focused()?.terminal ? data.answer : null;
  },

  // The folder of the box the panel shows, which every button acts on.
  shownFolder() {
    const data = shared(DATA);
    return data && data.answer === this.answer() ? data.folder : this.here().folder;
  },

  // What a new answer changes: the button wiggles when a note arrives while the panel is shut; the
  // panel says so when a note leaves a group by itself.
  arrived(cx, folder, answer) {
    const key = answer.project?.key;
    const total = (answer.counts?.open ?? 0) + (answer.counts?.toVerify ?? 0);
    if (this.isButton && key && key === this.lastKey && total > this.lastTotal && !isShown(BLOCK)) {
      this.wiggleUntil = Date.now() + WIGGLE_MS;
      cx.spawn(async (cx) => {
        await sleep(cx, WIGGLE_MS);
        cx.notify();
      });
    }
    this.lastKey = key;
    this.lastTotal = total;
  },

  // The panel says so when a note leaves a group by itself, whichever copy read it.
  watchMoves(cx) {
    const answer = this.answer();
    if (!answer || answer === this.seenAnswer) return;
    this.seenAnswer = answer;
    const key = answer.project?.key;
    if (key && key === this.seenKey) this.noticeMoves(cx, answer);
    this.seenKey = key;
    // Filed and confirmed notes too: a claim on a filed issue, or a fix sent back, moves them.
    this.lastStates = new Map([...(answer.notes ?? []), ...(answer.history ?? [])].map((note) => [note.id, note.state]));
  },

  noticeMoves(cx, answer) {
    for (const note of answer.notes ?? []) {
      const text = moveNotice(note, this.lastStates?.get(note.id));
      if (!text || Date.now() < (this.mine?.get(note.id) ?? 0)) continue;
      const editing = this.editor?.id === note.id ? " Your draft is kept." : this.expanded?.has(note.id) ? " Your view of it is kept." : "";
      this.say(cx, `${text}${editing}`);
    }
  },

  say(cx, text) {
    this.notice = text;
    const shown = text;
    cx.spawn(async (cx) => {
      await sleep(cx, NOTICE_MS);
      if (this.notice === shown) this.notice = null;
      cx.notify();
    });
  },
};
