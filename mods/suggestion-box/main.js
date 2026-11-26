// The suggestion box in the Herdr app. With props {button: true} it is the tab bar's button: it reads
// the focused space's box, keeps one right-hand panel at a time, and wiggles when a note arrives.
// Without, it is the panel on the right: the box's notes by state, with the actions their state
// allows. Every read and write goes through cli/box.js in the checkout this mod links to; this file
// only keeps state, and panel.js draws.
import { View } from "gpui-kit";
import { InputState, TextareaState } from "gpui-base";
import { appHome, checking, exec, focused, layout, nextCommand, notify, props, run, setShared, settings, shared, spaces, terminals, theme, watchFolder, window } from "herdr";
import { checkedText, fieldLabel, offReason, scanTexts, startTexts, swapText, targetLine } from "./editor.js";
import { issueText } from "./issue.js";
import { SECTIONS } from "./notes.js";
import { button, panel } from "./panel.js";
import { buttonsFor, isWatched } from "./rules.js";

// A filed note whose issue may still close, or open again: the watch looks for that too.
const hasOpenIssue = (note) => note.state === "filed" && Boolean(note.issue);

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
// The check fetches (20 s at most), takes two snapshots (45 s each at most), finds claude (10 s)
// and waits up to 90 s on Claude: 210 s, with room to spare.
const CHECK_MS = 240000;
// A lookup runs up to eight gh calls and a filing up to fourteen, each stopped after 20 s (GH_MS in
// cli/file.js). A filing the panel gives up on is found again by the next Create issue.
const FILE_MS = 330000;
// Fix in new tab: issues branch (60 s at most), then issues launch (240 s at most).
const FIX_MS = 330000;
const LOOKUP_MS = 200000;
const SHOWN_MS = 1000;
// A fetch (20 s at most) and, per claim, git and gh for its PR (20 s at most).
const PROOFS_MS = 90000;
// Confirmed fixes are looked at again this often until they land.
const WATCH_MS = 300000;
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
async function box(node, path, args, timeout = 60000) {
  const result = await exec(node, [path, ...args], { timeout });
  let answer;
  try {
    answer = JSON.parse(result.stdout);
  } catch {
    throw new Error((result.stderr || result.stdout).trim().split("\n").pop() || `box.js stopped with code ${result.code}`);
  }
  if (answer.error) throw new Error(answer.error);
  return answer;
}

// What a button is called, for the line that says it failed.
const LABEL_OF = { file: "File issue", check: "Check", bin: "Bin", "mark-solved": "Mark solved", confirm: "Confirm solved", "not-solved": "Not solved", reopen: "Reopen", restore: "Restore", fix: "Fix in new tab", "editor-create": "Create issue", "editor-copy": "Copy issue" };

// Why a claim is not solved, kept on the note: what the independent check found, else the person's say.
function notSolvedReason(note) {
  const verify = note.verify;
  if (verify && !verify.error && verify.verdict !== "verified") return verify.why;
  return "You said it is not solved.";
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
    return folder ? { folder, space: space.id } : { none: "This space has no folder." };
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
        setShared(DATA, { folder: here.folder, space: here.space, answer });
        if (!this.isButton) this.syncEditor(answer);
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

  // The last read of the focused space's box. While a mod has the keyboard (the panel itself, when
  // you click in it) no terminal says which folder this is, and each copy of the box remembers its
  // own last one: the space's last read still holds then.
  answer() {
    const data = shared(DATA);
    if (!data) return null;
    const here = this.here();
    if (data.folder === here.folder) return data.answer;
    return data.space && data.space === here.space && !focused()?.terminal ? data.answer : null;
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
      const editing = this.editor?.id === note.id ? " Your draft is kept." : this.expanded?.has(note.id) ? " Your view of it is kept." : "";
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
      this.watchFixes(cx);
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

  // Confirmed fixes not landed yet: every few minutes, did they land, or never will?
  watchFixes(cx) {
    const answer = this.answer();
    const history = answer?.history ?? [];
    if (!answer?.project || !history.some((note) => isWatched(note) || hasOpenIssue(note)) || Date.now() - (this.watchedAt ?? 0) < WATCH_MS) return;
    this.watchedAt = Date.now();
    const folder = this.here().folder;
    // One question per repo about its filed issues, a fetch, then per watched fix gh and git
    // ls-remote, each 20 s at most.
    const repos = new Set(history.filter(hasOpenIssue).map((note) => note.issue.repo)).size;
    const timeout = PROOFS_MS + repos * 25000 + history.filter(isWatched).length * 45000;
    cx.spawn(async (cx) => {
      try {
        const result = await box(this.node, this.boxJs, ["watch", folder], timeout);
        if (result.watched || result.closed) this.read(cx, false);
      } catch (error) {
        console.log(`suggestion box: watching fixes failed: ${error.message}`);
      }
    });
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
    this.checking = new Set();
    // The settings view's projects, each with its switch, read when the view opens.
    this.projects = null;
    // The note being filed, with its fields; one at a time.
    this.editor = null;
    // Proofs 1 and 3 of each claim opened since the panel showed, and the claims Claude is checking.
    this.proofs = new Map();
    this.verifying = new Set();
    // Notes whose fix is starting in a new tab.
    this.fixing = new Set();
    // Notes filed while the panel is open: they stay in sight until it closes.
    this.justFiled = new Set();
    this.handle = cx.focus_handle();
    if (checking()) return;
    cx.spawn(async (cx) => {
      for (;;) {
        if ((await nextCommand()) === "focus") this.handle.focus();
        cx.notify();
      }
    });
    // Hiding the panel does not close this copy: when it goes, the draft is kept in the note and
    // what was just filed moves to the history.
    cx.timer.every(SHOWN_MS, (cx) => {
      const shown = isShown(BLOCK);
      if (this.wasShown && !shown) {
        this.closeEditor(cx);
        this.justFiled.clear();
        this.proofs.clear();
        cx.notify();
      }
      this.wasShown = shown;
    });
  }

  // The notes in the order the panel shows them: to verify, then open.
  ordered() {
    const notes = this.answer()?.notes ?? [];
    return [...notes.filter((n) => n.state === "to verify"), ...notes.filter((n) => n.state === "open")];
  }

  // A button that fails says so in the panel, never nothing at all.
  async act(name, note, cx) {
    try {
      return await this.actOn(name, note, cx);
    } catch (error) {
      console.log(`suggestion box: ${name} failed: ${error?.stack ?? error}`);
      this.error = `${LABEL_OF[name] ?? name} did not work: ${error?.message ?? error}`;
      cx.notify();
    }
  }

  async actOn(name, note, cx) {
    const where = this.here().folder;
    if (name === "close") return this.close();
    if (name === "settings") {
      this.view = this.view === "settings" ? "list" : "settings";
      if (this.view === "settings") this.loadProjects(cx);
    }
    if (name === "history") this.view = this.view === "list" ? "history" : "list";
    if (name === "expand") this.toggleExpanded(note, cx);
    if (name === "verify-again") return this.verifyClaim(cx, note, { again: true });
    if (name === "open-at") return this.openAt(note);
    if (name === "fix") return this.startFix(cx, note);
    if (name === "jump-fix") return this.jumpToFix(note);
    if (name === "open-file") return this.openFile(note);
    if (name === "jump") return this.jump(note);
    if (name === "collect") return this.write(cx, ["collecting", where, this.answer()?.collecting?.project ? "off" : "on"]);
    if (name === "collect-all") return this.write(cx, ["collecting", where, this.projects?.all ?? this.answer()?.collecting?.all ? "off" : "on", "--all"], (cx) => this.loadProjects(cx));
    if (name === "collect-project") return this.write(cx, ["collecting", where, note.isOn ? "off" : "on", "--key", note.key], (cx) => this.loadProjects(cx));
    if (name === "undo") return this.unbin(cx);
    if (name === "check") return this.check(cx, note);
    if (name === "file") return this.openEditor(cx, note);
    if (name === "open-url") return this.openUrl(note);
    if (name === "copy") return this.copyCloses(cx, note);
    if (name === "board") return this.write(cx, ["board", where, note.id]);
    if (name.startsWith("editor-")) return this.editorAct(cx, name.slice(7), note);
    if (name === "mark-solved-gone") {
      this.closeEditor(cx);
      return this.change(cx, "mark-solved", note, note.check?.gone?.on);
    }
    if (["bin", "restore", "mark-solved", "confirm", "not-solved", "reopen"].includes(name)) {
      if (this.editor?.id === note.id) this.closeEditor(cx);
      return this.change(cx, name, note);
    }
    cx.notify();
  }

  toggleExpanded(note, cx) {
    this.selected = note.id;
    if (this.expanded.has(note.id)) return this.expanded.delete(note.id);
    this.expanded.add(note.id);
    // A claim opened: its proofs, and Claude's independent check of it (kept while it holds).
    if (note.state === "to verify") {
      this.loadProofs(cx, note);
      this.verifyClaim(cx, note);
    }
  }

  loadProofs(cx, note) {
    if (!this.boxJs || this.proofs.get(note.id)?.isLoading) return;
    if (this.proofs.has(note.id) && !this.proofs.get(note.id).error) return;
    this.proofs.set(note.id, { isLoading: true });
    const folder = this.here().folder;
    cx.spawn(async (cx) => {
      try {
        const answer = await box(this.node, this.boxJs, ["proofs", folder, note.id], PROOFS_MS);
        this.proofs.set(note.id, { change: answer.change, landed: answer.landed });
      } catch (error) {
        this.proofs.set(note.id, { error: error.message });
      }
      cx.notify();
    });
  }

  // Proof 2 beside the queued writes, like the check: a Confirm meanwhile wins, and it is dropped.
  verifyClaim(cx, note, { again = false } = {}) {
    if (!this.boxJs || this.verifying.has(note.id)) return;
    this.verifying.add(note.id);
    const folder = this.here().folder;
    cx.spawn(async (cx) => {
      try {
        await box(this.node, this.boxJs, ["verify", folder, note.id, ...(again ? ["--again"] : [])], CHECK_MS);
      } catch (error) {
        this.error = `The independent check did not finish: ${error.message}`;
      }
      this.verifying.delete(note.id);
      this.read(cx, false);
      cx.notify();
    });
    cx.notify();
  }

  // Fix in new tab: the ticket starts in this space through the parallel-tickets launcher, and the
  // box stays where it is.
  startFix(cx, note) {
    const space = this.spaceId();
    if (!this.boxJs || this.fixing.has(note.id) || !space) return;
    this.fixing.add(note.id);
    this.mine.set(note.id, Date.now() + 15000);
    const folder = this.here().folder;
    cx.spawn(async (cx) => {
      try {
        const answer = await box(this.node, this.boxJs, ["fix", folder, note.id, space], FIX_MS);
        this.error = "";
        this.say(cx, `Fixing note ${note.number} in ${answer.branch}: its tab is open in this space.`);
      } catch (error) {
        this.error = `Fix in new tab did not start for note ${note.number}: ${error.message}`;
      }
      this.fixing.delete(note.id);
      this.read(cx, false);
      cx.notify();
    });
    cx.notify();
  }

  spaceId() {
    const at = focused();
    return (spaces().find((one) => one.id === at?.space) ?? spaces().find((one) => one.active))?.id ?? null;
  }

  // The tab the fix runs in, while it is open.
  jumpToFix(note) {
    const id = note.fix?.pane;
    const terminal = id && terminals().find((one) => one.address === id || one.id === id);
    if (terminal) return run("pane.focus", { terminal: terminal.address ?? id });
    notify({ title: "Suggestion box", body: `The tab of ${note.fix?.branch} is closed.`, level: "info" });
  }

  // The note's file as the solving commit has it, in the editor at the note's line there.
  async openAt({ sha, path, line }) {
    try {
      const shown = await box(this.node, this.boxJs, ["show", this.here().folder, sha, path, String(line ?? "")]);
      const target = shown.line ? `${shown.file}:${shown.line}` : shown.file;
      for (const editor of EDITORS) {
        const opened = await exec(editor, ["-g", target]).catch(() => null);
        if (opened?.code === 0) return;
      }
      await exec("open", [shown.file]);
    } catch (error) {
      notify({ title: "Suggestion box", body: `${path} at ${sha.slice(0, 7)} did not open: ${error.message}`, level: "error" });
    }
  }

  change(cx, action, note, branch = note.changed?.on) {
    const extra = action === "mark-solved" ? ["--branch", branch ?? ""] : action === "not-solved" ? ["--reason", notSolvedReason(note)] : [];
    this.mine.set(note.id, Date.now() + 15000);
    if (action === "bin") this.showUndo(cx, note);
    return this.write(cx, ["act", this.here().folder, note.id, action, ...extra]);
  }

  // The check runs beside the queued writes: it can take a minute and a half, and a Bin meanwhile
  // wins (the check is then dropped, as box.js writes it only over the note it read). The editor
  // reuses a check that still holds; the Check button always runs it again.
  check(cx, note, { reuse = false } = {}) {
    if (!this.boxJs || this.checking.has(note.id)) return;
    this.checking.add(note.id);
    this.expanded.add(note.id);
    this.selected = note.id;
    const folder = this.here().folder;
    cx.spawn(async (cx) => {
      let ran = true;
      try {
        const answer = await box(this.node, this.boxJs, ["check", folder, note.id, ...(note.check && !reuse ? ["--again"] : [])], CHECK_MS);
        ran = !answer.reused;
        this.error = "";
      } catch (error) {
        this.error = `The check did not finish: ${error.message}`;
      }
      this.checking.delete(note.id);
      this.read(cx, false);
      // The check fetched origin: where the issue goes is read again from the fresh config.
      if (ran && this.editor?.id === note.id) this.lookUp(cx);
      cx.notify();
    });
    cx.notify();
  }

  // ---- filing ----

  // File issue: the note becomes an editor in place, its check runs (or is reused) and where the
  // issue would go is looked up meanwhile.
  openEditor(cx, note) {
    if (!this.boxJs || note.state !== "open") return;
    if (this.editor?.id === note.id) return this.editor.fields.title.focus();
    this.closeEditor(cx);
    const texts = startTexts(note);
    const editor = { id: note.id, number: note.number, title: note.title, folder: this.here().folder, project: this.answer()?.project?.key ?? null, typing: null, target: null, similar: [], link: null, error: "", isFiling: false };
    editor.auto = Object.fromEntries(SECTIONS.map((name) => [name, checkedText(note, name)]));
    editor.fine = new Set(note.draft?.fine ?? []);
    editor.notGone = note.draft?.notGone ?? null;
    editor.saved = JSON.stringify(note.draft ?? null);
    editor.seenCheck = JSON.stringify(note.check ?? null);
    editor.fields = { title: this.field(editor, "title", texts.title) };
    for (const name of SECTIONS) editor.fields[name] = this.field(editor, name, texts.sections[name]);
    if (editor.notGone) editor.reason = this.reasonField(editor, editor.notGone.reason);
    this.editor = editor;
    this.expanded.add(note.id);
    this.selected = note.id;
    this.check(cx, note, { reuse: true });
    this.lookUp(cx);
    editor.fields.title.focus();
    cx.notify();
  }

  field(editor, name, value) {
    const state = name === "title" ? InputState.new({ value }) : TextareaState.new({ value });
    if (name !== "title") state.set_auto_grow(2, 10);
    state.on("change", (_e, cx) => cx.notify());
    state.on("focus", (_e, cx) => {
      editor.typing = name;
      cx.notify();
    });
    state.on("blur", (_e, cx) => {
      if (editor.typing === name) editor.typing = null;
      if (this.editor === editor) this.saveDraft(cx);
      cx.notify();
    });
    return state;
  }

  reasonField(editor, value = "") {
    const state = InputState.new({ placeholder: "Why it is not solved (kept with the note)", value });
    state.on("change", (_e, cx) => {
      editor.notGone = { reason: state.value() };
      cx.notify();
    });
    state.on("focus", () => (editor.typing = "reason"));
    state.on("blur", (_e, cx) => {
      if (editor.typing === "reason") editor.typing = null;
      if (this.editor === editor) this.saveDraft(cx);
    });
    return state;
  }

  textsOf(editor) {
    const value = (name) => editor.fields[name].value();
    return { title: value("title"), sections: Object.fromEntries(SECTIONS.map((name) => [name, value(name)])) };
  }

  // The draft as the note keeps it: null while the fields hold what the check put there.
  draftOf(editor) {
    const texts = this.textsOf(editor);
    const untouched = texts.title === editor.title && SECTIONS.every((name) => texts.sections[name] === editor.auto[name]);
    if (untouched && !editor.fine.size && !editor.notGone) return null;
    return { ...texts, fine: [...editor.fine], notGone: editor.notGone };
  }

  saveDraft(cx) {
    const editor = this.editor;
    if (!editor || editor.isFiling) return;
    const draft = this.draftOf(editor);
    const text = JSON.stringify(draft);
    if (text === editor.saved) return;
    editor.saved = text;
    this.write(cx, ["draft", editor.folder, editor.id, text]);
  }

  // Cancel, a closed panel or another project: the draft is kept, and the fields are let go.
  closeEditor(cx, { save = true } = {}) {
    const editor = this.editor;
    if (!editor) return;
    if (save) this.saveDraft(cx);
    this.editor = null;
    for (const state of [...Object.values(editor.fields), editor.reason].filter(Boolean)) state.release();
    // The keyboard was in a field that is gone: it goes to the panel, if the panel is still there.
    if (editor.typing && isShown(BLOCK)) this.handle.focus();
  }

  // Where the issue goes, similar open issues and the code link, for the editor that asked.
  lookUp(cx) {
    const editor = this.editor;
    if (!editor) return;
    cx.spawn(async (cx) => {
      try {
        const answer = await box(this.node, this.boxJs, ["target", editor.folder, editor.id], LOOKUP_MS);
        Object.assign(editor, { target: answer.target, similar: answer.similar, link: answer.link });
      } catch (error) {
        editor.target = { kind: "github", why: `Could not look up where it goes: ${error.message}` };
      }
      cx.notify();
    });
  }

  // A newer read of the note: a check that came in puts its texts in the fields nobody changed.
  syncEditor(answer) {
    const editor = this.editor;
    const note = (answer.notes ?? []).find((one) => one.id === editor?.id);
    if (!note || JSON.stringify(note.check ?? null) === editor.seenCheck) return;
    editor.seenCheck = JSON.stringify(note.check ?? null);
    for (const name of SECTIONS) {
      if (editor.fields[name].value() !== editor.auto[name]) continue;
      editor.auto[name] = checkedText(note, name);
      editor.fields[name].set_value(editor.auto[name]);
    }
  }

  editorAct(cx, name, note) {
    const editor = this.editor;
    if (!editor) return;
    if (name === "cancel") this.closeEditor(cx);
    if (name === "create") return this.create(cx);
    if (name === "copy") return this.copyIssue(cx);
    if (name === "fine") editor.fine.add(note.hit);
    if (name === "not-gone") {
      editor.reason ??= this.reasonField(editor);
      editor.notGone = { reason: editor.reason.value() };
      editor.reason.focus();
    }
    if (name === "take-back") editor.notGone = null;
    if (name === "swap") editor.fields[note.section].set_value(swapText(this.noteById(editor.id), note.section, note.to));
    if (name === "start-over") this.startOver(editor);
    if (["fine", "take-back", "swap", "start-over"].includes(name)) this.saveDraft(cx);
    cx.notify();
  }

  startOver(editor) {
    const note = this.noteById(editor.id);
    if (!note) return;
    editor.title = note.title;
    editor.fields.title.set_value(note.title);
    for (const name of SECTIONS) {
      editor.auto[name] = checkedText(note, name);
      editor.fields[name].set_value(editor.auto[name]);
    }
    editor.fine.clear();
    editor.notGone = null;
  }

  noteById(id) {
    const answer = this.answer();
    return [...(answer?.notes ?? []), ...(answer?.history ?? [])].find((note) => note.id === id) ?? null;
  }

  // Why Create issue is off for the open editor, or null.
  offFor(editor) {
    const note = this.noteById(editor.id);
    if (!note) return "The note is gone";
    const texts = this.textsOf(editor);
    return offReason({ note, texts, target: editor.target, isChecking: this.checking.has(editor.id), isFiling: editor.isFiling, notGone: editor.notGone, fine: [...editor.fine] });
  }

  // Create issue: after the writes before it, so the draft it files is the one on disk too.
  create(cx) {
    const editor = this.editor;
    if (!editor || this.offFor(editor)) return cx.notify();
    const value = { ...this.textsOf(editor), fine: [...editor.fine], notGone: editor.notGone, repo: editor.target.repo };
    editor.isFiling = true;
    editor.error = "";
    this.mine.set(editor.id, Date.now() + 15000);
    const send = () => box(this.node, this.boxJs, ["file", editor.folder, editor.id, JSON.stringify(value)], FILE_MS).then((answer) => ({ answer }), (error) => ({ error }));
    this.queue = this.queue.then(send);
    const done = this.queue;
    cx.spawn(async (cx) => {
      const { answer, error } = await done;
      editor.isFiling = false;
      if (error) this.filingFailed(cx, editor, value, error);
      else {
        // Closed meanwhile, the panel has moved what it filed to the history already.
        if (isShown(BLOCK)) this.justFiled.add(editor.id);
        if (this.editor === editor) this.closeEditor(cx, { save: false });
        const board = answer.board?.error ? `; not on the board: ${answer.board.error}` : "";
        this.say(cx, answer.warning ?? `Filed #${answer.issue.number}${board}.`);
      }
      this.read(cx, false);
      cx.notify();
    });
    cx.notify();
  }

  // A filing that failed says so where the person looks: in its editor while that is open, else on
  // the panel. The editor that is gone could not keep its draft while it filed, so it is kept now.
  filingFailed(cx, editor, value, error) {
    if (this.editor === editor) {
      editor.error = error.message;
      return;
    }
    this.error = `Note ${editor.number} was not filed: ${error.message}`;
    const draft = { title: value.title, sections: value.sections, fine: value.fine, notGone: value.notGone };
    // Not through write(): its success would clear the error just shown.
    const keep = () => box(this.node, this.boxJs, ["draft", editor.folder, editor.id, JSON.stringify(draft)]).catch((failed) => console.log(`suggestion box: the draft of note ${editor.number} was not kept: ${failed.message}`));
    this.queue = this.queue.then(keep);
  }

  // Copy issue, for a tracker outside GitHub: the title and the issue text on the clipboard.
  copyIssue(cx) {
    const editor = this.editor;
    const note = editor && this.noteById(editor.id);
    if (!note || this.offFor(editor)) return cx.notify();
    const texts = this.textsOf(editor);
    cx.write_to_clipboard(`${texts.title.trim()}\n\n${issueText(texts, { link: editor.link, ticket: note.from?.ticket ?? null })}`);
    this.say(cx, `Copied note ${note.number} as an issue. Paste it in ${editor.target.kind}, then bin the note.`);
    cx.notify();
  }

  copyCloses(cx, note) {
    cx.write_to_clipboard(note.issue?.closes ?? "");
    this.say(cx, `Copied "${note.issue?.closes}": put it in the fix's PR so the issue closes with it.`);
    cx.notify();
  }

  openUrl(note) {
    const url = note.url ?? note.issue?.url;
    if (!url) return;
    exec(window()?.platform === "macos" ? "open" : "xdg-open", [url]).catch((error) => notify({ title: "Suggestion box", body: `${url} did not open: ${error}`, level: "error" }));
  }

  // What the panel draws of the open editor.
  editorView() {
    const editor = this.editor;
    const note = editor && this.noteById(editor.id);
    if (!note) return null;
    const isChecking = this.checking.has(editor.id);
    const texts = this.textsOf(editor);
    const labels = Object.fromEntries(SECTIONS.map((name) => [name, fieldLabel(note, name, texts.sections[name], { isChecking })]));
    const hits = scanTexts(texts).map((hit) => ({ ...hit, isFine: editor.fine.has(hit.text) }));
    const draft = this.draftOf(editor);
    return {
      id: editor.id, fields: editor.fields, reason: editor.reason, texts, labels, hits, isChecking,
      target: editor.target, line: targetLine(editor.target), similar: editor.similar,
      off: this.offFor(editor), error: editor.error, isFiling: editor.isFiling, notGone: editor.notGone,
      gone: isChecking ? null : note.check?.gone ?? null, checkError: isChecking ? null : note.check?.error ?? null,
      canCopy: Boolean(editor.target && editor.target.kind !== "github"), canStartOver: Boolean(draft),
    };
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

  // The projects of the open spaces and every project with notes, each with its switch.
  loadProjects(cx) {
    const here = this.here();
    if (!this.boxJs || !here.folder) return;
    const folders = spaces().filter((space) => !space.machine && space.folder).map((space) => space.folder);
    cx.spawn(async (cx) => {
      try {
        this.projects = await box(this.node, this.boxJs, ["projects", here.folder, ...folders]);
      } catch (error) {
        this.projects = { error: error.message };
      }
      cx.notify();
    });
  }

  // A write through box.js, after the ones before it, then a fresh read for every copy, and `after`.
  write(cx, args, after = null) {
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
      after?.(cx);
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
    // Keys typed into the editor's fields are theirs; esc leaves the field.
    if (this.editor?.typing) {
      if (e.key !== "escape") return;
      this.handle.focus();
      cx.stop_propagation();
      return cx.notify();
    }
    const m = e.modifiers ?? {};
    if (m.platform || m.control || m.alt) return;
    const notes = this.ordered();
    const at = notes.findIndex((n) => n.id === this.selected);
    const note = notes[at] ?? null;
    const k = e.key;
    const can = (action) => note?.actions.includes(action);
    if (k === "down" || k === "up") this.selected = notes[Math.max(0, Math.min(notes.length - 1, at + (k === "down" ? 1 : -1)))]?.id ?? null;
    else if (k === "enter" && note) this.toggleExpanded(note, cx);
    else if (k === "s" && can("mark-solved")) this.act("mark-solved", note, cx);
    else if (k === "x" && can("bin")) this.act("bin", note, cx);
    else if (k === "k" && can("check")) this.act("check", note, cx);
    else if (k === "f" && can("file")) this.act("file", note, cx);
    else if (k === "u" && this.undo) this.act("undo", null, cx);
    else if (k === "c" && can("confirm")) this.act("confirm", note, cx);
    else if (k === "n" && can("not-solved")) this.act("not-solved", note, cx);
    else if (k === "escape" && this.editor) this.closeEditor(cx);
    else if (k === "escape" && this.view !== "list") this.view = "list";
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
      this.justFiled.clear();
      this.proofs.clear();
    }
    // The note being filed left Open (claimed, binned) or you went to another project: the editor
    // closes, and its draft stays in the note. A read that is missing for a moment closes nothing.
    const shownKey = this.answer()?.project?.key ?? null;
    const editing = this.editor && this.noteById(this.editor.id);
    const hasLeft = this.editor && ((editing && editing.state !== "open") || (shownKey && this.editor.project && shownKey !== this.editor.project));
    if (this.editor && !this.editor.isFiling && hasLeft) {
      cx.spawn(async (cx) => {
        this.closeEditor(cx);
        cx.notify();
      });
    }
    const state = {
      t,
      answer: this.answer(),
      view: this.view,
      expanded: this.expanded,
      selected: this.selected,
      undo: this.undo,
      checking: this.checking,
      editor: this.editorView(),
      proofs: this.proofs,
      verifying: this.verifying,
      fixing: this.fixing,
      mono: settings()?.font || "Menlo",
      justFiled: this.justFiled,
      notice: this.notice,
      error: this.error,
      projects: this.projects,
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
