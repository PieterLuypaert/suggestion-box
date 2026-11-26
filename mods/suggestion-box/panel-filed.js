// A filed note: its issue, its boards, its fix, and once solved the words that close it.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { actionsRow, card, link, plainButton } from "./panel-parts.js";

// A solved note in the history: where it was solved, and whether its fix landed yet.
export function solvedLine(note) {
  const landed = note.solved?.landed;
  if (landed?.state === "landed") return `Solved · landed: ${landed.how}`;
  return `Solved on ${note.solved?.branch ?? "a branch"}${note.solved?.confirmed ? " · waiting to land" : ""}`;
}

// A filed note: its issue, how the board step went, and once solved the words that close it.
export function filedLines(s, note) {
  const { t } = s;
  const issue = note.issue ?? {};
  const isSolved = Boolean(note.solved?.confirmed) || note.state === "to verify";
  return v_flex().gap(4).text_size(12)
    .child(h_flex().gap(8).items_center()
      .child(link(t, `issue:${note.id}`, `Filed #${issue.number} ↗`, (_e, cx) => s.act("open-url", note, cx)))
      .when(Boolean(note.solved?.confirmed), (el) => el.child(div().text_color(t.muted).child(solvedLine(note).replace(/^Solved/, "solved")))))
    .when(Boolean(note.issue?.closed), (el) => el.child(div().text_color(t.muted).child(`Issue #${issue.number} closed`)))
    .when(Boolean(issue.boards?.length), (el) => el.child(div().text_color(t.muted).whitespace_normal().child(`On board ${issue.boards.map((b) => (b.column ? `${b.title} › ${b.column}` : b.title)).join(", ")}`)))
    .when(Boolean(note.fix?.branch) && !note.issue?.closed, (el) => el.child(link(t, `fixing:${note.id}`, `Fixing in ${note.fix.branch} ↗`, (_e, cx) => s.act("jump-fix", note, cx))))
    .when(Boolean(note.fix?.starting) && !note.fix?.isStale, (el) => el.child(div().text_color(t.muted).child("A fix is starting in a new tab…")))
    .when(Boolean(note.fix?.isStale), (el) => el.child(div().text_color(t.working).whitespace_normal().child("A fix was starting but never reported back. Look for its tab before you start it again.")))
    .when(Boolean(note.fixError) && !note.fix, (el) => el.child(div().text_color(t.blocked).whitespace_normal().child(`Fix in new tab did not start: ${note.fixError.why}`)))
    .when(Boolean(note.board?.error), (el) => el.child(h_flex().gap(8).items_center()
      .child(div().flex_1().min_w(0).whitespace_normal().text_color(t.working).child(`Not on the board: ${note.board.error}`))
      .child(plainButton(t, `board:${note.id}`, "Add to board", (_e, cx) => s.act("board", note, cx)))))
    .when(isSolved && Boolean(issue.closes), (el) => el.child(h_flex().gap(8).items_center()
      .child(div().flex_1().min_w(0).whitespace_normal().text_color(t.muted).child(`Put "${issue.closes}" in the fix's PR so the issue closes with it.`))
      .child(link(t, `closes:${note.id}`, "Copy", (_e, cx) => s.act("copy", note, cx)))));
}

export function filedCard(s, note) {
  const { t } = s;
  return card(t, `filed:${note.id}`)
    .child(div().font_medium().whitespace_normal().child(note.filed?.title ?? note.title))
    .child(filedLines(s, note))
    .when(note.actions.length > 0, (el) => el.child(actionsRow(s, note, { primary: "fix", isBusy: (a) => a === "fix" && Boolean(s.fixing?.has(note.id)) })));
}
