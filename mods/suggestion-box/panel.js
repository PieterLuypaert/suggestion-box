// How the suggestion box looks: the tab bar's button and the panel on the right. Only drawing; what
// a click does comes in as `act`, from main.js.
// The cards and their parts are drawn in the panel-*.js files next to this one.
import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { verifyCard } from "./panel-claim.js";
import { editorCard } from "./panel-editor.js";
import { filedGroups } from "./filed-step.js";
import { FILTER_NAMES, FILTERS, filtered } from "./filters.js";
import { filedCard } from "./panel-filed.js";
import { filterView } from "./panel-filters.js";
import { noteCard, openRow } from "./panel-note.js";
import { canConfirm, claimKey } from "./proofs.js";
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

// The panel: a header with the switches and the filters, the filter's notes, and a footer with the
// keys of the picked note.
export function panel(s) {
  const { t } = s;
  const f = filtered(s.answer, s.justFiled);
  const filter = s.filter ?? "now";
  const body = s.view === "settings" ? settingsView(s) : filter === "now" || !s.answer?.project ? nowView(s, f.now) : filterView(s, filter, f[filter]);
  const hints = hintsFor(s, filter);
  return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13).text_color(t.foreground)
    .child(header(s, f.counts, filter))
    .when(Boolean(s.collecting && !s.collecting.project), (el) => el.child(offLine(s)))
    .when(Boolean(s.notice), (el) => el.child(div().flex_none().mx(12).mt(10).px(14).py(10).rounded(8).bg(t.raised).text_size(12).whitespace_normal().child(s.notice)))
    .when(Boolean(s.error), (el) => el.child(div().flex_none().mx(12).mt(10).px(14).py(10).rounded(8).bg(t.raised).border(1).border_color(t.blocked).text_size(12).text_color(t.blocked).whitespace_normal().child(s.error)))
    .child(div().id("sbox-list").flex_1().min_h(0).overflow_y_scrollbar().px(12).py(12).child(body))
    .when(Boolean(hints.text), (el) => el.child(footer(s, hints)));
}

// Three lines, so nothing is cut off: the box and its buttons; the project, what waits and its
// Collecting switch with On or Off in words; the filters with their counts.
function header(s, counts, filter) {
  const { t, answer } = s;
  const name = answer?.project?.name ?? "";
  const stored = answer?.counts;
  const filed = filedGroups(answer?.history, s.justFiled);
  const needs = filed.needs.length;
  // In the order the groups come: what asks for you first.
  const sum = stored ? [stored.toVerify ? `${stored.toVerify} to verify` : "", needs ? `${needs} need${needs === 1 ? "s" : ""} you` : "", stored.open ? `${stored.open} open` : "", filed.justFiled.length ? `${filed.justFiled.length} just filed` : ""].filter(Boolean).join(" · ") || "nothing waits" : "";
  const title = s.view === "settings" ? "Suggestion box · Settings" : "Suggestion box";
  const isOn = Boolean(s.collecting?.project);
  return v_flex().flex_none().pl(16).pr(10).pt(12).pb(10).gap(8).border_b(1).border_color(t.border)
    .child(h_flex().gap(6).items_center()
      .child(div().flex_1().min_w(0).truncate().font_semibold().child(title))
      .child(iconButton(t, "settings", svg("mods/workspace-chrome/settings.svg").size(14), s.view === "settings" ? "Back to the notes" : "Settings: which projects use the box", (_e, cx) => s.act("settings", null, cx), s.view === "settings"))
      .child(iconButton(t, "close", svg("mods/workspace-chrome/x.svg").size(14), "Close (⌥⌘S)", (_e, cx) => s.act("close", null, cx))))
    .when(Boolean(name), (el) => el.child(h_flex().gap(10).items_center().pr(6)
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child([name, sum].filter(Boolean).join(" · ")))
      .when(Boolean(s.collecting), (row) => row.child(toggle(t, "collect", `Collecting ${isOn ? "on" : "off"}`, isOn, isOn ? `Agents in ${name} drop notes here; switch off and they never hear of the box` : `Agents in ${name} never hear of the box; switch on to collect notes`, (_e, cx) => s.act("collect", null, cx))))))
    .when(Boolean(answer?.project) && s.view !== "settings", (el) => el.child(filterTabs(s, counts, filter)));
}

// The filters, as tabs: Now first, the picked one filled. Keys 1 to 4 pick them too.
function filterTabs(s, counts, filter) {
  const { t } = s;
  return h_flex().gap(6).pt(2).children(FILTERS.map((name, i) => {
    const isOn = name === filter;
    return h_flex().id(`filter:${name}`).flex_none().h(28).px(10).gap(6).items_center().rounded(6).text_size(12).cursor_pointer()
      .bg(isOn ? t.selected : t.chrome).text_color(isOn ? t.foreground : t.muted).when(isOn, (el) => el.font_medium())
      .hover((st) => st.bg(isOn ? t.selected : t.hover).text_color(t.foreground))
      .tooltip(`${TAB_TIPS[name]} (${i + 1})`)
      .on_click((_e, cx) => s.act("filter", name, cx))
      .child(FILTER_NAMES[name])
      .child(div().text_color(t.dim).child(String(counts[name])));
  }));
}

const TAB_TIPS = {
  now: "What waits for you: claims to verify, issues that need you, open notes, what you just filed",
  filed: "Issues still open on GitHub, with Fix in new tab",
  done: "Solved notes and issues closed on GitHub, the last 30 days",
  binned: "Binned notes, the last 30 days, with Restore",
};

function offLine(s) {
  const { t } = s;
  return div().flex_none().mx(12).mt(10).px(14).py(10).rounded(8).bg(t.raised).text_size(12).text_color(t.muted).whitespace_normal()
    .child(`Collecting is off for ${s.answer?.project?.name}: its new sessions never hear of the box, and an agent that is already running is told to carry on.`);
}

// Now: what waits for you, in the order it asks for you. The open note you picked (the newest until
// you pick another) is a card with its buttons; the others are one quiet line each.
function nowView(s, now) {
  const { t, answer } = s;
  if (s.noProject) return messageCard(t, "no-box", "No box here", s.noProject);
  if (!answer) return div().px(8).py(10).text_size(12).text_color(t.dim).child("Opening the box…");
  if (!answer.project) return messageCard(t, "no-box", "No box here", "No git repo in this space, so there is no box here.");
  const { toVerify, needs, open, justFiled } = now;
  if (!toVerify.length && !open.length && !needs.length && !justFiled.length && !s.undo) {
    return (answer.history ?? []).length
      ? messageCard(t, "empty", `Nothing waits in ${answer.project.name}'s box`, "Filed, done and binned notes are under the filters above. Agents drop a new note here when they spot a problem outside their ticket.", { withBox: true })
      : messageCard(t, "empty", `Nothing in ${answer.project.name}'s box yet`, "Agents drop a note here when they spot a problem outside their ticket. You check it against the code, file it as an issue, or bin it.", { withBox: true });
  }
  const group = (name, notes, draw) => notes.length ? [groupTitle(t, `${name.toUpperCase()} · ${notes.length}`), ...notes.map(draw)] : [];
  const picked = pickedOpen(s, open);
  const openNote = (n) => (s.editor?.id === n.id ? editorCard(s, n, s.editor) : n.id === picked ? noteCard(s, n) : openRow(s, n));
  return v_flex().gap(12).children([
    ...group("To verify", toVerify, (n) => verifyCard(s, n)),
    ...group("Needs you", needs, (n) => filedCard(s, n)),
    ...(s.undo ? [undoRow(s, s.undo)] : []),
    ...(open.length ? [groupTitle(t, `OPEN · ${open.length}`), v_flex().gap(6).children(open.map(openNote))] : []),
    ...group("Just filed", justFiled, (n) => filedCard(s, n)),
  ]);
}

// The open note shown as a card: the one you picked, else the newest. While a note is being filed
// its editor is the one card.
function pickedOpen(s, open) {
  if (s.editor) return null;
  if (open.some((note) => note.id === s.selected)) return s.selected;
  return open[0]?.id ?? null;
}

function undoRow(s, note) {
  const { t } = s;
  return h_flex().id(`undo:${note.id}`).px(14).py(10).gap(10).rounded(8).bg(t.raised).items_center().text_size(12.5).text_color(t.muted)
    .child(div().flex_1().min_w(0).truncate().child(`Binned: ${note.title}`))
    .child(div().id(`undo-button:${note.id}`).flex_none().h(28).px(12).flex().items_center().rounded(6).border(1).border_color(t.border).bg(t.background).cursor_pointer()
      .hover((st) => st.bg(t.hover)).on_click((_e, cx) => s.act("undo", note, cx)).child("Undo"));
}

// The keys of the note you picked, so the line fits: only what that note can do. Picking and opening
// are in its hover text, and with nothing to pick there is no hint at all.
const KEYS = { file: "f file", check: "k check", "mark-solved": "s solved", bin: "x bin", confirm: "c confirm", "not-solved": "n not solved" };

function hintsFor(s, filter) {
  if (s.view === "settings") return { text: "esc back" };
  if (filter !== "now") return { text: "esc back to Now", tip: "1 Now · 2 Filed · 3 Done · 4 Binned" };
  if (s.editor) return { text: "esc leaves a field · again closes, the draft is kept" };
  // The keys reach the notes of the list: To verify and Open.
  const notes = (s.answer?.notes ?? []).filter((one) => one.state === "open" || one.state === "to verify");
  const note = notes.find((one) => one.id === s.selected);
  const actions = (note?.actions ?? []).filter((a) => a !== "confirm" || canConfirm(s.proofs?.get(claimKey(note))));
  const keys = [...actions.map((a) => KEYS[a]).filter(Boolean), s.undo ? "u undo" : null].filter(Boolean);
  return {
    text: keys.length ? keys.join(" · ") : notes.length ? "↑↓ pick a note" : "",
    tip: notes.length ? "↑↓ picks a note · enter opens it · 1–4 pick a filter · esc closes the panel" : null,
  };
}

// The keys of the picked note, or of the filter shown; no footer when there are none.
function footer(s, { text, tip }) {
  const { t } = s;
  return h_flex().flex_none().h(36).px(16).items_center().border_t(1).border_color(t.border).text_size(11.5).text_color(t.dim)
    .child(div().id("keys").flex_1().min_w(0).truncate().text_right().when(Boolean(tip), (el) => el.tooltip(tip)).child(text));
}
