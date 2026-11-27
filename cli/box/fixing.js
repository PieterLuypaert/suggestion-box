// Fix in new tab: a filed issue started as a ticket through the parallel-tickets launcher.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fold, stateOf } from "../../mods/suggestion-box/events.js";
import { allows, recordFix, startFix, withStaleFix } from "../../mods/suggestion-box/rules.js";
import { claudeBranch, freeBranch, gateFor, launchFix } from "./fix.js";
import { githubRepo } from "../../mods/suggestion-box/issue.js";
import { ticketRecords } from "../shared/git.js";
import { loadNote, update } from "./note-files.js";
import { withTicket } from "./read.js";

// Fix in new tab: a branch named like the repo's tickets, free, then `issues launch --space` opens the
// ticket's tab. The note keeps the branch, so the fix never starts twice, or the launcher's last line
// when it failed.
export async function fix(project, id, space, env, now) {
  const loaded = loadNote(project.dir, id);
  if (!loaded) return { error: `there is no note ${id}` };
  const view = fold(loaded.note, loaded.events.map((e) => e.event));
  if (String(view.issue?.repo ?? "").toLowerCase() !== githubRepo(project.key)) return { error: `issue #${view.issue?.number} is not in this repo, so a ticket cannot start here` };
  const gate = gateFor(project.repo.top, project.key, env);
  if (!gate.can) return { error: gate.why };
  if (!space) return { error: "say which space of the Herdr app the tab opens in" };
  // The marker goes on with the state checked under the same write, so a second start, from
  // another panel or window, finds it and stops.
  const at = now.toISOString();
  const tickets = ticketRecords(project.repo.common);
  const started = update(project, id, ({ view: fresh }) => {
    const current = withTicket(withStaleFix(fresh, at), tickets);
    if (!allows(current, "fix")) return { error: refusedFix(current) };
    return { note: startFix(current, at, space) };
  }, { foldEvents: true });
  if (started.error) return started;
  const title = view.filed?.title ?? view.title;
  const problem = view.filed?.sections?.problem ?? view.sections?.problem;
  const preferred = await claudeBranch({ title, problem }, tickets, env);
  // The launcher runs from the project's main checkout, also when the panel shows a ticket's
  // worktree: that is where it makes the new one from.
  const home = mainCheckout(project.repo);
  const named = freeBranch(home, title, env, preferred);
  const opened = named.error ? named : launchFix(home, { space, ticket: view.issue.number, branch: named.branch }, env);
  update(project, id, ({ view: fresh }) => ({ note: recordFix(fresh, now.toISOString(), { ...opened, space }) }), { foldEvents: true });
  // A launcher that failed is kept on the note, which says it: the panel then adds no banner.
  return opened.error ? { error: opened.error, isOnNote: true } : { ok: true, ...opened };
}

function refusedFix(view) {
  if (view.fix?.starting) return `a fix for note ${view.number} is starting already; nothing started`;
  if (view.fix) return `note ${view.number} is already fixing in ${view.fix.branch}; nothing started`;
  return `note ${view.number} is ${stateOf(view)}${view.issue?.closed ? ` and issue #${view.issue.number} is closed` : ""}; nothing started`;
}

// The main checkout of the repo (the folder its .git is in), else the folder shown.
function mainCheckout(repo) {
  return repo.checkout && existsSync(join(repo.checkout, ".git")) ? repo.checkout : repo.top;
}
