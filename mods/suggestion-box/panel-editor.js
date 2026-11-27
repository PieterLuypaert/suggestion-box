// File issue: the note as an editor in place, its fields with the check's labels, the scan, the
// target, similar issues, and Create issue.
import { div, svg } from "gpui-kit";
import { h_flex, Input, Textarea, v_flex } from "gpui-base";
import { checkedSummary } from "./check.js";
import { SECTION_LABELS, SECTIONS } from "./notes.js";
import { checkedLine } from "./panel-note.js";
import { chip, link, plainButton } from "./panel-parts.js";

const FIELD_LABELS = { checking: "Checking…", "not-checked": "Not checked", checked: "Checked", corrected: "Corrected", agent: "The agent's text", unsure: "Unsure" };

// File issue: the note as an editor in place. The title and the four sections as fields with the
// check's label on each, what the scan found, where the issue goes, similar open issues, and Create
// issue with the one line that says why it is off.
export function editorCard(s, note, ed) {
  const { t } = s;
  const act = (name, what = note) => (_e, cx) => s.act(`editor-${name}`, what, cx);
  return v_flex().id(`editor:${note.id}`).px(12).py(10).gap(8).rounded(8).border(1).border_color(t.input).bg(t.raised)
    .child(h_flex().gap(8).items_center().text_size(11.5).text_color(t.muted)
      .child(div().flex_1().min_w(0).truncate().child(`Filing note ${note.number}`))
      .when(ed.canStartOver, (el) => el.child(link(t, `start-over:${note.id}`, "Start over", act("start-over")))))
    .when(!ed.isChecking && Boolean(checkedSummary(note.check)), (el) => el.child(checkedLine(t, note)))
    .when(ed.isChecking, (el) => el.child(h_flex().gap(6).items_center().text_size(12).text_color(t.muted)
      .child(svg("mods/workspace-chrome/spinner.svg").size(12).spin(900)).child("Checking the note against the code…")))
    .when(Boolean(ed.checkError), (el) => el.child(h_flex().gap(8).items_start().text_size(12)
      .child(div().flex_1().whitespace_normal().text_color(t.blocked).child(`Not checked: ${ed.checkError}`))
      .child(link(t, `check-again:${note.id}`, "Check again", (_e, cx) => s.act("check", note, cx)))))
    .when(Boolean(ed.gone), (el) => el.child(editorGone(s, note, ed)))
    .child(field(t, "Title", Input.new(ed.fields.title).h(30).px(8).rounded(6).border(1).border_color(t.border).bg(t.background).text_size(13), null, !ed.texts.title.trim()))
    .children(SECTIONS.map((name) => sectionField(s, note, ed, name)))
    .when(ed.hits.length > 0, (el) => el.child(hitList(s, note, ed)))
    .child(div().text_size(11.5).text_color(t.muted).whitespace_normal().child(ed.line))
    .when(ed.similar === null, (el) => el.child(div().text_size(11.5).text_color(t.dim).child("Could not look for similar issues")))
    .when(Boolean(ed.similar?.length), (el) => el.child(v_flex().gap(2).text_size(11.5)
      .child(div().text_color(t.dim).child("Similar open issues"))
      .children((ed.similar ?? []).map((issue) => link(t, `similar:${issue.number}`, `#${issue.number} ${issue.title} ↗`, (_e, cx) => s.act("open-url", issue, cx), t.foreground)))))
    .child(h_flex().gap(6).justify_end()
      .child(plainButton(t, `cancel:${note.id}`, "Cancel", act("cancel")))
      .child(ed.canCopy
        ? plainButton(t, `copy-issue:${note.id}`, "Copy issue", act("copy"), { isPrimary: true, isOff: Boolean(ed.off) })
        : plainButton(t, `create:${note.id}`, ed.isFiling ? "Creating…" : "Create issue", act("create"), { isPrimary: true, isOff: Boolean(ed.off) })))
    .when(Boolean(ed.off), (el) => el.child(div().text_size(11.5).text_color(t.dim).whitespace_normal().text_right().child(ed.off)))
    .when(Boolean(ed.error), (el) => el.child(div().text_size(12).text_color(t.blocked).whitespace_normal().child(ed.error)));
}

function field(t, label, input, chipEl, isEmpty) {
  return v_flex().gap(3)
    .child(h_flex().gap(6).items_center().child(div().text_size(10.5).font_medium().text_color(t.dim).child(label.toUpperCase())).when(Boolean(chipEl), (el) => el.child(chipEl)))
    .child(input)
    .when(isEmpty, (el) => el.child(div().text_size(11.5).text_color(t.working).child("Fill this in before creating")));
}

function sectionField(s, note, ed, name) {
  const { t } = s;
  const label = ed.labels[name];
  const colors = { checking: t.dim, "not-checked": t.dim, checked: t.ansi2, corrected: t.ansi4, agent: t.muted, unsure: t.working };
  const input = Textarea.new(ed.fields[name]).w_full().px(8).py(6).rounded(6).border(1).border_color(t.border).bg(t.background).text_size(12.5);
  return field(t, SECTION_LABELS[name], input, label ? chip(t, FIELD_LABELS[label.label], colors[label.label]) : null, !ed.texts.sections[name].trim())
    .when(Boolean(label?.swap), (el) => el.child(link(t, `swap:${note.id}:${name}`, label.swap === "agent" ? "Use the agent's text" : "Use Claude's text", (_e, cx) => s.act("editor-swap", { section: name, to: label.swap }, cx))))
    .when(Boolean(label?.question), (el) => el.child(div().text_size(11.5).text_color(t.working).whitespace_normal().child(label.question)));
}

// The check says the problem is gone: no issue for done work, unless you say it is not solved.
function editorGone(s, note, ed) {
  const { t } = s;
  const gone = ed.gone;
  if (ed.notGone) {
    return v_flex().gap(6).px(10).py(8).rounded(6).border(1).border_color(t.border)
      .child(h_flex().gap(8).items_center().text_size(12)
        .child(div().flex_1().whitespace_normal().text_color(t.muted).child(`The check said it looks solved on ${gone.on}; you said it is not.`))
        .child(link(t, `take-back:${note.id}`, "Take back", (_e, cx) => s.act("editor-take-back", note, cx))))
      .when(Boolean(ed.reason), (el) => el.child(Input.new(ed.reason).h(28).px(8).rounded(6).border(1).border_color(t.border).bg(t.background).text_size(12)));
  }
  return v_flex().gap(6).px(10).py(8).rounded(6).border(1).border_color(t.working).bg(t.chrome)
    .child(div().text_size(12.5).whitespace_normal().child(`Looks solved on ${gone.on}: ${gone.why}`))
    .child(h_flex().gap(6).justify_end()
      .child(plainButton(t, `editor-gone-solved:${note.id}`, "Mark solved", (_e, cx) => s.act("mark-solved-gone", note, cx), { isPrimary: true }))
      .child(plainButton(t, `editor-gone-bin:${note.id}`, "Bin", (_e, cx) => s.act("bin", note, cx)))
      .child(plainButton(t, `not-gone:${note.id}`, "It is not solved", (_e, cx) => s.act("editor-not-gone", note, cx))));
}

// What the scan found: a token must go; anything else can be marked fine to publish.
function hitList(s, note, ed) {
  const { t } = s;
  return v_flex().gap(3).px(10).py(8).rounded(6).border(1).border_color(t.blocked).text_size(12)
    .child(div().text_size(10.5).font_medium().text_color(t.dim).child("BEFORE THIS GOES OUT"))
    .children(ed.hits.map((hit, i) => h_flex().gap(8).items_center()
      .child(div().flex_1().min_w(0).truncate().text_color(hit.blocking ? t.blocked : t.foreground).child(`${hit.blocking ? "Remove " : ""}${hit.kind}: ${hit.text}`))
      .when(!hit.blocking && hit.isFine, (el) => el.child(chip(t, "fine", t.ansi2)))
      .when(!hit.blocking && !hit.isFine, (el) => el.child(link(t, `fine:${note.id}:${i}`, "Fine to publish", (_e, cx) => s.act("editor-fine", { hit: hit.text }, cx))))));
}
