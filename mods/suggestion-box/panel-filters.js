// Filed, Done and Binned, the filters after Now: one quiet row per note (a dot, its title, a word on
// how it stands); a click opens its details and its buttons under it.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { age } from "./notes.js";
import { filedStep } from "./filed-step.js";
import { isClosed, isSolved, rowState } from "./filters.js";
import { filedLines } from "./panel-filed.js";
import { actionsRow, messageCard, quietRow, stepColor } from "./panel-parts.js";

const EMPTY = {
  filed: ["No open issues", "An issue filed from the box shows here until it closes on GitHub. Open one for Fix in new tab."],
  done: ["Nothing done yet", "Solved notes and issues closed on GitHub show here for 30 days."],
  binned: ["Nothing binned", "A binned note stays here for 30 days. Open one to restore it."],
};

export function filterView(s, filter, notes) {
  const { t } = s;
  if (!notes.length) return messageCard(t, `empty-${filter}`, ...EMPTY[filter]);
  return v_flex().gap(6).children(notes.map((note) => pastRow(s, note)));
}

function pastRow(s, note) {
  const { t } = s;
  const isOpen = s.expanded.has(note.id);
  const state = rowState(note);
  return quietRow(t, `past:${note.id}`, {
    color: stepColor(t, state.kind),
    title: note.filed?.title ?? note.title,
    right: note.state === "binned" ? note.age : `${state.word} · ${note.age}`,
    onClick: (_e, cx) => s.act("expand", note, cx),
    tip: isOpen ? "Close" : "Open its details",
    details: isOpen ? pastDetails(s, note) : null,
  });
}

// Under an open row: how it stands in full, the issue with its board, fix and closing words, how it
// was solved, and its buttons.
function pastDetails(s, note) {
  const { t } = s;
  return v_flex().gap(10).pl(20)
    .child(div().text_size(12).text_color(t.muted).whitespace_normal().child(statusLine(note)))
    .when(Boolean(note.issue), (el) => el.child(filedLines(s, note)))
    .when(Boolean(note.solved?.how), (el) => el.child(div().pl(8).border_l(2).border_color(t.border).text_size(12).text_color(t.muted).whitespace_normal().child(note.solved.how)))
    .when(note.actions.length > 0, (el) => el.child(actionsRow(s, note, { primary: "fix", isBusy: (a) => a === "fix" && Boolean(s.fixing?.has(note.id)) })));
}

// How a finished note stands, in one line.
function statusLine(note) {
  const parts = (...items) => items.filter(Boolean).join(" · ");
  if (isSolved(note)) {
    const landed = note.solved?.landed;
    const issue = note.issue ? `issue #${note.issue.number}` : null;
    if (landed?.state === "landed") return parts(`Landed: ${landed.how}`, issue, note.age);
    if (landed?.state === "waiting") return parts(`Waiting to land: ${landed.how}`, issue, note.age);
    if (note.solved?.confirmed) return parts(`Waiting to land · solved on ${note.solved?.branch ?? "a branch"}`, issue, note.age);
    return parts(`Solved on ${note.solved?.branch ?? "a branch"}`, issue, note.age);
  }
  if (isClosed(note)) {
    const at = note.issue.closed.at && !Number.isNaN(Date.parse(note.issue.closed.at)) ? age(note.issue.closed.at, Date.now()) : null;
    return parts(`#${note.issue.number} closed on GitHub${at ? (at === "now" ? " just now" : ` ${at} ago`) : ""}`, note.fix?.branch ? `fixed in ${note.fix.branch}` : null);
  }
  if (note.state === "filed") return parts(filedStep(note).text, note.age);
  return parts("Binned", note.age);
}
