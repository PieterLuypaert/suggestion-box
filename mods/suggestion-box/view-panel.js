// The panel: its state, what a click or a key does, the writes through box.js, and its draw.
import { checking, exec, focused, nextCommand, notify, run, settings, spaces, terminals } from "herdr";
import { panel } from "./panel.js";
import { JustFiled } from "./just-filed.js";
import { FILTERS } from "./filters.js";
import { canConfirm, claimKey, PROOFS_REFRESH_MS } from "./proofs.js";
import { BLOCK, box, CHECK_MS, EDITORS, isShown, SHOWN_MS, sleep, UNDO_MS } from "./view-host.js";

// What a button is called, for the line that says it failed.
const LABEL_OF = { file: "File issue", check: "Check", bin: "Bin", "mark-solved": "Mark solved", confirm: "Confirm solved", "not-solved": "Not solved", reopen: "Reopen", restore: "Restore", fix: "Fix in new tab", "editor-create": "Create issue", "editor-copy": "Copy issue" };

// Why a claim is not solved, kept on the note: what the independent check found, else the person's say.
function notSolvedReason(note) {
  const verify = note.verify;
  if (verify && !verify.error && verify.verdict !== "verified") return verify.why;
  return "You said it is not solved.";
}

const FILTER_KEYS = ["1", "2", "3", "4"];
const AZERTY_KEYS = ["&", "é", "\"", "'"];

// The view's methods for this part, added to it in main.js.
export const panelCopy = {
  initPanel(cx) {
    this.view = "list";
    // The filter shown: now, filed, done or binned. Now each time the panel opens.
    this.filter = "now";
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
    // The claims whose independent check this panel asked for: once each while it is open.
    this.verifyAsked = new Set();
    // The claims Claude is checking right now; the others wait their turn.
    this.verifying = new Set();
    // The claims whose check did not finish (no answer kept): their card offers Check again.
    this.verifyFailed = new Set();
    // Notes whose fix is starting in a new tab.
    this.fixing = new Set();
    // Notes filed while the panel is open stay in sight until it closes (see just-filed.js).
    this.justFiled = new JustFiled();
    this.handle = cx.focus_handle();
    if (checking()) return;
    cx.spawn(async (cx) => {
      for (;;) {
        if ((await nextCommand()) === "focus") this.handle.focus();
        cx.notify();
      }
    });
    // Hiding the panel does not close this copy: when it goes, the draft is kept in the note and
    // what was just filed moves to Filed.
    cx.timer.every(SHOWN_MS, (cx) => {
      const shown = isShown(BLOCK);
      if (this.wasShown && !shown) {
        this.closeEditor(cx);
        this.filter = "now";
        this.justFiled.clear();
        this.proofs.clear();
        this.verifyAsked.clear();
        this.verifyFailed.clear();
        cx.notify();
      }
      this.wasShown = shown;
    });
    cx.timer.every(PROOFS_REFRESH_MS, (cx) => {
      if (isShown(BLOCK) && (this.answer()?.notes ?? []).some((note) => note.state === "to verify")) cx.notify();
    });
  },

  // The notes in the order the panel shows them: to verify, then open.
  ordered() {
    const notes = this.answer()?.notes ?? [];
    return [...notes.filter((n) => n.state === "to verify"), ...notes.filter((n) => n.state === "open")];
  },

  // A button that fails says so in the panel, never nothing at all.
  async act(name, note, cx) {
    try {
      return await this.actOn(name, note, cx);
    } catch (error) {
      console.log(`suggestion box: ${name} failed: ${error?.stack ?? error}`);
      this.error = `${LABEL_OF[name] ?? name} did not work: ${error?.message ?? error}`;
      cx.notify();
    }
  },

  async actOn(name, note, cx) {
    const where = this.shownFolder();
    if (name === "close") return this.close();
    if (name === "settings") {
      this.view = this.view === "settings" ? "list" : "settings";
      this.projects = null;
      if (this.view === "settings") this.loadProjects(cx);
    }
    if (name === "filter") {
      this.view = "list";
      this.filter = note;
    }
    // A row in Open: it becomes the card, with its buttons. A note being filed closes, its draft
    // kept, so one card shows at a time.
    if (name === "pick") {
      this.selected = note.id;
      if (this.editor && this.editor.id !== note.id) this.closeEditor(cx);
    }
    if (name === "expand") this.toggleExpanded(note, cx);
    if (name === "verify-again") return this.verifyClaim(cx, note, { again: true });
    if (name === "open-at") return this.openAt(note);
    if (name === "fix") return this.startFix(cx, note);
    if (name === "jump-fix") return this.jumpToFix(note);
    if (name === "open-file") return this.openFile(note);
    if (name === "jump") return this.jump(note);
    if (name === "collect") return this.write(cx, ["collecting", where, this.answer()?.collecting?.project ? "off" : "on"], (cx) => this.view === "settings" && this.loadProjects(cx));
    if (name === "collect-all") return this.write(cx, ["collecting", where, this.projects?.all ?? this.answer()?.collecting?.all ? "off" : "on", "--all"], (cx) => this.loadProjects(cx));
    if (name === "collect-project") return this.write(cx, ["collecting", where, note.isOn ? "off" : "on", "--key", note.key], (cx) => this.loadProjects(cx));
    if (name === "undo") return this.unbin(cx);
    if (name === "check") return this.check(cx, note);
    if (name === "file") {
      this.selected = note.id;
      return this.openEditor(cx, note);
    }
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
  },

  toggleExpanded(note, cx) {
    this.selected = note.id;
    if (this.expanded.has(note.id)) return this.expanded.delete(note.id);
    this.expanded.add(note.id);
  },

  change(cx, action, note, branch = note.changed?.on) {
    const extra = action === "mark-solved" ? ["--branch", branch ?? ""] : action === "not-solved" ? ["--reason", notSolvedReason(note)] : [];
    this.mine.set(note.id, Date.now() + 15000);
    if (action === "bin") this.showUndo(cx, note);
    return this.write(cx, ["act", this.shownFolder(), note.id, action, ...extra]);
  },

  // The check runs beside the queued writes: it can take a minute and a half, and a Bin meanwhile
  // wins (the check is then dropped, as box.js writes it only over the note it read). The editor
  // reuses a check that still holds; the Check button always runs it again.
  check(cx, note, { reuse = false } = {}) {
    if (!this.boxJs || this.checking.has(note.id)) return;
    this.checking.add(note.id);
    this.expanded.add(note.id);
    this.selected = note.id;
    const folder = this.shownFolder();
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
  },

  showUndo(cx, note) {
    this.undo = { id: note.id, title: note.title };
    cx.spawn(async (cx) => {
      await sleep(cx, UNDO_MS);
      if (this.undo?.id === note.id) this.undo = null;
      cx.notify();
    });
  },

  unbin(cx) {
    const id = this.undo?.id;
    this.undo = null;
    if (!id) return cx.notify();
    return this.write(cx, ["act", this.shownFolder(), id, "restore"]);
  },

  // The projects of the open spaces and every project with notes, each with its switch.
  loadProjects(cx) {
    if (!this.boxJs) return;
    // Without a folder here (a remote space, no space open) the list still comes, just with no
    // project marked as this space's.
    const here = this.here().folder ?? "";
    const folders = spaces().filter((space) => !space.machine && space.folder).map((space) => space.folder);
    cx.spawn(async (cx) => {
      try {
        this.projects = await box(this.node, this.boxJs, ["projects", here, ...folders]);
      } catch (error) {
        this.projects = { error: error.message };
      }
      cx.notify();
    });
  },

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
  },

  close() {
    const pane = focused()?.pane;
    run("layout.hide", { id: BLOCK });
    if (pane) run("pane.focus", { pane });
  },

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
  },

  // The tab that dropped the note while it is open, else the ticket on GitHub.
  jump(note) {
    const id = note.from?.terminal;
    const terminal = id && terminals().find((one) => one.address === id || one.id === id);
    if (terminal) return run("pane.focus", { terminal: terminal.address ?? id });
    const key = this.answer()?.project?.key ?? "";
    if (!key.startsWith("github.com/") || !note.from?.ticket) return;
    const url = `https://${key}/issues/${note.from.ticket}`;
    exec(window()?.platform === "macos" ? "open" : "xdg-open", [url]).catch((error) => notify({ title: "Suggestion box", body: `${url} did not open: ${error}`, level: "error" }));
  },

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
    // Keys 1 to 4 pick a filter, also from Settings; on an AZERTY keyboard the same keys say & é " '.
    const filter = FILTERS[FILTER_KEYS.indexOf(e.key)] ?? FILTERS[AZERTY_KEYS.indexOf(e.key)];
    if (filter && this.answer()?.project) {
      this.view = "list";
      this.filter = filter;
      cx.stop_propagation();
      return cx.notify();
    }
    // Settings and the filters after Now show no notes to pick: their keys do nothing there, but
    // esc goes back to Now.
    if (this.view !== "list" || this.filter !== "now") {
      if (e.key !== "escape") return;
      this.view = "list";
      this.filter = "now";
      cx.stop_propagation();
      return cx.notify();
    }
    const notes = this.ordered();
    const at = notes.findIndex((n) => n.id === this.selected);
    const note = notes[at] ?? null;
    const k = e.key;
    const can = (action) => Boolean(note?.actions.includes(action)) && (action !== "confirm" || canConfirm(this.proofs.get(claimKey(note))));
    if (k === "down" || k === "up") {
      this.selected = notes[Math.max(0, Math.min(notes.length - 1, at + (k === "down" ? 1 : -1)))]?.id ?? null;
      if (this.editor && this.editor.id !== this.selected) this.closeEditor(cx);
    }
    else if (k === "enter" && note) this.toggleExpanded(note, cx);
    else if (k === "s" && can("mark-solved")) this.act("mark-solved", note, cx);
    else if (k === "x" && can("bin")) this.act("bin", note, cx);
    else if (k === "k" && can("check")) this.act("check", note, cx);
    else if (k === "f" && can("file")) this.act("file", note, cx);
    else if (k === "u" && this.undo) this.act("undo", null, cx);
    else if (k === "c" && can("confirm")) this.act("confirm", note, cx);
    else if (k === "n" && can("not-solved")) this.act("not-solved", note, cx);
    else if (k === "escape" && this.editor) this.closeEditor(cx);
    else if (k === "escape") this.close();
    else return;
    cx.stop_propagation();
    cx.notify();
  },

  renderPanel(cx, t) {
    const here = this.here();
    this.watchMoves(cx);
    const key = this.answer()?.project?.key ?? here.none ?? null;
    // Another project sends what was just filed to Filed, also through a moment without a
    // project in between (another space being read); the first draw after a reload is no switch.
    const project = this.answer()?.project?.key ?? null;
    if (project) {
      if (this.shownProject && project !== this.shownProject) this.justFiled.clear(this.shownProject);
      this.shownProject = project;
    }
    if (key !== this.panelKey) {
      this.panelKey = key;
      this.expanded.clear();
      this.selected = null;
      this.filter = "now";
      this.proofs.clear();
      this.verifyAsked.clear();
      this.verifyFailed.clear();
      if (this.view === "settings") {
        this.projects = null;
        cx.spawn(async (cx) => this.loadProjects(cx));
      }
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
    // The open note that shows as picked is the one the keys act on: the newest, until you pick.
    if (!this.ordered().some((note) => note.id === this.selected)) this.selected = (this.answer()?.notes ?? []).find((note) => note.state === "open")?.id ?? null;
    // A claim leads with its verdict, so its proofs load as soon as it shows; Claude's check once.
    for (const note of (this.answer()?.notes ?? []).filter((one) => one.state === "to verify")) this.ensureProofs(cx, note);
    const state = {
      t,
      answer: this.answer(),
      view: this.view,
      filter: this.filter,
      expanded: this.expanded,
      selected: this.selected,
      undo: this.undo,
      checking: this.checking,
      editor: this.editorView(),
      proofs: this.proofs,
      verifying: this.verifying,
      verifyAsked: this.verifyAsked,
      verifyFailed: this.verifyFailed,
      fixing: this.fixing,
      mono: settings()?.font || "Menlo",
      justFiled: this.justFiled.for(this.answer()?.project?.key),
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
  },

  noteById(id) {
    const answer = this.answer();
    return [...(answer?.notes ?? []), ...(answer?.history ?? [])].find((note) => note.id === id) ?? null;
  },
};
