// The tab bar's button: one right-hand panel at a time, a wiggle when a note arrives, the box's own
// watch over new notes, confirmed fixes and filed issues, and the daily prune.
import { checking, layout, nextCommand, notify, run, setShared, shared, watchFolder, window } from "herdr";
import { button } from "./panel.js";
import { isWatched } from "./rules.js";
import { BLOCK, box, CHANGES_MS, DAY_MS, find, isShown, LIVE, OTHERS, PROOFS_MS, sleep, WATCH_MS, WATCH_SHOWN_MS } from "./view-host.js";

// A filed note whose issue may still close, or open again: the watch looks for that too.
const hasOpenIssue = (note) => note.state === "filed" && Boolean(note.issue);

// The view's methods for this part, added to it in main.js.
export const buttonCopy = {
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
  },

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
  },

  // Confirmed fixes not landed yet: every few minutes, did they land, or never will?
  watchFixes(cx) {
    const answer = this.answer();
    const history = answer?.history ?? [];
    // Every minute while you look at the panel, so a merged PR shows soon; else every five minutes.
    const every = isShown(BLOCK) ? WATCH_SHOWN_MS : WATCH_MS;
    if (this.isWatching || !answer?.project || !history.some((note) => isWatched(note) || hasOpenIssue(note)) || Date.now() - (this.watchedAt ?? 0) < every) return;
    this.watchedAt = Date.now();
    this.isWatching = true;
    const folder = this.shownFolder();
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
      this.isWatching = false;
    });
  },

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
        await box(this.node, this.boxJs, ["prune", this.shownFolder()]);
        localStorage.setItem(key, String(Date.now()));
      } catch (error) {
        console.log(`suggestion box: prune failed: ${error.message}`);
      }
    });
  },

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
    if (opened.includes(BLOCK)) {
      this.read(cx, true);
      // Opening the panel looks at once whether a fix landed or an issue closed meanwhile.
      this.watchedAt = 0;
      this.watchFixes(cx);
    }
  },

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
  },
};
