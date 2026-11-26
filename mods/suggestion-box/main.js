// The suggestion box in the Herdr app. With props {button: true} it is the tab bar's button: it reads
// the focused space's box, keeps one right-hand panel at a time, and wiggles when a note arrives.
// Without, it is the panel on the right: the box's notes by state, with the actions their state
// allows. Every read and write goes through cli/box.js in the checkout this mod links to; this file
// only keeps state, and panel.js draws.
// Its parts live next to it: view-host (shared names and helpers), view-reading, view-button,
// view-panel, view-editor, view-proofs, view-fix, and just-filed.
import { View } from "gpui-kit";
import { appHome, checking, exec, props, theme } from "herdr";
import { findNode, MOD } from "./view-host.js";
import { buttonCopy } from "./view-button.js";
import { editing } from "./view-editor.js";
import { fixing } from "./view-fix.js";
import { panelCopy } from "./view-panel.js";
import { proving } from "./view-proofs.js";
import { reading } from "./view-reading.js";

export { JustFiled } from "./just-filed.js";

export default class SuggestionBox extends View {
  init(_props, cx) {
    this.isButton = Boolean(props()?.button);
    this.copy = `${Date.now()}-${Math.random()}`;
    this.folder = undefined;
    this.error = "";
    if (this.isButton) this.initButton(cx);
    else this.initPanel(cx);
    if (checking()) return;
    cx.spawn(async (cx) => {
      try {
        // The checkout the mod's link points into: -P follows the link before .. climbs.
        const real = await exec("sh", ["-c", 'cd -P "$1" && cd ../.. && pwd -P', "sh", `${appHome()}/mods/${MOD}`]);
        this.node = await findNode();
        this.boxJs = `${real.stdout.trim()}/cli/box.js`;
        this.read(cx, true);
      } catch (error) {
        this.error = `The box's own side was not found: ${error.message}`;
        cx.notify();
      }
    });
  }

  render(cx) {
    const t = theme();
    return this.isButton ? this.renderButton(cx, t) : this.renderPanel(cx, t);
  }
}

// The view's parts, each in its own file next to this one.
Object.assign(SuggestionBox.prototype, reading, buttonCopy, panelCopy, editing, proving, fixing);
