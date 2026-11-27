// Fix in new tab from the panel: the ticket starts in this space, and its tab is a click away.
import { focused, notify, run, spaces, terminals } from "herdr";
import { box, FIX_MS } from "./view-host.js";

// The view's methods for this part, added to it in main.js.
export const fixing = {
  // Fix in new tab: the ticket starts in this space through the parallel-tickets launcher, and the
  // box stays where it is.
  startFix(cx, note) {
    const space = this.spaceId();
    if (!this.boxJs || this.fixing.has(note.id) || !space) return;
    this.fixing.add(note.id);
    this.mine.set(note.id, Date.now() + 15000);
    const folder = this.shownFolder();
    cx.spawn(async (cx) => {
      try {
        const answer = await box(this.node, this.boxJs, ["fix", folder, note.id, space], FIX_MS);
        this.error = "";
        this.say(cx, `Fixing note ${note.number} in ${answer.branch}: its tab is open in this space.`);
      } catch (error) {
        // Said once: on the note under Needs you when it keeps the failure, else here.
        if (error.isOnNote) this.say(cx, `Fix in new tab did not start for note ${note.number}: its card under Needs you says why.`);
        else this.error = `Fix in new tab did not start for note ${note.number}: ${error.message}`;
      }
      this.fixing.delete(note.id);
      this.read(cx, false);
      cx.notify();
    });
    cx.notify();
  },

  spaceId() {
    const at = focused();
    return (spaces().find((one) => one.id === at?.space) ?? spaces().find((one) => one.active))?.id ?? null;
  },

  // The tab the fix runs in, while it is open.
  jumpToFix(note) {
    const id = note.fix?.pane;
    const terminal = id && terminals().find((one) => one.address === id || one.id === id);
    if (terminal) return run("pane.focus", { terminal: terminal.address ?? id });
    notify({ title: "Suggestion box", body: `The tab of ${note.fix?.branch} is closed.`, level: "info" });
  },
};
