// A claim waiting to be verified, with its three proofs: the change, the independent check, landed.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { claimKey, claimVerdict } from "./proofs.js";
import { filedLines, needsYou } from "./panel-filed.js";
import { actionsRow, card, link, metaRow } from "./panel-parts.js";

// Verdict first: what the three proofs add up to, each proof in a few words, the claim on one quiet
// line, and the rest (the agent's words, Claude's answer, the diff, the issue) behind Details.
export function verifyCard(s, note) {
  const { t } = s;
  const claim = note.solved ?? {};
  const isOpen = s.expanded.has(note.id);
  const key = claimKey(note);
  const found = s.proofs?.get(key) ?? null;
  const isVerifying = isChecking(s, note);
  const verdict = claimVerdict({ found, verify: note.verify, isVerifying, isQueued: !isVerifying && !s.verifyAsked?.has(key) });
  return card(t, `note:${note.id}`, { isSelected: s.selected === note.id, edge: t.ansi2 })
    .child(div().id(`title:${note.id}`).font_medium().whitespace_normal().cursor_pointer().on_click((_e, cx) => s.act("expand", note, cx)).child(note.title))
    .when(Boolean(claim.neverLanded), (el) => el.child(div().text_size(12).text_color(t.blocked).whitespace_normal().child(`It was confirmed before, but ${claim.neverLanded.how}.`)))
    .child(verdictBlock(t, verdict))
    .when(verdict.rows[1].state === "unknown" && !isVerifying, (el) => el.child(h_flex().child(link(t, `verify-again:${note.id}`, "Check again", (_e, cx) => s.act("verify-again", note, cx)).tooltip("Your own Claude checks the fix, read-only"))))
    .when(Boolean(note.issue), (el) => el.child(needsYou(s, note)))
    .child(metaRow(t)
      .child(div().flex_none().child(`note ${note.number} · by ${claim.by === "you" ? "you" : "an agent"}`))
      // The branch stays whole: it moves to the next line as one piece, and only a branch wider than
      // the card ends in an ellipsis.
      .child(div().min_w(0).max_w_full().truncate().child(`on ${claim.branch ?? "a branch"}`))
      .when(Boolean(note.issue), (el) => el.child(div().flex_none().child(`issue #${note.issue.number}`))))
    .child(h_flex().child(link(t, `details:${note.id}`, isOpen ? "Details ▴" : "Details ▾", (_e, cx) => s.act("expand", note, cx))))
    .when(isOpen, (el) => el.child(details(s, note, found)))
    // A fix that never landed has nothing to confirm: Not solved is the way on.
    .child(actionsRow(s, note, found?.landed?.state === "never" ? { primary: "not-solved", leave: ["confirm"] } : { primary: "confirm" }));
}

const TONE = (t) => ({ fixed: t.ansi2, partly: t.working, "not-fixed": t.blocked, looking: t.dim, unchecked: t.muted });
// Waiting to land is under way: blue, as in Just filed and the history.
const DOT = (t) => ({ holds: t.ansi2, waiting: t.ansi4, partial: t.working, missing: t.working, fails: t.blocked, looking: t.dim, unknown: t.dim });
const GLYPH = { fixed: "✓ ", "not-fixed": "✕ " };

// The verdict in one line, then the three proofs in a few words each, a dot for how each stands.
function verdictBlock(t, verdict) {
  return v_flex().gap(4)
    .child(div().text_size(13).font_medium().text_color(TONE(t)[verdict.tone]).whitespace_normal().child(`${GLYPH[verdict.tone] ?? ""}${verdict.text}`))
    .child(v_flex().gap(3).pl(2).children(verdict.rows.map((row) => h_flex().gap(8).items_center().text_size(12)
      .child(div().flex_none().size(7).rounded(4).bg(DOT(t)[row.state]))
      .child(div().flex_none().w(52).text_color(t.muted).child(row.name))
      .child(div().flex_1().min_w(0).truncate().child(row.text)))));
}

// Behind Details: the agent's own words, Claude's answer, the change line by line, and the issue.
function details(s, note, found) {
  const { t } = s;
  const claim = note.solved ?? {};
  return v_flex().gap(10).pt(2)
    .child(v_flex().gap(2).pl(8).border_l(2).border_color(t.border).text_size(12)
      .child(div().whitespace_normal().child(claim.how ?? ""))
      .when(Boolean(claim.proof), (el) => el.child(div().whitespace_normal().text_color(t.muted).child(`proof: ${claim.proof}`))))
    .child(proofList(s, note))
    .when(Boolean(note.issue), (el) => el.child(filedLines(s, note, { withNeeds: false })));
}

// Whether Claude is checking this claim: while its check runs, and after it until the read brings
// its answer, so the card never offers Check again in between.
function isChecking(s, note) {
  const key = claimKey(note);
  if (s.verifying?.has(key)) return true;
  return Boolean(s.verifyAsked?.has(key)) && !note.verify && !s.verifyFailed?.has(key);
}

// The three proofs of a claim (docs/plan.md section 6b), each with a dot that says how it stands.
function proofList(s, note) {
  const { t } = s;
  const found = s.proofs?.get(claimKey(note)) ?? null;
  return v_flex().gap(8).pt(2)
    .child(proofRow(t, "The change", ...changeState(t, found))
      .when(Boolean(found?.change?.commits?.length), (el) => el.child(commitList(s, note, found.change)))
      .when(!found?.change?.commits?.length && Boolean(found?.change?.elsewhere?.length), (el) => el.child(elsewhereList(s, found.change))))
    .child(proofRow(t, "Independent check", ...verifyState(t, note, isChecking(s, note))))
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
  const color = { landed: t.ansi2, waiting: t.ansi4, never: t.blocked }[found.landed.state];
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
      .child(link(t, `open-at:${commit.sha}`, "Open", (_e, cx) => s.act("open-at", { sha: commit.at ?? commit.sha, path: commit.path ?? change.path, line: firstNewLine(commit.lines) }, cx))
        .tooltip(`Open ${commit.path ?? change.path} as this commit has it`)))
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
