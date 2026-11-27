// The parts every card of the panel is built from: the card itself, its lines, its buttons, chips,
// switches and links, and the box's pixel icon.
import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

// The pixel box, drawn by scripts/make-icon.js: in colour, and grey while collecting is off. An image
// through the mod's link draws (as Parrot's does); an SVG through it does not.
export const ICON = "mods/suggestion-box/icons/box.png";

export const ICON_OFF = "mods/suggestion-box/icons/box-off.png";

const ICON_LARGE = "mods/suggestion-box/icons/box-large.png";

export const stop = (_e, cx) => cx.stop_propagation();

export function toggle(t, id, label, isOn, tip, onClick) {
  const track = div().relative().w(26).h(15).rounded(8).bg(isOn ? t.ansi2 : t.border)
    .child(div().absolute().top(2).left(isOn ? 13 : 2).size(11).rounded(6).bg(t.background).transition("left", 150));
  return h_flex().id(id).flex_none().gap(6).items_center().cursor_pointer().text_size(11.5).text_color(t.muted)
    .tooltip(tip).on_click(onClick).child(label).child(track);
}

export function iconButton(t, id, icon, tip, onClick, isOn = false) {
  return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(isOn ? t.foreground : t.muted).when(isOn, (el) => el.bg(t.selected))
    .hover((st) => st.bg(t.hover).text_color(t.foreground)).cursor_pointer().tooltip(tip).on_click(onClick).child(icon);
}

// The card every part of the panel is drawn in, as Settings' Collecting everywhere: raised, with room
// around its words. A selected card gets an outline; a claim keeps its green one, and shows it is
// selected by a lighter fill.
export function card(t, id, { isSelected = false, edge = null } = {}) {
  return v_flex().id(id).px(12).py(10).gap(6).rounded(8).bg(isSelected && edge ? t.hover : t.raised).border(1).border_color(edge ?? (isSelected ? t.input : t.raised));
}

// The line under a card's title: where, which ticket, how long ago, how it stands.
// A wrapped part sits close under the first, as the next line of the same sentence.
export const metaRow = (t) => h_flex().flex_wrap().gap_x(8).gap_y(2).items_center().text_size(11.5).text_color(t.muted);

export const groupTitle = (t, text) => div().px(4).pt(8).pb(2).text_size(10.5).font_medium().text_color(t.dim).child(text);

// A card that only says something: a title, and calm words under it; the empty box shows the box.
export function messageCard(t, id, title, words, { withBox = false } = {}) {
  const text = v_flex().flex_1().min_w(0).gap(6).child(div().font_medium().whitespace_normal().child(title)).child(div().text_size(12).text_color(t.muted).whitespace_normal().child(words));
  return card(t, id).child(withBox ? h_flex().gap(12).items_start().child(image(ICON_LARGE).w(32).h(32).flex_none().mt(2)).child(text) : text);
}

// A card's buttons: Bin quiet on the far left, away from the others; the main action filled, last.
const QUIET = ["bin"];

export function actionsRow(s, note, { primary = null, isBusy = () => false, leave = [] } = {}) {
  const { t } = s;
  const actions = note.actions.filter((a) => !leave.includes(a));
  if (!actions.length) return div();
  const rest = actions.filter((a) => !QUIET.includes(a));
  const ordered = [...rest.filter((a) => a !== primary), ...rest.filter((a) => a === primary)];
  return h_flex().gap(6).items_center().pt(2)
    .children(actions.filter((a) => QUIET.includes(a)).map((a) => quietButton(t, note, a, s.act)))
    .child(div().flex_1())
    .children(ordered.map((a) => actionButton(t, note, a, s.act, a === primary, isBusy(a))));
}

function quietButton(t, note, action, act) {
  return div().id(`${action}:${note.id}`).flex_none().h(24).px(8).flex().items_center().rounded(6).text_size(12).text_color(t.muted).cursor_pointer()
    .hover((st) => st.bg(t.hover).text_color(t.foreground))
    .tooltip(action === "bin" ? "Bin: take the note away (Undo for a few seconds, Restore in the history)" : LABELS[action])
    .on_click((_e, cx) => act(action, note, cx))
    .child(LABELS[action]);
}

const LABELS = { check: "Check", "mark-solved": "Mark solved", file: "File issue", bin: "Bin", confirm: "Confirm solved", "not-solved": "Not solved", reopen: "Reopen", restore: "Restore", fix: "Fix in new tab" };

const BUSY = { check: "Checking…", fix: "Starting the tab…" };

// What each button does, on hover. The check says who does it: your own Claude, read-only.
const TIPS = {
  check: "Your own Claude (Sonnet, read-only) checks this note against the code on main and on its branch",
  "check-again": "Check again: your own Claude reads the code anew, also when it did not change",
  file: "Turn it into a GitHub issue: you see and edit the text first, nothing is created until you press Create issue",
  "mark-solved": "It is solved already: the note waits in To verify until you confirm it",
  confirm: "The fix holds: the note leaves the box, and the box watches until the fix lands in main",
  "not-solved": "The claim goes; the note is back where it was",
  reopen: "Back to the open notes",
  restore: "Back to the open notes",
  fix: "Start this issue as a ticket in a new tab, through the parallel-tickets launcher",
};

export function actionButton(t, note, action, act, isPrimary = false, isBusy = false) {
  if (isBusy) {
    return div().id(`${action}:${note.id}`).flex_none().h(24).px(10).flex().items_center().rounded(6).text_size(12).text_color(t.muted)
      .border(1).border_color(t.border).child(h_flex().gap(6).items_center().child(svg("mods/workspace-chrome/spinner.svg").size(12).spin(900)).child(BUSY[action] ?? "Working…"));
  }
  const isAgain = action === "check" && note.check && !note.check.error;
  const label = isAgain ? "Check again" : LABELS[action];
  return div().id(`${action}:${note.id}`).flex_none().h(24).px(10).flex().items_center().rounded(6).text_size(12).font_medium().cursor_pointer()
    .tooltip(TIPS[isAgain ? "check-again" : action] ?? label)
    .bg(isPrimary ? t.solid : t.background).text_color(isPrimary ? t.solid_foreground : t.foreground).border(1).border_color(isPrimary ? t.solid : t.border)
    .hover((st) => st.bg(isPrimary ? t.solid : t.hover))
    .on_click((_e, cx) => act(action, note, cx))
    .child(label);
}

// A small text button: Start over, Use the agent's text, Fine to publish, Copy. Plain text that
// underlines on hover: colour stays for what needs you (amber) and how things stand.
export function link(t, id, text, onClick, color = t.foreground) {
  return div().id(id).flex_none().text_size(11.5).text_color(color).cursor_pointer().hover((st) => st.underline()).on_click(onClick).child(text);
}

export function plainButton(t, id, text, onClick, { isPrimary = false, isOff = false } = {}) {
  return div().id(id).flex_none().h(24).px(10).flex().items_center().rounded(6).text_size(12).font_medium()
    .bg(isPrimary ? t.solid : t.background).text_color(isPrimary ? t.solid_foreground : t.foreground).border(1).border_color(isPrimary ? t.solid : t.border)
    .when(isOff, (el) => el.opacity(0.45))
    .when(!isOff, (el) => el.cursor_pointer().hover((st) => st.bg(isPrimary ? t.solid : t.hover)).on_click(onClick))
    .child(text);
}

// The dot of a next step, the same in every group: amber needs you, blue under way (ANSI blue, as
// the theme's accent can be orange), green ready or landed, grey done.
export function stepColor(t, kind) {
  return { needs: t.working, working: t.ansi4, ready: t.ansi2, done: t.dim }[kind];
}

export function chip(t, text, color) {
  return div().flex_none().px(6).rounded(8).text_size(11).border(1).border_color(color).text_color(color).child(text);
}
