// The history: the notes of the last 30 days that are done, by state: solved, filed (the issue still
// open on GitHub), closed (the issue closed on GitHub) and binned. Each
// is a compact row (a dot, its title, one line on how it stands); a click opens the rest. Restore and
// Fix in new tab stay on the row, as the actions a finished note most often needs.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { age } from "./notes.js";
import { filedLines } from "./panel-filed.js";
import { actionButton, actionsRow, groupTitle, messageCard } from "./panel-parts.js";

// A filed issue that was solved since counts as solved: its fix is what you look for.
const isSolved = (note) => note.state === "solved" || Boolean(note.solved?.confirmed);
// A filed issue closed on GitHub stands apart from the ones still open there.
const isClosed = (note) => note.state === "filed" && !isSolved(note) && Boolean(note.issue?.closed);
const ON_ROW = ["restore", "fix"];

export function history(s) {
  const { t, answer } = s;
  const notes = (answer?.history ?? []).filter((note) => !s.justFiled?.has(note.id));
  if (!notes.length) return messageCard(t, "empty-history", "Nothing here yet", "Filed, solved and binned notes stay here for 30 days: Restore sits on a binned note, and opening a row shows Reopen and the rest.");
  const groups = [
    ["Solved", notes.filter(isSolved)],
    ["Filed · still open", notes.filter((note) => note.state === "filed" && !isSolved(note) && !isClosed(note))],
    ["Closed on GitHub", notes.filter(isClosed)],
    ["Binned", notes.filter((note) => note.state === "binned")],
  ];
  return v_flex().gap(4).children(groups.flatMap(([name, list]) => (list.length ? [groupTitle(t, `${name.toUpperCase()} · ${list.length}`), ...list.map((note) => pastRow(s, note))] : [])));
}

function pastRow(s, note) {
  const { t } = s;
  const isOpen = s.expanded.has(note.id);
  const status = statusOf(t, note);
  const onRow = note.actions.filter((action) => ON_ROW.includes(action));
  return v_flex().id(`past:${note.id}`).px(10).py(8).gap(8).rounded(8).bg(isOpen ? t.raised : t.chrome).hover((st) => st.bg(t.raised))
    .child(h_flex().gap(10).items_start()
      .child(div().flex_none().size(8).rounded(4).mt(6).bg(status.color))
      .child(v_flex().id(`past-open:${note.id}`).flex_1().min_w(0).gap(2).cursor_pointer().tooltip(isOpen ? "Close" : "Open its details").on_click((_e, cx) => s.act("expand", note, cx))
        .child(div().min_w(0).truncate().font_medium().child(note.filed?.title ?? note.title))
        .child(div().min_w(0).truncate().text_size(11.5).text_color(t.muted).child(status.line)))
      .children(onRow.map((action) => actionButton(t, note, action, s.act, false, action === "fix" && Boolean(s.fixing?.has(note.id))))))
    .when(isOpen, (el) => el.child(pastDetails(s, note, onRow)));
}

// How a finished note stands, in one line, and the colour of its dot.
function statusOf(t, note) {
  const parts = (...items) => items.filter(Boolean).join(" · ");
  if (isSolved(note)) {
    const landed = note.solved?.landed;
    const issue = note.issue ? `issue #${note.issue.number}` : null;
    if (landed?.state === "landed") return { color: t.ansi2, line: parts(`landed · ${landed.how}`, issue, note.age) };
    if (landed?.state === "waiting") return { color: t.working, line: parts(`waiting to land · ${landed.how}`, issue, note.age) };
    // Confirmed before anything was known about landing: the watch still waits for it.
    if (note.solved?.confirmed) return { color: t.working, line: parts(`waiting to land · solved on ${note.solved?.branch ?? "a branch"}`, issue, note.age) };
    return { color: t.ansi2, line: parts(`solved on ${note.solved?.branch ?? "a branch"}`, issue, note.age) };
  }
  if (isClosed(note)) {
    const at = note.issue.closed.at && !Number.isNaN(Date.parse(note.issue.closed.at)) ? age(note.issue.closed.at, Date.now()) : null;
    return { color: t.dim, line: parts(`#${note.issue.number} closed${at ? (at === "now" ? " just now" : ` ${at} ago`) : ""}`, note.fix?.branch ? `fixed in ${note.fix.branch}` : null) };
  }
  if (note.state === "filed") {
    const issue = note.issue ?? {};
    const board = issue.boards?.length ? issue.boards.map((b) => (b.column ? `${b.title} › ${b.column}` : b.title)).join(", ") : note.board?.error ? "not on the board" : null;
    const fixing = note.fix?.branch ? `fixing in ${note.fix.branch}` : null;
    return { color: t.accent, line: parts(`#${issue.number} open`, board, fixing, note.age) };
  }
  return { color: t.dim, line: parts("binned", note.age) };
}

// Behind the row: the issue with its board, fix and closing words, how it was solved, and the rest
// of its actions.
function pastDetails(s, note, onRow) {
  const { t } = s;
  const rest = { ...note, actions: note.actions.filter((action) => !onRow.includes(action)) };
  return v_flex().gap(8).pl(18)
    .when(Boolean(note.issue), (el) => el.child(filedLines(s, note)))
    .when(Boolean(note.solved?.how), (el) => el.child(div().pl(8).border_l(2).border_color(t.border).text_size(12).text_color(t.muted).whitespace_normal().child(note.solved.how)))
    .when(rest.actions.length > 0, (el) => el.child(actionsRow(s, rest)));
}
