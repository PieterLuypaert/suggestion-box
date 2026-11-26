// Filing a note as an issue: where it goes, the draft, Create issue, the board, and what GitHub says
// about filed issues since.
import { fold, stateOf } from "../../mods/suggestion-box/events.js";
import { allows, recordIssue, recordIssueState } from "../../mods/suggestion-box/rules.js";
import { fillProblem, isPublicTarget, scanTexts } from "../../mods/suggestion-box/editor.js";
import { githubRepo, issueText } from "../../mods/suggestion-box/issue.js";
import { scanBlock } from "../../mods/suggestion-box/scan.js";
import { addToBoard, boardsOf, codeLinkFor, createIssue, gh, issueSince, similarIssues, targetFor } from "./file.js";
import { loadNote, notesOf, update } from "./note-files.js";

// For the editor: where the issue goes, similar open issues (null when gh could not look), and
// the code link under Evidence.
export function target(project, id, env) {
  const loaded = loadNote(project.dir, id);
  if (!loaded) return { error: `there is no note ${id}` };
  const note = fold(loaded.note, loaded.events.map((e) => e.event));
  const where = targetFor(project.repo.top, project.key, env);
  return {
    ok: true,
    target: where,
    similar: where.kind === "github" && !where.why ? similarIssues(where.repo, note.title, env) : [],
    link: where.codeRepo ? codeLinkFor(project.repo.top, note, where.codeRepo, env) : null,
  };
}

// What the person typed in the editor, kept on the note so closing the panel loses nothing. null
// drops the draft.
export function draft(project, id, text, now) {
  const value = JSON.parse(text ?? "null");
  const kept = value ? { title: value.title, sections: value.sections, fine: value.fine ?? [], notGone: value.notGone ?? null } : null;
  const result = update(project, id, ({ note }) => ({ note: { ...note, draft: kept, updated: now.toISOString() } }));
  return result.error ? result : { ok: true };
}

// Files the note as an issue, under the rules the editor shows (editor.js): an open note, a check
// that finished and does not say the problem is gone (unless the person said it is not solved),
// the target the editor showed, every field filled in, no token, and in a repo that is not
// private nothing sensitive left unmarked. Then the board, and the note records the issue.
//
// Filing never makes the same issue twice: the note says a filing started before gh is asked, so a
// filing cut off after gh created the issue (the panel gave up, the note could not be written) is
// found again by its title the next time, and recorded instead of created anew.
export function file(project, id, text, env, now) {
  const loaded = loadNote(project.dir, id);
  if (!loaded) return { error: `there is no note ${id}` };
  const view = fold(loaded.note, loaded.events.map((e) => e.event));
  const value = JSON.parse(text ?? "{}");
  const title = String(value.title ?? "").trim();
  const where = targetFor(project.repo.top, project.key, env);
  const why = refuseFiling(view, value, where);
  if (why) return { error: why };
  let issue = view.filing ? issueSince(where.repo, title, view.filing.at, env) : null;
  if (!issue) {
    const started = update(project, id, ({ note }) => ({ note: { ...note, filing: { at: note.filing?.at ?? now.toISOString(), repo: where.repo } } }));
    if (started.error) return started;
    const link = where.codeRepo ? codeLinkFor(project.repo.top, view, where.codeRepo, env) : null;
    const body = issueText({ sections: value.sections }, { link, ticket: view.from?.ticket ?? null });
    issue = createIssue({ repo: where.repo, title, body, label: where.labelMissing ? null : where.label }, env);
    if (issue.error) return { error: `gh could not create the issue: ${issue.error}` };
  }
  const board = where.board ? addToBoard(where.board, issue.url, env) : null;
  // Where it is now, as GitHub says: also a board that adds new issues itself. The watch asks again.
  const boards = boardsOf(where.repo, issue.number, env);
  const ref = where.repo.toLowerCase() === githubRepo(project.key) ? `#${issue.number}` : `${where.repo}#${issue.number}`;
  const details = { issue: { ...issue, boards }, repo: where.repo, closes: `${where.linkKeyword} ${ref}`, title, sections: value.sections, notGone: value.notGone ?? null, board };
  return { ok: true, issue, board, ...record(project, id, now, details) };
}

// The issue exists: the note records it. When that fails, the filing marker stays, so Create
// issue finds this issue again instead of making another.
function record(project, id, now, details) {
  try {
    const written = update(project, id, ({ view: fresh }) => ({ note: recordIssue(fresh, now.toISOString(), details) }), { foldEvents: true });
    if (!written.error) return {};
    return { warning: `#${details.issue.number} exists, but the note could not record it: ${written.error}` };
  } catch (error) {
    return { warning: `#${details.issue.number} exists, but the note could not record it: ${error.message}. Create issue finds it again.` };
  }
}

function refuseFiling(view, value, where) {
  if (!allows(view, "file")) return `note ${view.number} is ${stateOf(view)}; only an open note is filed`;
  if (!view.check) return "check the note first";
  if (where.kind !== "github" || where.why) return where.why;
  if (String(value.repo ?? "").toLowerCase() !== where.repo.toLowerCase()) return `the project's config now files in ${where.repo}; open the editor again to see it`;
  if (view.check.gone && !value.notGone) return "the check says the problem is gone; say it is not solved to file it anyway";
  const texts = { title: value.title, sections: value.sections };
  return fillProblem(texts) ?? scanBlock(scanTexts(texts), { isPublic: isPublicTarget(where), fine: value.fine ?? [] });
}

// The board step again, for a filed note it failed on.
export function board(project, id, env, now) {
  const loaded = loadNote(project.dir, id);
  if (!loaded?.note.issue) return { error: `note ${id} has no issue` };
  const where = targetFor(project.repo.top, project.key, env);
  if (!where.board) return { error: "this project's config names no board" };
  const placed = addToBoard(where.board, loaded.note.issue.url, env);
  update(project, id, ({ note }) => ({ note: { ...note, board: placed, updated: now.toISOString() } }));
  return placed.error ? { error: placed.error } : { ok: true };
}

// Filed notes learn whether their issue is closed, or open again, and which boards it is on: per
// repo, one question to GitHub about exactly those issue numbers.
export function closedIssues(project, env, now) {
  const filed = notesOf(project.dir).filter((note) => stateOf(note) === "filed" && note.issue?.repo && note.issue?.number);
  let changed = 0;
  for (const repo of [...new Set(filed.map((note) => note.issue.repo))]) {
    const notes = filed.filter((note) => note.issue.repo === repo);
    const states = issueStates(repo, notes.map((note) => note.issue.number), env);
    if (!states) continue;
    for (const note of notes) {
      const state = states.get(note.issue.number);
      if (!state) continue;
      const closedAt = state.state === "CLOSED" ? state.closedAt ?? now.toISOString() : null;
      const boards = (state.projectItems?.nodes ?? []).filter(Boolean).map((item) => ({ title: item.project?.title ?? null, column: item.fieldValueByName?.name ?? null }));
      if (Boolean(closedAt) === Boolean(note.issue.closed) && JSON.stringify(boards) === JSON.stringify(note.issue.boards ?? [])) continue;
      update(project, note.id, ({ view }) => ({ note: recordIssueState(view, now.toISOString(), { closedAt, boards }) }), { foldEvents: true });
      changed++;
    }
  }
  return changed;
}

// The state of each of these issues of a repo, from one GraphQL query, or null when gh could not ask.
function issueStates(repo, numbers, env) {
  const [owner, name] = repo.split("/");
  const board = "projectItems(first: 5) { nodes { project { title } fieldValueByName(name: \"Status\") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } }";
  const fields = numbers.map((n) => `i${n}: issue(number: ${Number(n)}) { number state closedAt ${board} }`).join(" ");
  const answer = gh(["api", "graphql", "-f", `query=query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`, "-F", `owner=${owner}`, "-F", `name=${name}`], { env });
  if (answer.code !== 0) return null;
  try {
    const found = Object.values(JSON.parse(answer.stdout).data?.repository ?? {}).filter(Boolean);
    return new Map(found.map((issue) => [issue.number, issue]));
  } catch {
    return null;
  }
}
