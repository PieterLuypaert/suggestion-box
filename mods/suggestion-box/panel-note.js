// An open note's card: its title, where and when, the check's line and banner, its four sections.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { checkedSummary } from "./check.js";
import { SECTION_LABELS, SECTIONS } from "./notes.js";
import { actionsRow, card, chip, metaRow } from "./panel-parts.js";

export function noteCard(s, note) {
  const { t } = s;
  const isOpen = s.expanded.has(note.id);
  const where = note.at ? `${note.at.path.split("/").pop()}${note.at.line ? `:${note.at.line}` : ""}` : null;
  return card(t, `note:${note.id}`, { isSelected: s.selected === note.id })
    .child(div().id(`title:${note.id}`).font_medium().cursor_pointer().whitespace_normal().tooltip(isOpen ? "Close its sections" : "Open its four sections").on_click((_e, cx) => s.act("expand", note, cx)).child(note.title))
    .child(metaRow(t)
      .when(Boolean(where), (el) => el.child(div().id(`at:${note.id}`).text_color(t.accent).cursor_pointer().tooltip(`Open ${note.at.path} in Cursor`).on_click((_e, cx) => s.act("open-file", note, cx)).child(where)))
      .when(Boolean(note.from?.ticket), (el) => el.child(div().id(`ticket:${note.id}`).cursor_pointer().tooltip("Its tab, or the ticket on GitHub").on_click((_e, cx) => s.act("jump", note, cx)).child(`#${note.from.ticket}`)))
      .child(div().child(note.age))
      .when(note.spotted > 1, (el) => el.child(div().text_color(t.working).child(`seen ${note.spotted}×`)))
      .when(Boolean(note.changed), (el) => el.child(chip(t, note.changed?.kind === "removed" ? "file removed" : `changed on ${note.changed?.on}`, t.working)))
      .when(Boolean(note.notVerified), (el) => el.child(chip(t, `claimed on ${note.notVerified?.branch}, not verified`, t.working)))
      .when(Boolean(note.reopened), (el) => el.child(chip(t, note.reopened?.by === "you" ? "reopened" : "spotted again after it was solved", t.blocked)))
      .when(note.state === "filed", (el) => el.child(chip(t, `filed #${note.issue?.number}`, t.ansi2))))
    .when(Boolean(checkedSummary(note.check)) && !isChecking(s, note), (el) => el.child(checkedLine(t, note)))
    .when(Boolean(note.check?.error) && !isChecking(s, note), (el) => el.child(div().text_size(12).text_color(t.blocked).whitespace_normal().child(`Not checked: ${note.check.error}`)))
    .when(hasGoneBanner(s, note), (el) => el.child(goneBanner(s, note)))
    .when(isOpen || isChecking(s, note), (el) => el.child(sections(t, note, isChecking(s, note))))
    .when(note.actions.length > 0, (el) => el.child(actionsRow(s, note, { primary: "file", isBusy: (a) => a === "check" && isChecking(s, note), leave: hasGoneBanner(s, note) ? ["bin"] : [] })));
}

// The check says the problem is gone: its banner holds Mark solved and Bin.
const hasGoneBanner = (s, note) => Boolean(note.check?.gone) && note.state === "open" && !isChecking(s, note);

const isChecking = (s, note) => Boolean(s.checking?.has(note.id));

// Who checked the note, when, and what it found, so that shows without opening it.
export function checkedLine(t, note) {
  return h_flex().gap(6).items_center().text_size(11.5).text_color(t.muted)
    .child(div().flex_none().size(6).rounded(3).bg(note.check?.gone ? t.working : t.ansi2))
    .child(div().min_w(0).whitespace_normal().child(checkedSummary(note.check)));
}

const VERDICT_LABELS = { checked: "Checked", corrected: "Corrected", unsure: "Unsure" };

// The four sections, each with what the check said about it: Checked, Corrected (Claude's text,
// the agent's under it) or Unsure (the agent's text, Claude's question under it).
function sections(t, note, isBusy = false) {
  const verdicts = !isBusy && note.check?.sections ? note.check.sections : null;
  const colors = { checked: t.ansi2, corrected: t.accent, unsure: t.working };
  return v_flex().gap(6).pl(8).border_l(2).border_color(t.border).text_size(12.5)
    .children(SECTIONS.map((name) => {
      const verdict = verdicts?.[name];
      const label = isBusy ? chip(t, "Checking…", t.dim) : verdict ? chip(t, VERDICT_LABELS[verdict.verdict], colors[verdict.verdict]) : null;
      const text = verdict?.verdict === "corrected" ? verdict.text : note.sections?.[name] ?? "";
      return v_flex().gap(2)
        .child(h_flex().gap(6).items_center().child(div().text_size(10.5).font_medium().text_color(t.dim).child(SECTION_LABELS[name].toUpperCase())).when(Boolean(label), (el) => el.child(label)))
        .child(div().whitespace_normal().text_color(t.foreground).child(text))
        .when(verdict?.verdict === "corrected", (el) => el.child(div().whitespace_normal().text_size(11.5).text_color(t.dim).child(`Agent wrote: ${note.sections?.[name] ?? ""}`)))
        .when(verdict?.verdict === "unsure" && Boolean(verdict?.question), (el) => el.child(div().whitespace_normal().text_size(11.5).text_color(t.working).child(verdict.question)));
    }));
}

// The check found the problem gone: no issue for done work. Mark solved sends it to To verify.
function goneBanner(s, note) {
  const { t } = s;
  const gone = note.check.gone;
  return v_flex().gap(6).px(10).py(8).rounded(6).border(1).border_color(t.working).bg(t.chrome)
    .child(div().text_size(12.5).whitespace_normal().child(`Looks solved on ${gone.on}: ${gone.why}`))
    .child(h_flex().gap(6).items_center()
      .child(div().id(`gone-bin:${note.id}`).flex_none().h(24).px(8).flex().items_center().rounded(6).text_size(12).text_color(t.muted).cursor_pointer()
        .hover((st) => st.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => s.act("bin", note, cx)).child("Bin"))
      .child(div().flex_1())
      .child(div().id(`gone-solved:${note.id}`).flex_none().h(24).px(10).flex().items_center().rounded(6).text_size(12).font_medium().cursor_pointer()
        .bg(t.solid).text_color(t.solid_foreground).on_click((_e, cx) => s.act("mark-solved-gone", note, cx)).child("Mark solved")));
}
