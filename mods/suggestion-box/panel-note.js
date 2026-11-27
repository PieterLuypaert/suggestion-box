// An open note's card: its title, where and when, the check's line and banner, its four sections.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { checkedSummary } from "./check.js";
import { SECTION_LABELS, SECTIONS } from "./notes.js";
import { actionsRow, card, chip, link, metaRow, quietRow } from "./panel-parts.js";
import { SAID_NOT_SOLVED } from "./rules.js";

export function noteCard(s, note) {
  const { t } = s;
  const isOpen = s.expanded.has(note.id);
  const where = note.at ? `${note.at.path.split("/").pop()}${note.at.line ? `:${note.at.line}` : ""}` : null;
  return card(t, `note:${note.id}`, { isSelected: s.selected === note.id })
    .child(div().id(`title:${note.id}`).font_medium().cursor_pointer().whitespace_normal().tooltip(isOpen ? "Close its sections" : "Open its four sections").on_click((_e, cx) => s.act("expand", note, cx)).child(note.title))
    .child(metaRow(t)
      .when(Boolean(where), (el) => el.child(link(t, `at:${note.id}`, where, (_e, cx) => s.act("open-file", note, cx)).tooltip(`Open ${note.at.path} in Cursor`)))
      .when(Boolean(note.from?.ticket), (el) => el.child(link(t, `ticket:${note.id}`, `#${note.from.ticket}`, (_e, cx) => s.act("jump", note, cx), t.muted).tooltip("Its tab, or the ticket on GitHub")))
      .child(div().child(note.age))
      .when(note.spotted > 1, (el) => el.child(div().child(`seen ${note.spotted}×`)))
      .when(Boolean(note.changed), (el) => el.child(chip(t, note.changed?.kind === "removed" ? "file removed" : `changed on ${note.changed?.on}`, t.working)))
      .when(Boolean(note.notVerified), (el) => el.child(chip(t, `claimed on ${note.notVerified?.branch}, not verified`, t.working)))
      .when(Boolean(note.reopened), (el) => el.child(chip(t, note.reopened?.by === "you" ? "reopened" : "spotted again after it was solved", t.blocked)))
      .when(note.state === "filed", (el) => el.child(chip(t, `filed #${note.issue?.number}`, t.ansi2))))
    // A claim you turned down says why, so the next look starts from it.
    .when(Boolean(note.notVerified?.reason) && note.notVerified.reason !== SAID_NOT_SOLVED, (el) => el.child(div().text_size(12).text_color(t.muted).whitespace_normal().child(`Not solved: ${note.notVerified.reason}`)))
    .when(Boolean(checkedSummary(note.check)) && !isChecking(s, note), (el) => el.child(checkedLine(t, note)))
    .when(Boolean(note.check?.error) && !isChecking(s, note), (el) => el.child(div().text_size(12).text_color(t.blocked).whitespace_normal().child(`Not checked: ${note.check.error}`)))
    .when(hasGoneBanner(s, note), (el) => el.child(goneBanner(s, note)))
    .when(isOpen || isChecking(s, note), (el) => el.child(sections(t, note, isChecking(s, note))))
    .when(note.actions.length > 0, (el) => el.child(actionsRow(s, note, { primary: "file", isBusy: (a) => a === "check" && isChecking(s, note), leave: hasGoneBanner(s, note) ? ["bin"] : [] })));
}

// An open note that is not the picked one: one quiet line, amber when it asks for a look (its code
// changed, it came back, a claim on it was turned down, the check says it is gone). A click picks it,
// and it opens as its card.
export function openRow(s, note) {
  const { t } = s;
  const checking = isChecking(s, note);
  const asks = Boolean(note.changed || note.reopened || note.notVerified || note.check?.gone || note.check?.error);
  return quietRow(t, `row:${note.id}`, { color: checking ? t.ansi4 : asks ? t.working : t.dim, title: note.title, right: checking ? "checking…" : note.age, onClick: (_e, cx) => s.act("pick", note, cx), tip: "Open this note" });
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
  const colors = { checked: t.ansi2, corrected: t.ansi4, unsure: t.working };
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
  return v_flex().gap(8).px(12).py(10).rounded(6).border(1).border_color(t.working).bg(t.chrome)
    .child(div().text_size(12.5).whitespace_normal().child(`Looks solved on ${gone.on}: ${gone.why}`))
    .child(h_flex().gap(6).items_center()
      .child(div().id(`gone-bin:${note.id}`).flex_none().h(28).px(10).flex().items_center().rounded(6).text_size(12).text_color(t.muted).cursor_pointer()
        .hover((st) => st.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => s.act("bin", note, cx)).child("Bin"))
      .child(div().flex_1())
      .child(div().id(`gone-solved:${note.id}`).flex_none().h(28).px(10).flex().items_center().rounded(6).text_size(12).font_medium().cursor_pointer()
        .bg(t.solid).text_color(t.solid_foreground).on_click((_e, cx) => s.act("mark-solved-gone", note, cx)).child("Mark solved")));
}
