// Fix in new tab: a filed issue started as a ticket through the parallel-tickets launcher (PLAN.md
// section 7b). When the button shows, the branch it picks, and the launcher's arguments. Pure: no
// Herdr and no Node imports.
import { branchName } from "./issue.js";

// The branch's type, as parallel-tickets names branches: docs or chore when the note is about
// those, else fix.
export function fixType(title) {
  const text = String(title ?? "");
  if (/\b(readme|docs?|documentation|typos?|changelog)\b/i.test(text)) return "docs";
  if (/\b(dependenc(?:y|ies)|lint(?:ing|er)?|tooling|ci)\b/i.test(text)) return "chore";
  return "fix";
}

// Names to try, best first: the title's words under its type, then with -2 and -3 for a name that
// is taken, then under fix and chore for a type the repo's CI treats specially.
export function branchCandidates(title) {
  const type = fixType(title);
  const names = [];
  for (const kind of [type, "fix", "chore"]) {
    const base = branchName(title, kind);
    for (const name of [base, `${base}-2`, `${base}-3`]) if (!names.includes(name)) names.push(name);
  }
  return names;
}

// The first name `issues branch` called ok, from its "<branch><TAB><verdict>" lines, or null.
export function pickBranch(answer) {
  for (const line of String(answer ?? "").split("\n")) {
    const [branch, verdict] = line.split("\t");
    if (branch && verdict?.trim() === "ok") return branch;
  }
  return null;
}

// What `issues launch` printed on success: "<tab><TAB><pane><TAB><branch>" on its last line.
export function readLaunch(stdout) {
  const last = String(stdout ?? "").trim().split("\n").pop() ?? "";
  const [tab, pane, branch] = last.split("\t");
  return tab && pane && branch ? { tab, pane, branch } : null;
}

// The last line a failing launcher wrote, which says why.
export function lastLine(...texts) {
  for (const text of texts) {
    const line = String(text ?? "").trim().split("\n").filter(Boolean).pop();
    if (line) return line.replace(/^issues (?:launch|branch): /, "");
  }
  return "the launcher stopped without saying why";
}

// Whether Fix in new tab can show for a project: the launcher with its hagent, a launcher that
// knows --space, and an issue tracker ship-issue can work with: the origin repo on GitHub, and a
// config, when there is one, that names GitHub and that repo. { can, why }.
export function fixGate({ hasLauncher, hasHagent, knowsSpace, originRepo, tracker }) {
  if (!hasLauncher || !hasHagent) return { can: false, why: "the parallel-tickets launcher is not installed" };
  if (!knowsSpace) return { can: false, why: "the parallel-tickets launcher does not know --space yet" };
  if (!originRepo) return { can: false, why: "this project's origin is not on GitHub" };
  if (tracker && tracker.kind !== "github") return { can: false, why: `this project's tracker is ${tracker.kind}` };
  if (tracker?.repo && tracker.repo.toLowerCase() !== originRepo.toLowerCase()) return { can: false, why: `issues go to ${tracker.repo}, not to this repo` };
  return { can: true };
}
