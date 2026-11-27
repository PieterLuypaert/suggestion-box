// A claim's proofs in the panel: the change and landed, the independent check, and Open at a commit.
import { exec, notify } from "herdr";
import { claimKey, proofsDue } from "./proofs.js";
import { box, CHECK_MS, EDITORS, PROOFS_MS } from "./view-host.js";

// The view's methods for this part, added to it in main.js.
export const proving = {
  // Proofs 1 and 3 as soon as a claim shows, and Claude's check of it: one claim at a time, once while
  // the panel is open (the check itself is kept and reused while the code it read stays the same).
  // Nothing starts before the box's own side is found.
  ensureProofs(cx, note) {
    if (!this.boxJs) return;
    const key = claimKey(note);
    const found = this.proofs.get(key);
    // Looked at again every half minute until the fix landed, so a merge shows soon.
    if (proofsDue(found)) this.loadProofs(cx, note, { isRefresh: Boolean(found) });
    if (this.verifyAsked.has(key) || this.verifying.size > 0) return;
    this.verifyAsked.add(key);
    this.verifyClaim(cx, note, { isAuto: true });
  },

  // A refresh keeps showing what was found until the new look is in, so the card never flickers.
  loadProofs(cx, note, { isRefresh = false } = {}) {
    const key = claimKey(note);
    const known = this.proofs.get(key);
    if (!this.boxJs || known?.isLoading || known?.isRefreshing) return;
    if (known && !known.error && !isRefresh) return;
    this.proofs.set(key, isRefresh && known && !known.error ? { ...known, isRefreshing: true } : { isLoading: true });
    const folder = this.shownFolder();
    cx.spawn(async (cx) => {
      try {
        const answer = await box(this.node, this.boxJs, ["proofs", folder, note.id], PROOFS_MS);
        this.proofs.set(key, { change: answer.change, landed: answer.landed, at: Date.now() });
      } catch (error) {
        this.proofs.set(key, isRefresh && known && !known.error ? { ...known, isRefreshing: false, at: Date.now() } : { error: error.message, at: Date.now() });
      }
      cx.notify();
    });
  },

  // Proof 2 beside the queued writes, like the check: a Confirm meanwhile wins, and it is dropped. A
  // check the panel started by itself that fails is marked on its card (not checked, Check again),
  // never as an error you did not ask for.
  verifyClaim(cx, note, { again = false, isAuto = false } = {}) {
    if (!this.boxJs || this.verifying.has(note.id)) return;
    this.verifying.add(note.id);
    const folder = this.shownFolder();
    cx.spawn(async (cx) => {
      try {
        await box(this.node, this.boxJs, ["verify", folder, note.id, ...(again ? ["--again"] : [])], CHECK_MS);
      } catch (error) {
        if (isAuto) console.log(`suggestion box: the independent check of note ${note.number} did not finish: ${error.message}`);
        else this.error = `The independent check did not finish: ${error.message}`;
      }
      this.verifying.delete(note.id);
      this.read(cx, false);
      cx.notify();
    });
    cx.notify();
  },

  // The note's file as the solving commit has it, in the editor at the note's line there.
  async openAt({ sha, path, line }) {
    try {
      const shown = await box(this.node, this.boxJs, ["show", this.shownFolder(), sha, path, String(line ?? "")]);
      const target = shown.line ? `${shown.file}:${shown.line}` : shown.file;
      for (const editor of EDITORS) {
        const opened = await exec(editor, ["-g", target]).catch(() => null);
        if (opened?.code === 0) return;
      }
      await exec("open", [shown.file]);
    } catch (error) {
      notify({ title: "Suggestion box", body: `${path} at ${sha.slice(0, 7)} did not open: ${error.message}`, level: "error" });
    }
  },
};
