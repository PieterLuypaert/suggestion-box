// The suggestion box in the Herdr app. With props {button: true} it is the tab bar's button: it reads
// the focused space's box, keeps one right-hand panel at a time, and wiggles when a note arrives.
// Without, it is the panel on the right: the box's notes by state, with the actions their state
// allows. Every read and write goes through cli/box.js in the checkout this mod links to; this file
// only keeps state, and panel.js draws.
import { View } from "gpui-kit";
import { appHome, checking, exec, focused, layout, nextCommand, notify, props, run, setShared, shared, spaces, terminals, theme, watchFolder, window } from "herdr";
import { button, panel } from "./panel.js";
import { buttonsFor } from "./rules.js";

const BLOCK = "suggestion-box";
const MOD = "suggestion-box";
// The other right-hand panels: Quarterdeck, Chartroom, and Herdr's Files and Changes.
const OTHERS = ["quarterdeck", "chartroom", "panel"];
// The last read of the focused space's box, for every copy: { folder, answer }.
const DATA = "suggestion-box.data";
// The button copy that keeps the one-panel rule: the newest, so an older copy kept alive across a
// reload of the mod never acts twice.
const LIVE = "suggestion-box.live";
const CHANGES_MS = 60000;
const UNDO_MS = 5000;
const NOTICE_MS = 6000;
const WIGGLE_MS = 700;
const DAY_MS = 86400000;
// The editors a note's file opens in, the first that is there, as parrot opens them.
const EDITORS = ["cursor", "/usr/local/bin/cursor", "/Applications/Cursor.app/Contents/Resources/app/bin/cursor", "code", "/usr/local/bin/code"];

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}
const isShown = (id) => {
  const node = find(layout(), id);
  return Boolean(node) && node.hidden !== true;
};
const sleep = (cx, ms) => new Promise((done) => cx.timer.after(ms, () => done()));

// node by its real path: an app started from the Dock may not have the PATH of a shell, and a
// version manager's per-shell path (fnm, nvm) goes away with that shell. Tried as the app finds it,
// then through the person's login shell.
async function findNode() {
  const tries = [["node", ["-p", "process.execPath"]], ["sh", ["-c", 'exec "${SHELL:-/bin/zsh}" -lc "node -p process.execPath"']]];
  for (const [command, args] of tries) {
    const found = await exec(command, args).catch(() => null);
    const path = found?.code === 0 ? found.stdout.trim().split("\n").pop() : "";
    if (path.startsWith("/")) return path;
  }
  throw new Error("node was not found, directly or through your login shell");
}

// One answer of cli/box.js: its JSON, or an error with what it said.
async function box(node, path, args) {
  const result = await exec(node, [path, ...args], { timeout: 60000 });
  let answer;
  try {
    answer = JSON.parse(result.stdout);
  } catch {
    throw new Error((result.stderr || result.stdout).trim().split("\n").pop() || `box.js stopped with code ${result.code}`);
  }
  if (answer.error) throw new Error(answer.error);
  return answer;
}

export default class SuggestionBox extends View {
  init(_props, cx) {
    this.isButton = Boolean(props()?.button);
    this.copy = `${Date.now()}-${Math.random()}`;
    this.folder = undefined;
    this.error = "";
    if (this.isButton) this.initButton(cx);
    else this.initPanel(cx);
    if (checking()) return;
    cx.spawn(async (cx) => {
      try {
        // The checkout the mod's link points into: -P follows the link before .. climbs.
        const real = await exec("sh", ["-c", 'cd -P "$1" && cd ../.. && pwd -P', "sh", `${appHome()}/mods/${MOD}`]);
        this.node = await findNode();
        this.boxJs = `${real.stdout.trim()}/cli/box.js`;
        this.read(cx, true);
      } catch (error) {
        this.error = `The box's own side was not found: ${error.message}`;
        cx.notify();
      }
    });
  }

  // ---- reading, for both copies ----

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
    return folder ? { folder } : { none: "This space has no folder." };
  }

  read(cx, withChanges) {
    const here = this.here();
    if (!this.boxJs || !here.folder) return;
    cx.spawn(async (cx) => {
      try {
        const answer = await box(this.node, this.boxJs, ["read", here.folder, ...(withChanges ? ["--changes"] : [])]);
        if (!withChanges) this.keepChanges(answer);
        this.error = "";
        this.arrived(cx, here.folder, answer);
        setShared(DATA, { folder: here.folder, answer });
      } catch (error) {
        this.error = `Could not read the box: ${error.message}`;
      }
      cx.notify();
    });
  }

  // A quick read (after an action, or a new drop) asks git nothing: what the last full read found
  // about each note's lines stays, with its Mark solved button, until the next full read.
  keepChanges(answer) {
    const before = new Map((shared(DATA)?.answer?.notes ?? []).map((note) => [note.id, note.changed]));
    for (const note of answer.notes ?? []) {
      if (note.state !== "open" || !before.get(note.id)) continue;
      note.changed = before.get(note.id);
      note.actions = buttonsFor(note);
    }
  }

  answer() {
    const data = shared(DATA);
    return data && data.folder === this.here().folder ? data.answer : null;
  }

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
  }

  // The panel says so when a note leaves a group by itself, whichever copy read it.
  watchMoves(cx) {
    const answer = this.answer();
    if (!answer || answer === this.seenAnswer) return;
    this.seenAnswer = answer;
    const key = answer.project?.key;
    if (key && key === this.seenKey) this.noticeMoves(cx, answer);
    this.seenKey = key;
    this.lastStates = new Map((answer.notes ?? []).map((note) => [note.id, note.state]));
  }

  noticeMoves(cx, answer) {
    for (const note of answer.notes ?? []) {
      const was = this.lastStates?.get(note.id);
      if (was !== "open" || note.state !== "to verify" || Date.now() < (this.mine?.get(note.id) ?? 0)) continue;
      const editing = this.expanded?.has(note.id) ? " Your view of it is kept." : "";
      this.say(cx, `Note ${note.number} moved to To verify: ${note.solved?.by === "you" ? "you" : "an agent"} claimed it solved on ${note.solved?.branch ?? "a branch"}.${editing}`);
    }
  }

  say(cx, text) {
    this.notice = text;
    const shown = text;
    cx.spawn(async (cx) => {
      await sleep(cx, NOTICE_MS);
      if (this.notice === shown) this.notice = null;
      cx.notify();
    });
  }

  // ---- the button ----

  initButton(cx) {
    setShared(LIVE, this.copy);
    this.wiggleUntil = 0;
    if (checking()) return;
    // The button takes no keys: pane.go, which may land on it, moves on below it.
    cx.spawn(async () => {
      for (;;) if ((await nextCommand()) === "focus") run("pane.go", { direction: "down" });
    });
    cx.timer.every(CHANGES_MS, (cx) => {
      if (window()?.visible === false) return;
      this.read(cx, true);
      this.pruneOnceADay(cx);
    });
    cx.spawn(async (cx) => this.watchBox(cx));
  }

  // Reads again whenever an agent drops or claims a note in the focused project's folder.
  async watchBox(cx) {
    for (;;) {
      const project = this.answer()?.project;
      const dir = project ? (project.exists ? project.dir : project.notes) : null;
      if (!dir) {
        await sleep(cx, 2000);
        continue;
      }
      this.watch = watchFolder(dir);
      const changed = await this.watch.catch(() => []);
      const still = this.answer()?.project;
      if (changed.length && still && (still.exists ? still.dir : still.notes) === dir) this.read(cx, false);
      else await sleep(cx, 500);
    }
  }

  pruneOnceADay(cx) {
    const answer = this.answer();
    if (!answer?.project) return;
    const key = `prune:${answer.project.key}`;
    let last = 0;
    try {
      last = Number(localStorage.getItem(key) ?? 0);
    } catch (error) {
      console.log(`suggestion box: no localStorage, pruning anyway: ${error}`);
    }
    if (Date.now() - last < DAY_MS) return;
    cx.spawn(async () => {
      try {
        await box(this.node, this.boxJs, ["prune", this.here().folder]);
        localStorage.setItem(key, String(Date.now()));
      } catch (error) {
        console.log(`suggestion box: prune failed: ${error.message}`);
      }
    });
  }

  // Whichever right-hand panel opened last stays: the panel keys are plain toggles, so the rule
  // watches the layout, whatever key or button opened what. Only the newest button copy acts.
  keepOnePanel(cx) {
    const now = Object.fromEntries([BLOCK, ...OTHERS].map((id) => [id, isShown(id)]));
    const before = this.shownBefore ?? now;
    this.shownBefore = now;
    if (shared(LIVE) !== this.copy) return;
    const opened = Object.keys(now).filter((id) => now[id] && !before[id]);
    if (!opened.length) return;
    const hide = opened.includes(BLOCK) ? OTHERS.filter((id) => now[id]) : now[BLOCK] ? [BLOCK] : [];
    if (hide.length) cx.spawn(async () => hide.forEach((id) => run("layout.hide", { id })));
    if (opened.includes(BLOCK)) this.read(cx, true);
  }

  renderButton(cx, t) {
    this.keepOnePanel(cx);
    const here = this.here();
    if (here.folder !== this.folder) {
      this.folder = here.folder;
      this.watch?.cancel();
      this.read(cx, true);
    }
    const answer = this.answer();
    const hasPanel = Boolean(find(layout(), BLOCK));
    const why = !hasPanel ? "Add the box's panel with ./install.sh"
      : here.none ?? (answer && !answer.project ? "No git repo in this space, so there is no box here."
      : answer && !answer.collecting?.project ? `Suggestion box (⌥⌘S): collecting is off for ${answer.project.name}` : "Suggestion box (⌥⌘S)");
    return button({
      t,
      counts: answer?.counts,
      isOn: isShown(BLOCK),
      isOff: Boolean(answer?.project && !answer.collecting?.project),
      isDim: Boolean(here.none) || Boolean(answer && !answer.project),
      why,
      isWiggling: Date.now() < this.wiggleUntil,
      onToggle: () => (hasPanel ? run("layout.toggle", { id: BLOCK }) : notify({ title: "Suggestion box", body: "Add the box's panel with ./install.sh in the suggestion-box checkout.", level: "info" })),
    });
  }

  // ---- the panel ----

  initPanel(cx) {
    this.view = "list";
    this.expanded = new Set();
    // Notes the person just acted on, until when: their own move is no news.
    this.mine = new Map();
    // Writes go one after another, so an Undo never overtakes its Bin.
    this.queue = Promise.resolve();
    this.selected = null;
    this.undo = null;
    this.showSettings = false;
    this.handle = cx.focus_handle();
    if (checking()) return;
    cx.spawn(async (cx) => {
      for (;;) {
        if ((await nextCommand()) === "focus") this.handle.focus();
        cx.notify();
      }
    });
  }

  // The notes in the order the panel shows them: to verify, then open.
  ordered() {
    const notes = this.answer()?.notes ?? [];
    return [...notes.filter((n) => n.state === "to verify"), ...notes.filter((n) => n.state === "open")];
  }

  async act(name, note, cx) {
    const where = this.here().folder;
    if (name === "close") return this.close();
    if (name === "settings") this.showSettings = !this.showSettings;
    if (name === "history") this.view = this.view === "history" ? "list" : "history";
    if (name === "expand") this.toggleExpanded(note);
    if (name === "open-file") return this.openFile(note);
    if (name === "jump") return this.jump(note);
    if (name === "collect") return this.write(cx, ["collecting", where, this.answer()?.collecting?.project ? "off" : "on"]);
    if (name === "collect-all") return this.write(cx, ["collecting", where, this.answer()?.collecting?.all ? "off" : "on", "--all"]);
    if (name === "undo") return this.unbin(cx);
    if (["bin", "restore", "mark-solved", "confirm", "not-solved", "reopen"].includes(name)) return this.change(cx, name, note);
    cx.notify();
  }

  toggleExpanded(note) {
    this.selected = note.id;
    if (this.expanded.has(note.id)) this.expanded.delete(note.id);
    else this.expanded.add(note.id);
  }

  change(cx, action, note) {
    const extra = action === "mark-solved" ? ["--branch", note.changed?.on ?? ""] : [];
    this.mine.set(note.id, Date.now() + 15000);
    if (action === "bin") this.showUndo(cx, note);
    return this.write(cx, ["act", this.here().folder, note.id, action, ...extra]);
  }

  showUndo(cx, note) {
    this.undo = { id: note.id, title: note.title };
    cx.spawn(async (cx) => {
      await sleep(cx, UNDO_MS);
      if (this.undo?.id === note.id) this.undo = null;
      cx.notify();
    });
  }

  unbin(cx) {
    const id = this.undo?.id;
    this.undo = null;
    if (!id) return cx.notify();
    return this.write(cx, ["act", this.here().folder, id, "restore"]);
  }

  // A write through box.js, after the ones before it, then a fresh read for every copy.
  write(cx, args) {
    if (!this.boxJs) return;
    const run = async () => {
      try {
        await box(this.node, this.boxJs, args);
        this.error = "";
      } catch (error) {
        this.error = error.message;
      }
    };
    this.queue = this.queue.then(run);
    const done = this.queue;
    cx.spawn(async (cx) => {
      await done;
      this.read(cx, false);
      cx.notify();
    });
    cx.notify();
  }

  close() {
    const pane = focused()?.pane;
    run("layout.hide", { id: BLOCK });
    if (pane) run("pane.focus", { pane });
  }

  // The note's file at its line: in the ticket's worktree while it is there, else in the checkout.
  async openFile(note) {
    const places = [note.from?.worktree, note.from?.checkout].filter(Boolean).map((dir) => `${dir}/${note.at.path}`);
    for (const file of places) {
      const there = await exec("test", ["-e", file]).catch(() => ({ code: 1 }));
      if (there.code !== 0) continue;
      const target = note.at.line ? `${file}:${note.at.line}` : file;
      for (const editor of EDITORS) {
        const opened = await exec(editor, ["-g", target]).catch(() => null);
        if (opened?.code === 0) return;
      }
      await exec("open", [file]).catch((error) => notify({ title: "Suggestion box", body: `${file} did not open: ${error}`, level: "error" }));
      return;
    }
    notify({ title: "Suggestion box", body: `${note.at.path} is not in the worktree or the checkout any more.`, level: "info" });
  }

  // The tab that dropped the note while it is open, else the ticket on GitHub.
  jump(note) {
    const id = note.from?.terminal;
    const terminal = id && terminals().find((one) => one.address === id || one.id === id);
    if (terminal) return run("pane.focus", { terminal: terminal.address ?? id });
    const key = this.answer()?.project?.key ?? "";
    if (!key.startsWith("github.com/") || !note.from?.ticket) return;
    const url = `https://${key}/issues/${note.from.ticket}`;
    exec(window()?.platform === "macos" ? "open" : "xdg-open", [url]).catch((error) => notify({ title: "Suggestion box", body: `${url} did not open: ${error}`, level: "error" }));
  }

  onKey(e, cx) {
    const m = e.modifiers ?? {};
    if (m.platform || m.control || m.alt) return;
    const notes = this.ordered();
    const at = notes.findIndex((n) => n.id === this.selected);
    const note = notes[at] ?? null;
    const k = e.key;
    const can = (action) => note?.actions.includes(action);
    if (k === "down" || k === "up") this.selected = notes[Math.max(0, Math.min(notes.length - 1, at + (k === "down" ? 1 : -1)))]?.id ?? null;
    else if (k === "enter" && note) this.toggleExpanded(note);
    else if (k === "s" && can("mark-solved")) this.act("mark-solved", note, cx);
    else if (k === "x" && can("bin")) this.act("bin", note, cx);
    else if (k === "u" && this.undo) this.act("undo", null, cx);
    else if (k === "c" && can("confirm")) this.act("confirm", note, cx);
    else if (k === "n" && can("not-solved")) this.act("not-solved", note, cx);
    else if (k === "escape" && this.view === "history") this.view = "list";
    else if (k === "escape") this.close();
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  renderPanel(cx, t) {
    const here = this.here();
    this.watchMoves(cx);
    const key = this.answer()?.project?.key ?? here.none ?? null;
    if (key !== this.panelKey) {
      this.panelKey = key;
      this.expanded.clear();
      this.selected = null;
    }
    const state = {
      t,
      answer: this.answer(),
      view: this.view,
      expanded: this.expanded,
      selected: this.selected,
      undo: this.undo,
      notice: this.notice,
      error: this.error,
      showSettings: this.showSettings,
      collecting: this.answer()?.collecting ?? null,
      noProject: here.none,
      act: (name, note, cx) => this.act(name, note, cx),
    };
    return panel(state).id("suggestion-box").track_focus(this.handle)
      .on_key_down((e, cx) => this.onKey(e, cx))
      .on_mouse_down("left", () => this.handle.focus());
  }

  render(cx) {
    const t = theme();
    return this.isButton ? this.renderButton(cx, t) : this.renderPanel(cx, t);
  }
}
