// How the suggestion box looks: the tab bar's button and the panel on the right. Only drawing; what
// a click does comes in as `act`, from main.js.
// The cards and their parts are drawn in the panel-*.js files next to this one.
import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { verifyCard } from "./panel-claim.js";
import { editorCard } from "./panel-editor.js";
import { filedGroups, inHistory } from "./filed-step.js";
import { filedCard } from "./panel-filed.js";
import { history } from "./panel-history.js";
import { noteCard } from "./panel-note.js";
import { groupTitle, ICON, ICON_OFF, iconButton, messageCard, stop, toggle } from "./panel-parts.js";
import { settingsView } from "./panel-settings.js";
export { ICON, ICON_OFF } from "./panel-parts.js";

// The button, drawn as the tab bar draws Files, Changes and Quarterdeck: the box icon, "Box", the
// open count and a green ✓ for notes to verify. Dim without a box here; "off" while collecting is.
// Its block is wide enough for both counts; the face keeps to the left of it, next to the button
// before it, so the room the counts do not use falls at the window's edge.
export function button({ t, counts, isOn, isOff, isDim, why, isWiggling, onToggle }) {
  const open = counts?.open ?? 0;
  const toVerify = counts?.toVerify ?? 0;
  const pill = (text, bg) => div().flex_none().px(5).rounded(8).text_size(10.5).font_medium().text_color(t.accent_foreground).bg(bg).child(text);
  const face = h_flex().id("suggestion-box-button").relative().h(26).px(8).gap(5).flex_none().items_center().rounded(6).text_size(12)
    .bg(isOn ? t.selected : t.chrome).text_color(isOn ? t.foreground : t.muted).hover((st) => st.bg(t.hover)).cursor_pointer()
    .when(isDim, (el) => el.opacity(0.45))
    .when(isWiggling, (el) => el.loop("left", { from: -2, to: 2, period: 140 }))
    .tooltip(why)
    .on_mouse_down("left", stop)
    .on_click(() => onToggle())
    .child(image(isOff ? ICON_OFF : ICON).w(16).h(16).flex_none())
    .child("Box")
    .when(isOff, (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child("off")))
    .when(open > 0, (el) => el.child(pill(String(open), t.done)))
    .when(toVerify > 0, (el) => el.child(pill(`✓${toVerify}`, t.ansi2)));
  return h_flex().size_full().pl(2).items_center().justify_start().bg(t.chrome).border_b(1).border_color(t.border).child(face);
}

// The panel: a header with the switches, the notes by state, and a footer.
export function panel(s) {
  const { t } = s;
  return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13).text_color(t.foreground)
    .child(header(s))
    .when(Boolean(s.collecting && !s.collecting.project), (el) => el.child(offLine(s)))
    .when(Boolean(s.notice), (el) => el.child(div().flex_none().mx(8).mt(8).px(12).py(8).rounded(8).bg(t.raised).text_size(12).whitespace_normal().child(s.notice)))
    .when(Boolean(s.error), (el) => el.child(div().flex_none().mx(8).mt(8).px(12).py(8).rounded(8).bg(t.raised).border(1).border_color(t.blocked).text_size(12).text_color(t.blocked).whitespace_normal().child(s.error)))
    .child(div().id("sbox-list").flex_1().min_h(0).overflow_y_scrollbar().px(8).py(8).child(s.view === "history" ? history(s) : s.view === "settings" ? settingsView(s) : groups(s)))
    .child(footer(s));
}

// Two lines, so nothing is cut off: the box and its buttons, then the project, its counts and its
// Collecting switch with On or Off in words.
function header(s) {
  const { t, answer } = s;
  const name = answer?.project?.name ?? "";
  const counts = answer?.counts;
  const filed = filedGroups(answer?.history, s.justFiled);
  const needs = filed.needs.length;
  // In the order the groups come: what asks for you first.
  const sum = counts ? [counts.toVerify ? `${counts.toVerify} to verify` : "", needs ? `${needs} need${needs === 1 ? "s" : ""} you` : "", counts.open ? `${counts.open} open` : "", filed.justFiled.length ? `${filed.justFiled.length} just filed` : ""].filter(Boolean).join(" · ") || "empty" : "";
  const title = s.view === "settings" ? "Suggestion box · Settings" : s.view === "history" ? "Suggestion box · History" : "Suggestion box";
  const isOn = Boolean(s.collecting?.project);
  return v_flex().flex_none().pl(14).pr(6).py(8).gap(4).border_b(1).border_color(t.border)
    .child(h_flex().gap(6).items_center()
      .child(div().flex_1().min_w(0).truncate().font_semibold().child(title))
      .child(iconButton(t, "settings", svg("mods/workspace-chrome/settings.svg").size(14), s.view === "settings" ? "Back to the notes" : "Settings: which projects use the box", (_e, cx) => s.act("settings", null, cx), s.view === "settings"))
      .child(iconButton(t, "close", svg("mods/workspace-chrome/x.svg").size(14), "Close (⌥⌘S)", (_e, cx) => s.act("close", null, cx))))
    .when(Boolean(name), (el) => el.child(h_flex().gap(8).items_center().pr(8)
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child([name, sum].filter(Boolean).join(" · ")))
      .when(Boolean(s.collecting), (row) => row.child(toggle(t, "collect", `Collecting ${isOn ? "on" : "off"}`, isOn, isOn ? `Agents in ${name} drop notes here; switch off and they never hear of the box` : `Agents in ${name} never hear of the box; switch on to collect notes`, (_e, cx) => s.act("collect", null, cx))))));
}

function offLine(s) {
  const { t } = s;
  return div().flex_none().mx(8).mt(8).px(12).py(8).rounded(8).bg(t.raised).text_size(12).text_color(t.muted).whitespace_normal()
    .child(`Collecting is off for ${s.answer?.project?.name}: its new sessions never hear of the box, and an agent that is already running is told to carry on.`);
}

function groups(s) {
  const { t, answer } = s;
  if (s.noProject) return messageCard(t, "no-box", "No box here", s.noProject);
  if (!answer) return div().px(8).py(10).text_size(12).text_color(t.dim).child("Opening the box…");
  if (!answer.project) return messageCard(t, "no-box", "No box here", "No git repo in this space, so there is no box here.");
  const toVerify = answer.notes.filter((n) => n.state === "to verify");
  const open = answer.notes.filter((n) => n.state === "open");
  const filed = filedGroups(answer.history, s.justFiled);
  if (!toVerify.length && !open.length && !filed.needs.length && !filed.justFiled.length && !s.undo) {
    return (answer.history ?? []).length
      ? messageCard(t, "empty", `Nothing open in ${answer.project.name}'s box`, "Filed, solved and binned notes are in the history, below. Agents drop a new note here when they spot a problem outside their ticket.", { withBox: true })
      : messageCard(t, "empty", `Nothing in ${answer.project.name}'s box yet`, "Agents drop a note here when they spot a problem outside their ticket. You check it against the code, file it as an issue, or bin it.", { withBox: true });
  }
  const group = (name, notes, draw) => notes.length ? [groupTitle(t, `${name.toUpperCase()} · ${notes.length}`), ...notes.map(draw)] : [];
  // What asks for you first: claims to verify, then filed issues that need you (also old ones), then
  // the open notes, then the rest of the issues just filed.
  return v_flex().gap(8).children([
    ...group("To verify", toVerify, (n) => verifyCard(s, n)),
    ...group("Needs you", filed.needs, (n) => filedCard(s, n)),
    ...(s.undo ? [undoRow(s, s.undo)] : []),
    ...group("Open", open, (n) => (s.editor?.id === n.id ? editorCard(s, n, s.editor) : noteCard(s, n))),
    ...group("Just filed", filed.justFiled, (n) => filedCard(s, n)),
  ]);
}

function undoRow(s, note) {
  const { t } = s;
  return h_flex().id(`undo:${note.id}`).px(12).py(8).gap(8).rounded(8).bg(t.raised).items_center().text_size(12.5).text_color(t.muted)
    .child(div().flex_1().min_w(0).truncate().child(`Binned: ${note.title}`))
    .child(div().id(`undo-button:${note.id}`).flex_none().h(24).px(10).flex().items_center().rounded(6).border(1).border_color(t.border).bg(t.background).cursor_pointer()
      .hover((st) => st.bg(t.hover)).on_click((_e, cx) => s.act("undo", note, cx)).child("Undo"));
}

// The keys of the note you picked, so the line fits: only what that note can do. Picking and opening
// are in its hover text, and with nothing to pick there is no hint at all.
const KEYS = { file: "f file", check: "k check", "mark-solved": "s solved", bin: "x bin", confirm: "c confirm", "not-solved": "n not solved" };

function hintsFor(s) {
  if (s.view !== "list") return { text: "esc back" };
  if (s.editor) return { text: "esc leaves a field · again closes, the draft is kept" };
  // The keys reach the notes of the list: To verify and Open.
  const notes = (s.answer?.notes ?? []).filter((one) => one.state === "open" || one.state === "to verify");
  const note = notes.find((one) => one.id === s.selected);
  const keys = [...(note?.actions ?? []).map((a) => KEYS[a]).filter(Boolean), s.undo ? "u undo" : null].filter(Boolean);
  return {
    text: keys.length ? keys.join(" · ") : notes.length ? "↑↓ pick a note" : "",
    tip: notes.length ? "↑↓ picks a note · enter opens it · esc closes the panel" : null,
  };
}

function footer(s) {
  const { t, answer } = s;
  // What the history shows: the list keeps what needs you and what was just filed.
  const past = inHistory(answer?.history, s.justFiled);
  const count = (state) => past.filter((n) => n.state === state).length;
  return h_flex().flex_none().h(30).px(12).gap(8).items_center().border_t(1).border_color(t.border).text_size(11.5).text_color(t.dim)
    .child(div().id("history").flex_none().cursor_pointer().hover((st) => st.text_color(t.foreground)).on_click((_e, cx) => s.act("history", null, cx))
      .tooltip(s.view !== "list" ? "Back to the notes" : `${count("filed")} filed · ${count("solved")} solved · ${count("binned")} binned in the last 30 days`)
      .child(s.view !== "list" ? "◂ Back to the notes" : `History · ${past.length} ▸`))
    .child(keyHints(s));
}

function keyHints(s) {
  const { text, tip } = hintsFor(s);
  return div().id("keys").flex_1().min_w(0).truncate().text_right().when(Boolean(tip), (el) => el.tooltip(tip)).child(text);
}
