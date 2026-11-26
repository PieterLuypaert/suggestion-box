// A claim waiting to be verified, with its three proofs: the change, the independent check, landed.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { filedLines } from "./panel-filed.js";
import { actionsRow, card, chip, metaRow } from "./panel-parts.js";

export function verifyCard(s, note) {
  const { t } = s;
  const claim = note.solved ?? {};
  const isOpen = s.expanded.has(note.id);
  return card(t, `note:${note.id}`, { isSelected: s.selected === note.id, edge: t.ansi2 })
    .child(div().id(`title:${note.id}`).font_medium().whitespace_normal().cursor_pointer().on_click((_e, cx) => s.act("expand", note, cx)).child(note.title))
    .child(metaRow(t)
      .child(div().flex_none().child(`note ${note.number} · claimed by ${claim.by === "you" ? "you" : "an agent"}`))
      // The branch stays whole: it moves to the next line as one piece, and only a branch wider than
      // the card ends in an ellipsis.
      .child(div().min_w(0).max_w_full().truncate().child(`on ${claim.branch ?? "a branch"}`))
      .when(Boolean(claim.neverLanded), (el) => el.child(chip(t, "the fix never landed", t.blocked))))
    .when(Boolean(claim.neverLanded), (el) => el.child(div().text_size(12).text_color(t.blocked).whitespace_normal().child(`It was confirmed, but ${claim.neverLanded.how}.`)))
    .when(Boolean(note.issue), (el) => el.child(filedLines(s, note)))
    .child(v_flex().gap(2).pl(8).border_l(2).border_color(t.border).text_size(12)
      .child(div().whitespace_normal().child(claim.how ?? ""))
      .when(Boolean(claim.proof), (el) => el.child(div().whitespace_normal().text_color(t.muted).child(`proof: ${claim.proof}`))))
    .when(isOpen, (el) => el.child(proofList(s, note)))
    .when(!isOpen, (el) => el.child(div().id(`show-proofs:${note.id}`).text_size(11.5).text_color(t.accent).cursor_pointer().on_click((_e, cx) => s.act("expand", note, cx)).child("Show the three proofs")))
    .child(actionsRow(s, note, { primary: "confirm" }));
}

// The three proofs of a claim (docs/plan.md section 6b), each with a dot that says how it stands.
function proofList(s, note) {
  const { t } = s;
  const found = s.proofs?.get(note.id) ?? null;
  return v_flex().gap(8).pt(2)
    .child(proofRow(t, "The change", ...changeState(t, found))
      .when(Boolean(found?.change?.commits?.length), (el) => el.child(commitList(s, note, found.change)))
      .when(!found?.change?.commits?.length && Boolean(found?.change?.elsewhere?.length), (el) => el.child(elsewhereList(s, found.change))))
    .child(proofRow(t, "Independent check", ...verifyState(t, note, s.verifying?.has(note.id)))
      .when(Boolean(note.verify?.error) && !s.verifying?.has(note.id), (el) => el.child(h_flex().child(div().id(`verify-again:${note.id}`).text_size(11.5).text_color(t.accent).cursor_pointer().on_click((_e, cx) => s.act("verify-again", note, cx)).child("Check again")))))
    .child(proofRow(t, "Landed", ...landedState(t, found)));
}

// A proof: its dot and name on a line of their own, then what it found under it, the full width of
// the card, so a long answer never squeezes into a narrow column beside the name.
function proofRow(t, name, color, text, detail = null) {
  return v_flex().gap(3)
    .child(h_flex().gap(7).items_center().text_size(12)
      .child(div().flex_none().size(8).rounded(4).bg(color))
      .child(div().flex_none().font_medium().child(name)))
    .child(div().pl(15).text_size(12).text_color(t.muted).whitespace_normal().child(text))
    .when(Boolean(detail), (el) => el.child(div().pl(15).text_size(11.5).text_color(t.muted).whitespace_normal().child(detail)));
}

function changeState(t, found) {
  if (!found || found.isLoading) return [t.dim, "Looking at the branch…"];
  if (found.error) return [t.dim, `Could not look: ${found.error}`];
  const { change } = found;
  if (change.why) return [t.dim, change.why];
  const count = change.commits.length + (change.more ?? 0);
  if (count) return [t.ansi2, `${count === 1 ? "1 commit" : `${count} commits`} since the drop changed the note's lines`];
  if (change.elsewhere?.length) return [t.working, "The note's lines did not change; these are the branch's other changes, which the independent check reads too."];
  return [t.working, "No commit since the drop changed the note's lines"];
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

// The branch's commits that changed other files than the note's: each with the files it touched.
function elsewhereList(s, change) {
  const { t } = s;
  const short = (path) => path.split("/").slice(-2).join("/");
  const shown = change.elsewhere.slice(-3);
  const more = change.elsewhere.length - shown.length + (change.elsewhereMore ?? 0);
  return v_flex().gap(4).pl(15).pt(2).when(more > 0, (el) => el.child(div().text_size(11.5).text_color(t.dim).child(`and ${more} earlier ${more === 1 ? "change" : "changes"} on the branch`))).children(shown.map((commit) => v_flex().gap(1).text_size(11.5)
    .child(h_flex().gap(8).items_center()
      .child(div().flex_none().font_family(s.mono).text_color(t.muted).child(commit.sha.slice(0, 7)))
      .child(div().flex_1().min_w(0).truncate().child(commit.subject)))
    .child(div().text_color(t.muted).whitespace_normal().child(`${commit.files.slice(0, 3).map(short).join(", ")}${commit.files.length > 3 ? ` and ${commit.files.length - 3} more` : ""}`))));
}

// The new file's first line in a hunk header, so Open lands on the change.
function firstNewLine(lines) {
  const header = lines.find((line) => line.kind === "@")?.text ?? "";
  const match = /\+(\d+)/.exec(header);
  return match ? Number(match[1]) : null;
}
