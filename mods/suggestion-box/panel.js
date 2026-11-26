// How the suggestion box looks: the tab bar's button and the panel on the right. Only drawing; what
// a click does comes in as `act`, from main.js.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { SECTION_LABELS, SECTIONS } from "./notes.js";

export const ICON = "mods/workspace-chrome/archive.svg";
const stop = (_e, cx) => cx.stop_propagation();

// The button, drawn as the tab bar draws Files, Changes and Quarterdeck: the box icon, "Box", the
// open count and a green ✓ for notes to verify. Dim without a box here; "off" while collecting is.
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
    .child(svg(ICON).size(14).when(isOff, (el) => el.opacity(0.5)))
    .child("Box")
    .when(isOff, (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child("off")))
    .when(open > 0, (el) => el.child(pill(String(open), t.done)))
    .when(toVerify > 0, (el) => el.child(pill(`✓${toVerify}`, t.ansi2)));
  return h_flex().size_full().pr(10).items_center().justify_end().bg(t.chrome).border_b(1).border_color(t.border).child(face);
}

// The panel: a header with the switches, the notes by state, and a footer.
export function panel(s) {
  const { t } = s;
  return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13).text_color(t.foreground)
    .child(header(s))
    .when(Boolean(s.collecting && !s.collecting.project), (el) => el.child(offLine(s)))
    .when(s.showSettings, (el) => el.child(settingsLine(s)))
    .when(Boolean(s.notice), (el) => el.child(div().flex_none().mx(10).mt(8).px(10).py(7).rounded(8).text_size(12).bg(t.raised).border(1).border_color(t.border).child(s.notice)))
    .when(Boolean(s.error), (el) => el.child(div().flex_none().px(14).py(6).text_size(12).text_color(t.blocked).child(s.error)))
    .child(div().id("sbox-list").flex_1().min_h(0).overflow_y_scrollbar().px(8).py(6).child(s.view === "history" ? history(s) : groups(s)))
    .child(footer(s));
}

function header(s) {
  const { t, answer } = s;
  const name = answer?.project?.name ?? "";
  const counts = answer?.counts;
  const sum = counts ? [counts.open ? `${counts.open} open` : "", counts.toVerify ? `${counts.toVerify} to verify` : ""].filter(Boolean).join(" · ") || "empty" : "";
  return h_flex().h(42).flex_none().pl(14).pr(6).gap(8).items_center().border_b(1).border_color(t.border)
    .child(div().flex_none().font_semibold().child("Suggestion box"))
    .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(name ? `· ${name}` : ""))
    .child(div().flex_none().text_size(11.5).text_color(t.dim).child(sum))
    .when(Boolean(s.collecting), (el) => el.child(toggle(t, "collect", "Collecting", s.collecting.project, `Collecting notes for ${name}`, (_e, cx) => s.act("collect", null, cx))))
    .child(iconButton(t, "settings", svg("mods/workspace-chrome/settings.svg").size(14), "Collecting for all projects", (_e, cx) => s.act("settings", null, cx)))
    .child(iconButton(t, "close", svg("mods/workspace-chrome/x.svg").size(14), "Close (⌥⌘S)", (_e, cx) => s.act("close", null, cx)));
}

function toggle(t, id, label, isOn, tip, onClick) {
  const track = div().relative().w(26).h(15).rounded(8).bg(isOn ? t.ansi2 : t.border)
    .child(div().absolute().top(2).left(isOn ? 13 : 2).size(11).rounded(6).bg(t.background).transition("left", 150));
  return h_flex().id(id).flex_none().gap(6).items_center().cursor_pointer().text_size(11.5).text_color(t.muted)
    .tooltip(tip).on_click(onClick).child(label).child(track);
}

function iconButton(t, id, icon, tip, onClick) {
  return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted)
    .hover((st) => st.bg(t.hover).text_color(t.foreground)).cursor_pointer().tooltip(tip).on_click(onClick).child(icon);
}

function offLine(s) {
  const { t } = s;
  return div().flex_none().px(14).py(6).text_size(12).text_color(t.muted).bg(t.raised).border_b(1).border_color(t.border)
    .child(`Collecting off for ${s.answer?.project?.name}: new sessions don't hear of the box; a running agent that tries is told to carry on.`);
}

function settingsLine(s) {
  const { t } = s;
  return h_flex().flex_none().px(14).py(8).gap(8).items_center().bg(t.raised).border_b(1).border_color(t.border)
    .child(div().flex_1().text_size(12).text_color(t.muted).child("Collecting for all projects"))
    .child(toggle(t, "collect-all", s.collecting?.all ? "On" : "Off", Boolean(s.collecting?.all), "Turn collecting off or on everywhere", (_e, cx) => s.act("collect-all", null, cx)));
}

function groups(s) {
  const { t, answer } = s;
  if (s.noProject) return div().px(8).py(10).text_size(12).text_color(t.dim).child(s.noProject);
  if (!answer) return div().px(8).py(10).text_size(12).text_color(t.dim).child("Opening the box…");
  if (!answer.project) return div().px(8).py(10).text_size(12).text_color(t.dim).child(s.noProject ?? "No git repo in this space, so there is no box here.");
  const toVerify = answer.notes.filter((n) => n.state === "to verify");
  const open = answer.notes.filter((n) => n.state === "open");
  const filed = answer.notes.filter((n) => n.state === "filed" && s.justFiled?.has(n.id));
  if (!toVerify.length && !open.length && !filed.length && !s.undo) {
    return div().px(8).py(10).text_size(12).text_color(t.dim).child(`Nothing in ${answer.project.name}'s box. Agents drop notes here when they spot a problem outside their ticket.`);
  }
  const group = (name, notes, draw) => notes.length
    ? [div().px(4).pt(10).pb(4).text_size(10.5).font_medium().text_color(t.dim).child(`${name.toUpperCase()} · ${notes.length}`), ...notes.map(draw)]
    : [];
  return v_flex().gap(4).children([
    ...group("To verify", toVerify, (n) => verifyCard(s, n)),
    ...(s.undo ? [undoRow(s, s.undo)] : []),
    ...group("Open", open, (n) => noteCard(s, n)),
    ...group("Just filed", filed, (n) => noteCard(s, n)),
  ]);
}

const LABELS = { "mark-solved": "Mark solved", file: "File issue", bin: "Bin", confirm: "Confirm solved", "not-solved": "Not solved", reopen: "Reopen", restore: "Restore", fix: "Fix in new tab" };

function actionButton(t, note, action, act, isPrimary = false) {
  return div().id(`${action}:${note.id}`).flex_none().h(24).px(10).flex().items_center().rounded(6).text_size(12).font_medium().cursor_pointer()
    .bg(isPrimary ? t.solid : t.background).text_color(isPrimary ? t.solid_foreground : t.foreground).border(1).border_color(isPrimary ? t.solid : t.border)
    .hover((st) => st.bg(isPrimary ? t.solid : t.hover))
    .on_click((_e, cx) => act(action, note, cx))
    .child(LABELS[action]);
}

function chip(t, text, color) {
  return div().flex_none().px(6).rounded(8).text_size(11).border(1).border_color(color).text_color(color).child(text);
}

function noteCard(s, note) {
  const { t } = s;
  const isSelected = s.selected === note.id;
  const isOpen = s.expanded.has(note.id);
  const where = note.at ? `${note.at.path.split("/").pop()}${note.at.line ? `:${note.at.line}` : ""}` : null;
  return v_flex().id(`note:${note.id}`).px(10).py(8).gap(5).rounded(8).border(1)
    .border_color(isSelected ? t.input : t.chrome).bg(s.fresh?.has(note.id) ? t.raised : t.chrome).hover((st) => st.bg(t.hover))
    .child(div().id(`title:${note.id}`).font_medium().cursor_pointer().whitespace_normal().on_click((_e, cx) => s.act("expand", note, cx)).child(note.title))
    .child(h_flex().flex_wrap().gap(8).items_center().text_size(11.5).text_color(t.muted)
      .when(Boolean(where), (el) => el.child(div().id(`file:${note.id}`).text_color(t.accent).cursor_pointer().tooltip(`Open ${note.at.path} in Cursor`).on_click((_e, cx) => s.act("open-file", note, cx)).child(where)))
      .when(Boolean(note.from?.ticket), (el) => el.child(div().id(`ticket:${note.id}`).cursor_pointer().tooltip("Its tab, or the ticket on GitHub").on_click((_e, cx) => s.act("jump", note, cx)).child(`#${note.from.ticket}`)))
      .child(div().child(note.age))
      .when(note.spotted > 1, (el) => el.child(div().text_color(t.working).child(`${note.spotted}×`)))
      .when(Boolean(note.changed), (el) => el.child(chip(t, note.changed?.kind === "removed" ? "file removed" : `changed on ${note.changed?.on}`, t.working)))
      .when(Boolean(note.notVerified), (el) => el.child(chip(t, `claimed on ${note.notVerified?.branch}, not verified`, t.working)))
      .when(Boolean(note.reopened), (el) => el.child(chip(t, note.reopened?.by === "you" ? "reopened" : "spotted again after it was solved", t.blocked)))
      .when(note.state === "filed", (el) => el.child(chip(t, `filed #${note.issue?.number}`, t.ansi2))))
    .when(isOpen, (el) => el.child(sections(t, note)))
    .when(note.actions.length > 0, (el) => el.child(h_flex().gap(6).justify_end().children(note.actions.map((a) => actionButton(t, note, a, s.act)))));
}

function sections(t, note) {
  return v_flex().gap(4).pl(8).border_l(2).border_color(t.border).text_size(12.5)
    .children(SECTIONS.map((name) => v_flex().gap(1)
      .child(div().text_size(10.5).font_medium().text_color(t.dim).child(SECTION_LABELS[name].toUpperCase()))
      .child(div().whitespace_normal().text_color(t.muted).child(note.sections?.[name] ?? ""))));
}

function verifyCard(s, note) {
  const { t } = s;
  const claim = note.solved ?? {};
  const isSelected = s.selected === note.id;
  return v_flex().id(`note:${note.id}`).px(10).py(8).gap(5).rounded(8).border(1).border_color(isSelected ? t.input : t.border).bg(t.raised)
    .child(div().font_medium().whitespace_normal().child(note.title))
    .child(div().text_size(11.5).text_color(t.muted).child(`note ${note.number} · claimed by ${claim.by === "you" ? "you" : "an agent"} on ${claim.branch ?? "a branch"}`))
    .child(v_flex().gap(2).pl(8).border_l(2).border_color(t.border).text_size(12)
      .child(div().whitespace_normal().child(claim.how ?? ""))
      .when(Boolean(claim.proof), (el) => el.child(div().whitespace_normal().text_color(t.muted).child(`proof: ${claim.proof}`))))
    .child(h_flex().gap(6).justify_end().children(note.actions.map((a) => actionButton(t, note, a, s.act, a === "confirm"))));
}

function undoRow(s, note) {
  const { t } = s;
  return h_flex().id(`undo:${note.id}`).px(10).py(8).gap(8).rounded(8).bg(t.raised).items_center().text_size(12.5).text_color(t.muted)
    .child(div().flex_1().min_w(0).truncate().child(`Binned: ${note.title}`))
    .child(div().id(`undo-button:${note.id}`).flex_none().h(24).px(10).flex().items_center().rounded(6).border(1).border_color(t.border).cursor_pointer()
      .hover((st) => st.bg(t.hover)).on_click((_e, cx) => s.act("undo", note, cx)).child("Undo"));
}

function history(s) {
  const { t, answer } = s;
  const notes = answer?.history ?? [];
  if (!notes.length) return div().px(8).py(10).text_size(12).text_color(t.dim).child("Nothing filed, solved or binned in the last 30 days.");
  return v_flex().gap(4).children(notes.map((note) => {
    const what = note.state === "binned" ? "Binned" : note.state === "solved" ? `Solved on ${note.solved?.branch ?? "a branch"}` : `Filed #${note.issue?.number}`;
    return v_flex().id(`past:${note.id}`).px(10).py(8).gap(4).rounded(8).hover((st) => st.bg(t.hover))
      .child(div().font_medium().whitespace_normal().child(note.title))
      .child(h_flex().gap(8).text_size(11.5).text_color(t.muted).child(what).child(note.age))
      .when(Boolean(note.solved?.how), (el) => el.child(div().pl(8).border_l(2).border_color(t.border).text_size(12).text_color(t.muted).whitespace_normal().child(note.solved.how)))
      .when(note.actions.length > 0, (el) => el.child(h_flex().gap(6).justify_end().children(note.actions.map((a) => actionButton(t, note, a, s.act)))));
  }));
}

function footer(s) {
  const { t, answer } = s;
  const past = answer?.history ?? [];
  const count = (state) => past.filter((n) => n.state === state).length;
  const hints = s.view === "history" ? "esc back" : "↑↓ pick · enter open · s solved · x bin · u undo · c confirm · n not solved";
  return h_flex().flex_none().h(30).px(12).gap(8).items_center().border_t(1).border_color(t.border).text_size(11.5).text_color(t.dim)
    .child(div().id("history").flex_none().cursor_pointer().hover((st) => st.text_color(t.foreground)).on_click((_e, cx) => s.act("history", null, cx))
      .child(s.view === "history" ? "◂ Back to the notes" : `Filed ${count("filed")} · Solved ${count("solved")} · Binned ${count("binned")} ▸`))
    .child(div().flex_1())
    .child(div().flex_none().truncate().child(hints));
}
