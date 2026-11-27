// A claim's proofs in the panel: the change and landed, the independent check, and Open at a commit.
import { exec, notify } from "herdr";
import { box, CHECK_MS, EDITORS, PROOFS_MS } from "./view-host.js";

// The view's methods for this part, added to it in main.js.
export const proving = {
  // Proofs 1 and 3 as soon as a claim shows, and Claude's check of it once while the panel is open
  // (the check itself is kept and reused while the code it read stays the same).
  ensureProofs(cx, note) {
    if (!this.proofs.has(note.id)) this.loadProofs(cx, note);
    if (this.verifyAsked.has(note.id)) return;
    this.verifyAsked.add(note.id);
    this.verifyClaim(cx, note);
  },

  loadProofs(cx, note) {
    if (!this.boxJs || this.proofs.get(note.id)?.isLoading) return;
    if (this.proofs.has(note.id) && !this.proofs.get(note.id).error) return;
    this.proofs.set(note.id, { isLoading: true });
    const folder = this.shownFolder();
    cx.spawn(async (cx) => {
      try {
        const answer = await box(this.node, this.boxJs, ["proofs", folder, note.id], PROOFS_MS);
        this.proofs.set(note.id, { change: answer.change, landed: answer.landed });
      } catch (error) {
        this.proofs.set(note.id, { error: error.message });
      }
      cx.notify();
    });
  },

  // Proof 2 beside the queued writes, like the check: a Confirm meanwhile wins, and it is dropped.
  verifyClaim(cx, note, { again = false } = {}) {
    if (!this.boxJs || this.verifying.has(note.id)) return;
    this.verifying.add(note.id);
    const folder = this.shownFolder();
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
