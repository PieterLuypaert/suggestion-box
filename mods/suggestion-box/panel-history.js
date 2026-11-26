// The history: filed, solved and binned notes of the last 30 days.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { filedLines, solvedLine } from "./panel-filed.js";
import { actionsRow, card, messageCard, metaRow } from "./panel-parts.js";

export function history(s) {
  const { t, answer } = s;
  const notes = (answer?.history ?? []).filter((note) => !s.justFiled?.has(note.id));
  if (!notes.length) return messageCard(t, "empty-history", "Nothing here yet", "Filed, solved and binned notes stay here for 30 days, with Restore and Reopen.");
  return v_flex().gap(8).children(notes.map((note) => {
    const what = note.state === "binned" ? "Binned" : note.state === "solved" ? solvedLine(note) : null;
    return card(t, `past:${note.id}`)
      .child(div().font_medium().whitespace_normal().child(note.filed?.title ?? note.title))
      .when(note.state === "filed", (el) => el.child(filedLines(s, note)))
      .child(metaRow(t).when(Boolean(what), (row) => row.child(what)).child(note.age))
      .when(Boolean(note.solved?.how), (el) => el.child(div().pl(8).border_l(2).border_color(t.border).text_size(12).text_color(t.muted).whitespace_normal().child(note.solved.how)))
      .when(note.actions.length > 0, (el) => el.child(actionsRow(s, note, { isBusy: (a) => a === "fix" && Boolean(s.fixing?.has(note.id)) })));
  }));
}
