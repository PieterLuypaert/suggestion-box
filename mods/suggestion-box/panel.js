// How the suggestion box looks: the tab bar's button and the panel on the right. Only drawing; what
// a click does comes in as `act`, from main.js.
import { div, svg } from "gpui-kit";
import { Input, Textarea, h_flex, v_flex } from "gpui-base";
import { SECTION_LABELS, SECTIONS } from "./notes.js";

export const ICON = "mods/workspace-chrome/archive.svg";
const stop = (_e, cx) => cx.stop_propagation();

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
    .child(svg(ICON).size(14).when(isOff, (el) => el.opacity(0.5)))
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
  const filed = (answer.history ?? []).filter((n) => n.state === "filed" && s.justFiled?.has(n.id));
  if (!toVerify.length && !open.length && !filed.length && !s.undo) {
    return div().px(8).py(10).text_size(12).text_color(t.dim).child(`Nothing in ${answer.project.name}'s box. Agents drop notes here when they spot a problem outside their ticket.`);
  }
  const group = (name, notes, draw) => notes.length
    ? [div().px(4).pt(10).pb(4).text_size(10.5).font_medium().text_color(t.dim).child(`${name.toUpperCase()} · ${notes.length}`), ...notes.map(draw)]
    : [];
  return v_flex().gap(4).children([
    ...group("To verify", toVerify, (n) => verifyCard(s, n)),
    ...(s.undo ? [undoRow(s, s.undo)] : []),
    ...group("Open", open, (n) => (s.editor?.id === n.id ? editorCard(s, n, s.editor) : noteCard(s, n))),
    ...group("Just filed", filed, (n) => filedCard(s, n)),
  ]);
}

const LABELS = { check: "Check", "mark-solved": "Mark solved", file: "File issue", bin: "Bin", confirm: "Confirm solved", "not-solved": "Not solved", reopen: "Reopen", restore: "Restore", fix: "Fix in new tab" };

const BUSY = { check: "Checking…", fix: "Starting the tab…" };

function actionButton(t, note, action, act, isPrimary = false, isBusy = false) {
  if (isBusy) {
    return div().id(`${action}:${note.id}`).flex_none().h(24).px(10).flex().items_center().rounded(6).text_size(12).text_color(t.muted)
      .border(1).border_color(t.border).child(h_flex().gap(6).items_center().child(svg("mods/workspace-chrome/spinner.svg").size(12).spin(900)).child(BUSY[action] ?? "Working…"));
  }
  const label = action === "check" && note.check && !note.check.error ? "Check again" : LABELS[action];
  return div().id(`${action}:${note.id}`).flex_none().h(24).px(10).flex().items_center().rounded(6).text_size(12).font_medium().cursor_pointer()
    .bg(isPrimary ? t.solid : t.background).text_color(isPrimary ? t.solid_foreground : t.foreground).border(1).border_color(isPrimary ? t.solid : t.border)
    .hover((st) => st.bg(isPrimary ? t.solid : t.hover))
    .on_click((_e, cx) => act(action, note, cx))
    .child(label);
}

// A small text button: Start over, Use the agent's text, Fine to publish, Copy.
function link(t, id, text, onClick, color = t.accent) {
  return div().id(id).flex_none().text_size(11.5).text_color(color).cursor_pointer().hover((st) => st.underline()).on_click(onClick).child(text);
}

function plainButton(t, id, text, onClick, { isPrimary = false, isOff = false } = {}) {
  return div().id(id).flex_none().h(24).px(10).flex().items_center().rounded(6).text_size(12).font_medium()
    .bg(isPrimary ? t.solid : t.background).text_color(isPrimary ? t.solid_foreground : t.foreground).border(1).border_color(isPrimary ? t.solid : t.border)
    .when(isOff, (el) => el.opacity(0.45))
    .when(!isOff, (el) => el.cursor_pointer().hover((st) => st.bg(isPrimary ? t.solid : t.hover)).on_click(onClick))
    .child(text);
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
      .when(Boolean(where), (el) => el.child(div().id(`at:${note.id}`).text_color(t.accent).cursor_pointer().tooltip(`Open ${note.at.path} in Cursor`).on_click((_e, cx) => s.act("open-file", note, cx)).child(where)))
      .when(Boolean(note.from?.ticket), (el) => el.child(div().id(`ticket:${note.id}`).cursor_pointer().tooltip("Its tab, or the ticket on GitHub").on_click((_e, cx) => s.act("jump", note, cx)).child(`#${note.from.ticket}`)))
      .child(div().child(note.age))
      .when(note.spotted > 1, (el) => el.child(div().text_color(t.working).child(`${note.spotted}×`)))
      .when(Boolean(note.changed), (el) => el.child(chip(t, note.changed?.kind === "removed" ? "file removed" : `changed on ${note.changed?.on}`, t.working)))
      .when(Boolean(note.notVerified), (el) => el.child(chip(t, `claimed on ${note.notVerified?.branch}, not verified`, t.working)))
      .when(Boolean(note.reopened), (el) => el.child(chip(t, note.reopened?.by === "you" ? "reopened" : "spotted again after it was solved", t.blocked)))
      .when(note.state === "filed", (el) => el.child(chip(t, `filed #${note.issue?.number}`, t.ansi2))))
    .when(Boolean(note.check?.error) && !isChecking(s, note), (el) => el.child(div().text_size(12).text_color(t.blocked).whitespace_normal().child(`Not checked: ${note.check.error}`)))
    .when(Boolean(note.check?.gone) && note.state === "open" && !isChecking(s, note), (el) => el.child(goneBanner(s, note)))
    .when(isOpen || isChecking(s, note), (el) => el.child(sections(t, note, isChecking(s, note))))
    .when(note.actions.length > 0, (el) => el.child(h_flex().gap(6).justify_end().children(note.actions.map((a) => actionButton(t, note, a, s.act, false, a === "check" && isChecking(s, note))))));
}

const isChecking = (s, note) => Boolean(s.checking?.has(note.id));

const FIELD_LABELS = { checking: "Checking…", "not-checked": "Not checked", checked: "Checked", corrected: "Corrected", agent: "The agent's text", unsure: "Unsure" };

// File issue: the note as an editor in place. The title and the four sections as fields with the
// check's label on each, what the scan found, where the issue goes, similar open issues, and Create
// issue with the one line that says why it is off.
function editorCard(s, note, ed) {
  const { t } = s;
  const act = (name, what = note) => (_e, cx) => s.act(`editor-${name}`, what, cx);
  return v_flex().id(`editor:${note.id}`).px(10).py(10).gap(8).rounded(8).border(1).border_color(t.input).bg(t.raised)
    .child(h_flex().gap(8).items_center().text_size(11.5).text_color(t.muted)
      .child(div().flex_1().min_w(0).truncate().child(`Filing note ${note.number}`))
      .when(ed.canStartOver, (el) => el.child(link(t, `start-over:${note.id}`, "Start over", act("start-over")))))
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
  const colors = { checking: t.dim, "not-checked": t.dim, checked: t.ansi2, corrected: t.accent, agent: t.muted, unsure: t.working };
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

// A solved note in the history: where it was solved, and whether its fix landed yet.
function solvedLine(note) {
  const landed = note.solved?.landed;
  if (landed?.state === "landed") return `Solved · landed: ${landed.how}`;
  return `Solved on ${note.solved?.branch ?? "a branch"}${note.solved?.confirmed ? " · waiting to land" : ""}`;
}

// A filed note: its issue, how the board step went, and once solved the words that close it.
function filedLines(s, note) {
  const { t } = s;
  const issue = note.issue ?? {};
  const isSolved = Boolean(note.solved?.confirmed) || note.state === "to verify";
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
    .when(Boolean(note.board?.error), (el) => el.child(h_flex().gap(8).items_center()
      .child(div().flex_1().min_w(0).whitespace_normal().text_color(t.working).child(`Not on the board: ${note.board.error}`))
      .child(plainButton(t, `board:${note.id}`, "Add to board", (_e, cx) => s.act("board", note, cx)))))
    .when(isSolved && Boolean(issue.closes), (el) => el.child(h_flex().gap(8).items_center()
      .child(div().flex_1().min_w(0).whitespace_normal().text_color(t.muted).child(`Put "${issue.closes}" in the fix's PR so the issue closes with it.`))
      .child(link(t, `closes:${note.id}`, "Copy", (_e, cx) => s.act("copy", note, cx)))));
}

function filedCard(s, note) {
  const { t } = s;
  return v_flex().id(`filed:${note.id}`).px(10).py(8).gap(5).rounded(8).border(1).border_color(t.chrome).bg(t.chrome)
    .child(div().font_medium().whitespace_normal().child(note.filed?.title ?? note.title))
    .child(filedLines(s, note))
    .when(note.actions.length > 0, (el) => el.child(h_flex().gap(6).justify_end().children(note.actions.map((a) => actionButton(t, note, a, s.act, a === "fix", a === "fix" && Boolean(s.fixing?.has(note.id)))))));
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
  return v_flex().gap(6).px(10).py(8).rounded(6).border(1).border_color(t.working).bg(t.raised)
    .child(div().text_size(12.5).whitespace_normal().child(`Looks solved on ${gone.on}: ${gone.why}`))
    .child(h_flex().gap(6).justify_end()
      .child(div().id(`gone-solved:${note.id}`).flex_none().h(24).px(10).flex().items_center().rounded(6).text_size(12).font_medium().cursor_pointer()
        .bg(t.solid).text_color(t.solid_foreground).on_click((_e, cx) => s.act("mark-solved-gone", note, cx)).child("Mark solved"))
      .child(div().id(`gone-bin:${note.id}`).flex_none().h(24).px(10).flex().items_center().rounded(6).text_size(12).cursor_pointer()
        .border(1).border_color(t.border).hover((st) => st.bg(t.hover)).on_click((_e, cx) => s.act("bin", note, cx)).child("Bin")));
}

function verifyCard(s, note) {
  const { t } = s;
  const claim = note.solved ?? {};
  const isSelected = s.selected === note.id;
  const isOpen = s.expanded.has(note.id);
  return v_flex().id(`note:${note.id}`).px(10).py(8).gap(5).rounded(8).border(1).border_color(isSelected ? t.input : t.border).bg(t.raised)
    .child(div().id(`title:${note.id}`).font_medium().whitespace_normal().cursor_pointer().on_click((_e, cx) => s.act("expand", note, cx)).child(note.title))
    .child(h_flex().flex_wrap().gap(8).items_center().text_size(11.5).text_color(t.muted)
      .child(div().child(`note ${note.number} · claimed by ${claim.by === "you" ? "you" : "an agent"} on ${claim.branch ?? "a branch"}`))
      .when(Boolean(claim.neverLanded), (el) => el.child(chip(t, "the fix never landed", t.blocked))))
    .when(Boolean(claim.neverLanded), (el) => el.child(div().text_size(12).text_color(t.blocked).whitespace_normal().child(`It was confirmed, but ${claim.neverLanded.how}.`)))
    .when(Boolean(note.issue), (el) => el.child(filedLines(s, note)))
    .child(v_flex().gap(2).pl(8).border_l(2).border_color(t.border).text_size(12)
      .child(div().whitespace_normal().child(claim.how ?? ""))
      .when(Boolean(claim.proof), (el) => el.child(div().whitespace_normal().text_color(t.muted).child(`proof: ${claim.proof}`))))
    .when(isOpen, (el) => el.child(proofList(s, note)))
    .when(!isOpen, (el) => el.child(div().id(`show-proofs:${note.id}`).text_size(11.5).text_color(t.accent).cursor_pointer().on_click((_e, cx) => s.act("expand", note, cx)).child("Show the three proofs")))
    .child(h_flex().gap(6).justify_end().children(note.actions.map((a) => actionButton(t, note, a, s.act, a === "confirm"))));
}

// The three proofs of a claim (PLAN.md section 6b), each with a dot that says how it stands.
function proofList(s, note) {
  const { t } = s;
  const found = s.proofs?.get(note.id) ?? null;
  return v_flex().gap(8).pt(2)
    .child(proofRow(t, "The change", ...changeState(t, found)).when(Boolean(found?.change?.commits?.length), (el) => el.child(commitList(s, note, found.change))))
    .child(proofRow(t, "Independent check", ...verifyState(t, note, s.verifying?.has(note.id)))
      .when(Boolean(note.verify?.error) && !s.verifying?.has(note.id), (el) => el.child(h_flex().child(div().id(`verify-again:${note.id}`).text_size(11.5).text_color(t.accent).cursor_pointer().on_click((_e, cx) => s.act("verify-again", note, cx)).child("Check again")))))
    .child(proofRow(t, "Landed", ...landedState(t, found)));
}

function proofRow(t, name, color, text, detail = null) {
  return v_flex().gap(3)
    .child(h_flex().gap(7).items_center().text_size(12)
      .child(div().flex_none().size(8).rounded(4).bg(color))
      .child(div().flex_none().font_medium().child(name))
      .child(div().flex_1().min_w(0).text_color(t.muted).whitespace_normal().child(text)))
    .when(Boolean(detail), (el) => el.child(div().pl(15).text_size(11.5).text_color(t.muted).whitespace_normal().child(detail)));
}

function changeState(t, found) {
  if (!found || found.isLoading) return [t.dim, "Looking at the branch…"];
  if (found.error) return [t.dim, `Could not look: ${found.error}`];
  const { change } = found;
  if (change.why) return [t.dim, change.why];
  const count = change.commits.length + (change.more ?? 0);
  return count ? [t.ansi2, `${count === 1 ? "1 commit" : `${count} commits`} since the drop changed these lines`] : [t.working, "No commit since the drop changed these lines"];
}

const VERIFY_WORDS = { verified: "Verified", partly: "Partly", not_fixed: "Not fixed" };

function verifyState(t, note, isRunning) {
  if (isRunning) return [t.dim, "Your Claude is checking the fix…"];
  const verify = note.verify;
  if (!verify) return [t.dim, "Not checked yet"];
  if (verify.error) return [t.dim, `Not checked: ${verify.error}`];
  const color = { verified: t.ansi2, partly: t.working, not_fixed: t.blocked }[verify.verdict];
  const test = !verify.test?.found ? "The named test was not found." : verify.test.assertsFix ? "The named test asserts the fix." : `The named test does not assert the fix${verify.test.why ? `: ${verify.test.why}` : "."}`;
  return [color, `${VERIFY_WORDS[verify.verdict]}: ${verify.why}`, test];
}

function landedState(t, found) {
  if (!found || found.isLoading) return [t.dim, "Looking for its PR…"];
  if (found.error) return [t.dim, "Could not look"];
  const color = { landed: t.ansi2, waiting: t.working, never: t.blocked }[found.landed.state];
  return [color, found.landed.state === "landed" ? `Landed: ${found.landed.how}` : found.landed.how];
}

// The commits that changed the note's lines, each with its diff of those lines in red and green.
function commitList(s, note, change) {
  const { t } = s;
  const MAX_LINES = 14;
  return v_flex().gap(6).pl(15).pt(2).children(change.commits.map((commit) => v_flex().gap(2)
    .child(h_flex().gap(8).items_center().text_size(11.5)
      .child(div().flex_none().font_family(s.mono).text_color(t.muted).child(commit.sha.slice(0, 7)))
      .child(div().flex_1().min_w(0).truncate().child(commit.subject))
      .child(div().id(`open-at:${commit.sha}`).flex_none().text_color(t.accent).cursor_pointer().tooltip(`Open ${commit.path ?? change.path} as this commit has it`)
        .on_click((_e, cx) => s.act("open-at", { sha: commit.at ?? commit.sha, path: commit.path ?? change.path, line: firstNewLine(commit.lines) }, cx)).child("Open")))
    .child(v_flex().rounded(4).border(1).border_color(t.border).bg(t.background).py(2).font_family(s.mono).text_size(11)
      .children(commit.lines.slice(0, MAX_LINES).map((line) => div().px(6).whitespace_normal()
        .when(line.kind === "-", (el) => el.text_color(t.blocked))
        .when(line.kind === "+", (el) => el.text_color(t.ansi2))
        .when(line.kind === "@", (el) => el.text_color(t.dim))
        .child(`${line.kind === "@" ? "" : line.kind}${line.text}`)))
      .when(commit.lines.length > MAX_LINES, (el) => el.child(div().px(6).text_color(t.dim).child(`… ${commit.lines.length - MAX_LINES} more lines`))))));
}

// The new file's first line in a hunk header, so Open lands on the change.
function firstNewLine(lines) {
  const header = lines.find((line) => line.kind === "@")?.text ?? "";
  const match = /\+(\d+)/.exec(header);
  return match ? Number(match[1]) : null;
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
  const notes = (answer?.history ?? []).filter((note) => !s.justFiled?.has(note.id));
  if (!notes.length) return div().px(8).py(10).text_size(12).text_color(t.dim).child("Nothing filed, solved or binned in the last 30 days.");
  return v_flex().gap(4).children(notes.map((note) => {
    const what = note.state === "binned" ? "Binned" : note.state === "solved" ? solvedLine(note) : null;
    return v_flex().id(`past:${note.id}`).px(10).py(8).gap(4).rounded(8).hover((st) => st.bg(t.hover))
      .child(div().font_medium().whitespace_normal().child(note.filed?.title ?? note.title))
      .when(note.state === "filed", (el) => el.child(filedLines(s, note)))
      .child(h_flex().gap(8).text_size(11.5).text_color(t.muted).when(Boolean(what), (row) => row.child(what)).child(note.age))
      .when(Boolean(note.solved?.how), (el) => el.child(div().pl(8).border_l(2).border_color(t.border).text_size(12).text_color(t.muted).whitespace_normal().child(note.solved.how)))
      .when(note.actions.length > 0, (el) => el.child(h_flex().gap(6).justify_end().children(note.actions.map((a) => actionButton(t, note, a, s.act, false, a === "fix" && Boolean(s.fixing?.has(note.id)))))));
  }));
}

function footer(s) {
  const { t, answer } = s;
  const past = answer?.history ?? [];
  const count = (state) => past.filter((n) => n.state === state).length;
  const hints = s.view === "history" ? "esc back" : s.editor ? "esc leaves a field, then closes the editor; the draft is kept" : "↑↓ pick · enter open · f file · k check · s solved · x bin · u undo · c confirm · n not solved";
  return h_flex().flex_none().h(30).px(12).gap(8).items_center().border_t(1).border_color(t.border).text_size(11.5).text_color(t.dim)
    .child(div().id("history").flex_none().cursor_pointer().hover((st) => st.text_color(t.foreground)).on_click((_e, cx) => s.act("history", null, cx))
      .child(s.view === "history" ? "◂ Back to the notes" : `Filed ${count("filed")} · Solved ${count("solved")} · Binned ${count("binned")} ▸`))
    .child(div().flex_1())
    .child(div().flex_none().truncate().child(hints));
}
