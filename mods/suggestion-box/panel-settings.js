// Settings: collecting everywhere and per project.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { chip, toggle } from "./panel-parts.js";

// Settings: whether agents hear of the box at all, and per project. Every switch says On or Off in
// words, and what it does is written above the switches.
export function settingsView(s) {
  const { t } = s;
  const found = s.projects;
  if (!found) return div().px(8).py(10).text_size(12).text_color(t.dim).child("Looking at your spaces…");
  if (found.error) return div().px(8).py(10).text_size(12).text_color(t.blocked).whitespace_normal().child(`Could not list the projects: ${found.error}`);
  const isAll = found.all !== false;
  return v_flex().gap(8)
    .child(v_flex().gap(6).px(12).py(10).rounded(8).bg(t.raised)
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().font_medium().child("Collecting everywhere"))
        .child(toggle(t, "collect-all", isAll ? "On" : "Off", isAll, "Turn the box on or off for every project", (_e, cx) => s.act("collect-all", null, cx))))
      .child(div().text_size(12).text_color(t.muted).whitespace_normal().child(isAll
        ? "When a project is on, its new Claude sessions get the box's instructions, and agents drop the problems they find outside their task. When it is off, its agents never hear of the box, as if it were not installed."
        : "Off everywhere: no project's agents hear of the box. The switches below keep what you chose, for when you turn it back on.")))
    .child(div().px(4).pt(4).text_size(10.5).font_medium().text_color(t.dim).child(`PROJECTS · ${found.projects.length}`))
    .children(found.projects.length ? found.projects.map((project) => projectRow(s, project, isAll)) : [div().px(8).text_size(12).text_color(t.dim).child("No projects yet: open a space with a git repo.")])
    .child(div().px(4).pt(4).text_size(11.5).text_color(t.dim).whitespace_normal()
      .child("A switch counts for new sessions at once. An agent that is already running hears that the box is off on its next note, and names what it found in its final report instead."));
}

function projectRow(s, project, isAll) {
  const { t } = s;
  const counts = project.counts ?? {};
  const words = [counts.toVerify ? `${counts.toVerify} to verify` : "", counts.open ? `${counts.open} open` : "", counts.filed ? `${counts.filed} filed` : ""].filter(Boolean).join(" · ") || "no notes";
  const isOn = isAll && project.isOn;
  return h_flex().id(`project:${project.key}`).px(12).py(10).gap(10).items_center().rounded(8).bg(t.raised).border(1).border_color(project.isHere ? t.input : t.raised)
    .when(!isAll, (el) => el.opacity(0.5))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(h_flex().gap(6).items_center()
        .child(div().min_w(0).truncate().font_medium().child(project.name))
        .when(project.isHere, (el) => el.child(chip(t, "this space", t.muted))))
      .child(div().text_size(11.5).text_color(t.muted).truncate().child(`${words} · ${project.key}`)))
    .child(isAll
      ? toggle(t, `collect:${project.key}`, isOn ? "On" : "Off", isOn, isOn ? `Agents in ${project.name} hear of the box` : `Agents in ${project.name} never hear of the box`, (_e, cx) => s.act("collect-project", project, cx))
      : div().flex_none().text_size(11.5).text_color(t.dim).child("off everywhere"));
}
