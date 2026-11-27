// The issue editor's rules: the texts it opens with, the check's label on each field, and the one
// line that says why Create issue is off. The panel draws them and box.js files under the same
// rules. Pure: no Herdr and no Node imports.
import { SECTION_LABELS, SECTIONS } from "./notes.js";
import { scan, scanBlock } from "./scan.js";

// GitHub's own limit on an issue title.
export const TITLE_MAX = 256;

// What the editor opens with: the draft where there is one, else Claude's correction, else what
// the agent wrote.
export function startTexts(note) {
  const draft = note.draft ?? {};
  const sections = {};
  for (const name of SECTIONS) sections[name] = draft.sections?.[name] ?? checkedText(note, name);
  return { title: draft.title ?? note.title, sections };
}

// A section as the check leaves it: Claude's text when it corrected the agent's.
export function checkedText(note, name) {
  const verdict = note.check?.sections?.[name];
  return verdict?.verdict === "corrected" && verdict.text ? verdict.text : note.sections?.[name] ?? "";
}

const same = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();

// The label over a section's field: { label, swap, question }, or null once the person changed the
// text. `label` is checking, not-checked, checked, corrected, agent (the agent's text put back over
// a correction) or unsure; `swap` names the other text a link puts in the field.
export function fieldLabel(note, name, value, { isChecking = false } = {}) {
  if (isChecking) return { label: "checking" };
  if (note.check?.error) return { label: "not-checked" };
  const verdict = note.check?.sections?.[name];
  if (!verdict) return null;
  const agent = note.sections?.[name] ?? "";
  if (verdict.verdict === "corrected" && verdict.text) {
    if (same(value, verdict.text)) return { label: "corrected", swap: "agent" };
    return same(value, agent) ? { label: "agent", swap: "claude" } : null;
  }
  if (!same(value, agent)) return null;
  return { label: verdict.verdict, question: verdict.verdict === "unsure" ? verdict.question ?? null : null };
}

// The text a swap link puts in a section's field.
export function swapText(note, name, to) {
  return to === "claude" ? note.check?.sections?.[name]?.text ?? "" : note.sections?.[name] ?? "";
}

// The first thing missing from the texts, as the line under the buttons says it, or null.
export function fillProblem({ title, sections }) {
  const value = String(title ?? "").trim();
  if (!value) return "Fill in: Title";
  if (value.includes("\n") || value.length > TITLE_MAX) return `Keep the title to one line of at most ${TITLE_MAX} characters`;
  const empty = SECTIONS.find((name) => !String(sections?.[name] ?? "").trim());
  return empty ? `Fill in: ${SECTION_LABELS[empty]}` : null;
}

// Every scan hit in the title and the four sections.
export function scanTexts({ title, sections }) {
  return scan([title, ...SECTIONS.map((name) => sections?.[name] ?? "")].join("\n"));
}

// Only a repo GitHub says is private or internal counts as closed; an unknown one is treated as public.
export const isPublicTarget = (target) => target?.kind === "github" && !["private", "internal"].includes(target.visibility);

// Why Create issue (or Copy issue, for a tracker outside GitHub) is off, or null when it can go.
// `notGone` is set once the person said the problem is not solved after the check said it was.
export function offReason({ note, texts, target, isChecking = false, isFiling = false, notGone = null, fine = [] }) {
  if (isFiling) return "Creating the issue…";
  if (isChecking) return "Waiting for the check";
  if (!note.check) return "Waiting for a check: Check again above";
  if (!target) return "Looking up where it goes";
  if (target.kind === "github" && target.why) return target.why;
  if (note.check.gone && !notGone) return "The check says this is solved";
  const missing = fillProblem(texts);
  if (missing) return missing;
  return scanBlock(scanTexts(texts), { isPublic: isPublicTarget(target), fine });
}

// The target line: where the issue goes, before it goes there.
export function targetLine(target) {
  if (!target) return "Looking up where it goes…";
  if (target.kind !== "github") return `${target.why}`;
  if (!target.repo) return target.why;
  const parts = [`→ ${target.repo} (${target.visibility ?? "visibility unknown"})`];
  if (target.label) parts.push(target.labelMissing ? `no label: ${target.label} is not in the repo` : target.label);
  if (target.board) parts.push(target.board.problem ? `board: ${target.board.problem}` : `board ${target.board.title ?? `#${target.board.number}`} › ${target.board.column}`);
  else parts.push(target.hasConfig ? "no board in the config" : "no config: no label, and no board from the box (a board that adds new issues itself still will)");
  return parts.join(" · ");
}
