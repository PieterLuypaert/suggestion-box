// A filed note: its issue, its boards, its fix, and once solved the words that close it.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { filedStep } from "./filed-step.js";
import { actionsRow, card, link, plainButton } from "./panel-parts.js";

// A solved note in the history: where it was solved, and whether its fix landed yet.
export function solvedLine(note) {
  const landed = note.solved?.landed;
  if (landed?.state === "landed") return `Solved · landed: ${landed.how}`;
  return `Solved on ${note.solved?.branch ?? "a branch"}${note.solved?.confirmed ? " · waiting to land" : ""}`;
}

// A filed note: its issue, how the board step went, and once solved the words that close it. With
// withNeeds false the lines that need you (needsYou below) are left out, for a card that shows them
// already.
export function filedLines(s, note, { withNeeds = true } = {}) {
  const { t } = s;
  const issue = note.issue ?? {};
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
    .when(withNeeds, (el) => el.child(needsYou(s, note)));
}

// What a filed note asks of you: put it on the board when that failed, and once it is solved (or
// claimed) the words that close its issue with the fix's PR, until the issue closed or the fix landed.
// With saysBoard false only the board's button shows, for a card whose first line names the board's
// failure already.
export function needsYou(s, note, { saysBoard = true } = {}) {
  const { t } = s;
  const issue = note.issue ?? {};
  const isSolved = Boolean(note.solved?.confirmed) || note.state === "to verify";
  const isTooLate = Boolean(issue.closed) || note.solved?.landed?.state === "landed";
  const addToBoard = plainButton(t, `board:${note.id}`, "Add to board", (_e, cx) => s.act("board", note, cx));
  return v_flex().gap(4).text_size(12)
    .when(Boolean(note.board?.error), (el) => el.child(saysBoard
      ? h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).whitespace_normal().text_color(t.working).child(`Not on the board: ${note.board.error}`))
        .child(addToBoard)
      : h_flex().justify_end().child(addToBoard)))
    .when(isSolved && !isTooLate && Boolean(issue.closes), (el) => el.child(h_flex().gap(8).items_center()
      .child(div().flex_1().min_w(0).whitespace_normal().text_color(t.muted).child(`Put "${issue.closes}" in the fix's PR so the issue closes with it.`))
      .child(link(t, `closes:${note.id}`, "Copy", (_e, cx) => s.act("copy", note, cx)))));
}

// A note just filed: its title, what it still needs (a dot: amber needs you, blue under way, green
// ready, grey done; blue is ANSI blue, as the theme's accent can be orange), its issue, and the
// button for the next step.
export function filedCard(s, note) {
  const { t } = s;
  const step = filedStep(note);
  const color = { needs: t.working, working: t.ansi4, ready: t.ansi2, done: t.dim }[step.kind];
  const issue = note.issue ?? {};
  return card(t, `filed:${note.id}`, { edge: step.kind === "needs" ? t.working : null })
    .child(div().font_medium().whitespace_normal().child(note.filed?.title ?? note.title))
    .child(h_flex().gap(8).items_start().text_size(12)
      .child(div().flex_none().size(8).rounded(4).mt(5).bg(color))
      .child(v_flex().flex_1().min_w(0)
        .child(div().whitespace_normal().text_color(step.kind === "needs" ? t.working : t.foreground).child(step.text))
        .when(Boolean(step.branch), (el) => el.child(div().truncate().text_color(t.muted).child(step.branch)))))
    .child(h_flex().flex_wrap().gap_x(10).gap_y(2).items_center().text_size(11.5).text_color(t.muted)
      .child(link(t, `issue:${note.id}`, `#${issue.number} ↗`, (_e, cx) => s.act("open-url", note, cx)))
      .when(Boolean(note.fix?.branch) && !issue.closed, (el) => el.child(link(t, `fixing:${note.id}`, "Go to its tab ↗", (_e, cx) => s.act("jump-fix", note, cx))))
      .child(div().child(note.age)))
    .child(needsYou(s, note, { saysBoard: false }))
    .when(note.actions.length > 0, (el) => el.child(actionsRow(s, note, { primary: "fix", isBusy: (a) => a === "fix" && Boolean(s.fixing?.has(note.id)) })));
}
