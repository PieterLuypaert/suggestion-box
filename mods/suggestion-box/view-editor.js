// File issue: the editor's fields and draft, where the issue goes, Create issue, and Copy issue.
import { InputState, TextareaState } from "gpui-base";
import { exec, notify, window } from "herdr";
import { checkedText, fieldLabel, offReason, scanTexts, startTexts, swapText, targetLine } from "./editor.js";
import { issueText } from "./issue.js";
import { SECTIONS } from "./notes.js";
import { BLOCK, box, FILE_MS, isShown, LOOKUP_MS } from "./view-host.js";

// The view's methods for this part, added to it in main.js.
export const editing = {
  // File issue: the note becomes an editor in place, its check runs (or is reused) and where the
  // issue would go is looked up meanwhile.
  openEditor(cx, note) {
    if (!this.boxJs || note.state !== "open") return;
    if (this.editor?.id === note.id) return this.editor.fields.title.focus();
    this.closeEditor(cx);
    const texts = startTexts(note);
    const editor = { id: note.id, number: note.number, title: note.title, folder: this.shownFolder(), project: this.answer()?.project?.key ?? null, typing: null, target: null, similar: [], link: null, error: "", isFiling: false };
    editor.auto = Object.fromEntries(SECTIONS.map((name) => [name, checkedText(note, name)]));
    editor.fine = new Set(note.draft?.fine ?? []);
    editor.notGone = note.draft?.notGone ?? null;
    editor.saved = JSON.stringify(note.draft ?? null);
    editor.seenCheck = JSON.stringify(note.check ?? null);
    editor.fields = { title: this.field(editor, "title", texts.title) };
    for (const name of SECTIONS) editor.fields[name] = this.field(editor, name, texts.sections[name]);
    if (editor.notGone) editor.reason = this.reasonField(editor, editor.notGone.reason);
    this.editor = editor;
    this.expanded.add(note.id);
    this.selected = note.id;
    this.check(cx, note, { reuse: true });
    this.lookUp(cx);
    editor.fields.title.focus();
    cx.notify();
  },

  field(editor, name, value) {
    const state = name === "title" ? InputState.new({ value }) : TextareaState.new({ value });
    if (name !== "title") state.set_auto_grow(2, 10);
    state.on("change", (_e, cx) => cx.notify());
    state.on("focus", (_e, cx) => {
      editor.typing = name;
      cx.notify();
    });
    state.on("blur", (_e, cx) => {
      if (editor.typing === name) editor.typing = null;
      if (this.editor === editor) this.saveDraft(cx);
      cx.notify();
    });
    return state;
  },

  reasonField(editor, value = "") {
    const state = InputState.new({ placeholder: "Why it is not solved (kept with the note)", value });
    state.on("change", (_e, cx) => {
      editor.notGone = { reason: state.value() };
      cx.notify();
    });
    state.on("focus", () => (editor.typing = "reason"));
    state.on("blur", (_e, cx) => {
      if (editor.typing === "reason") editor.typing = null;
      if (this.editor === editor) this.saveDraft(cx);
    });
    return state;
  },

  textsOf(editor) {
    const value = (name) => editor.fields[name].value();
    return { title: value("title"), sections: Object.fromEntries(SECTIONS.map((name) => [name, value(name)])) };
  },

  // The draft as the note keeps it: null while the fields hold what the check put there.
  draftOf(editor) {
    const texts = this.textsOf(editor);
    const untouched = texts.title === editor.title && SECTIONS.every((name) => texts.sections[name] === editor.auto[name]);
    if (untouched && !editor.fine.size && !editor.notGone) return null;
    return { ...texts, fine: [...editor.fine], notGone: editor.notGone };
  },

  saveDraft(cx) {
    const editor = this.editor;
    if (!editor || editor.isFiling) return;
    const draft = this.draftOf(editor);
    const text = JSON.stringify(draft);
    if (text === editor.saved) return;
    editor.saved = text;
    this.write(cx, ["draft", editor.folder, editor.id, text]);
  },

  // Cancel, a closed panel or another project: the draft is kept, and the fields are let go.
  closeEditor(cx, { save = true } = {}) {
    const editor = this.editor;
    if (!editor) return;
    if (save) this.saveDraft(cx);
    this.editor = null;
    for (const state of [...Object.values(editor.fields), editor.reason].filter(Boolean)) state.release();
    // The keyboard was in a field that is gone: it goes to the panel, if the panel is still there.
    if (editor.typing && isShown(BLOCK)) this.handle.focus();
  },

  // Where the issue goes, similar open issues and the code link, for the editor that asked.
  lookUp(cx) {
    const editor = this.editor;
    if (!editor) return;
    cx.spawn(async (cx) => {
      try {
        const answer = await box(this.node, this.boxJs, ["target", editor.folder, editor.id], LOOKUP_MS);
        Object.assign(editor, { target: answer.target, similar: answer.similar, link: answer.link });
      } catch (error) {
        editor.target = { kind: "github", why: `Could not look up where it goes: ${error.message}` };
      }
      cx.notify();
    });
  },

  // A newer read of the note: a check that came in puts its texts in the fields nobody changed.
  syncEditor(answer) {
    const editor = this.editor;
    const note = (answer.notes ?? []).find((one) => one.id === editor?.id);
    if (!note || JSON.stringify(note.check ?? null) === editor.seenCheck) return;
    editor.seenCheck = JSON.stringify(note.check ?? null);
    for (const name of SECTIONS) {
      if (editor.fields[name].value() !== editor.auto[name]) continue;
      editor.auto[name] = checkedText(note, name);
      editor.fields[name].set_value(editor.auto[name]);
    }
  },

  editorAct(cx, name, note) {
    const editor = this.editor;
    if (!editor) return;
    if (name === "cancel") this.closeEditor(cx);
    if (name === "create") return this.create(cx);
    if (name === "copy") return this.copyIssue(cx);
    if (name === "fine") editor.fine.add(note.hit);
    if (name === "not-gone") {
      editor.reason ??= this.reasonField(editor);
      editor.notGone = { reason: editor.reason.value() };
      editor.reason.focus();
    }
    if (name === "take-back") editor.notGone = null;
    if (name === "swap") editor.fields[note.section].set_value(swapText(this.noteById(editor.id), note.section, note.to));
    if (name === "start-over") this.startOver(editor);
    if (["fine", "take-back", "swap", "start-over"].includes(name)) this.saveDraft(cx);
    cx.notify();
  },

  startOver(editor) {
    const note = this.noteById(editor.id);
    if (!note) return;
    editor.title = note.title;
    editor.fields.title.set_value(note.title);
    for (const name of SECTIONS) {
      editor.auto[name] = checkedText(note, name);
      editor.fields[name].set_value(editor.auto[name]);
    }
    editor.fine.clear();
    editor.notGone = null;
  },

  // Why Create issue is off for the open editor, or null.
  offFor(editor) {
    const note = this.noteById(editor.id);
    if (!note) return "The note is gone";
    const texts = this.textsOf(editor);
    return offReason({ note, texts, target: editor.target, isChecking: this.checking.has(editor.id), isFiling: editor.isFiling, notGone: editor.notGone, fine: [...editor.fine] });
  },

  // Create issue: after the writes before it, so the draft it files is the one on disk too.
  create(cx) {
    const editor = this.editor;
    if (!editor || this.offFor(editor)) return cx.notify();
    const value = { ...this.textsOf(editor), fine: [...editor.fine], notGone: editor.notGone, repo: editor.target.repo };
    editor.isFiling = true;
    editor.error = "";
    this.mine.set(editor.id, Date.now() + 15000);
    const send = () => box(this.node, this.boxJs, ["file", editor.folder, editor.id, JSON.stringify(value)], FILE_MS).then((answer) => ({ answer }), (error) => ({ error }));
    this.queue = this.queue.then(send);
    const done = this.queue;
    cx.spawn(async (cx) => {
      const { answer, error } = await done;
      editor.isFiling = false;
      if (error) this.filingFailed(cx, editor, value, error);
      else {
        // Closed meanwhile, the panel has moved what it filed to Filed already.
        if (isShown(BLOCK)) this.justFiled.add(editor.project, editor.id);
        if (this.editor === editor) this.closeEditor(cx, { save: false });
        const board = answer.board?.error ? `; not on the board: ${answer.board.error}` : "";
        this.say(cx, answer.warning ?? `Filed #${answer.issue.number}${board}.`);
      }
      this.read(cx, false);
      cx.notify();
    });
    cx.notify();
  },

  // A filing that failed says so where the person looks: in its editor while that is open, else on
  // the panel. The editor that is gone could not keep its draft while it filed, so it is kept now.
  filingFailed(cx, editor, value, error) {
    if (this.editor === editor) {
      editor.error = error.message;
      return;
    }
    this.error = `Note ${editor.number} was not filed: ${error.message}`;
    const draft = { title: value.title, sections: value.sections, fine: value.fine, notGone: value.notGone };
    // Not through write(): its success would clear the error just shown.
    const keep = () => box(this.node, this.boxJs, ["draft", editor.folder, editor.id, JSON.stringify(draft)]).catch((failed) => console.log(`suggestion box: the draft of note ${editor.number} was not kept: ${failed.message}`));
    this.queue = this.queue.then(keep);
  },

  // Copy issue, for a tracker outside GitHub: the title and the issue text on the clipboard.
  copyIssue(cx) {
    const editor = this.editor;
    const note = editor && this.noteById(editor.id);
    if (!note || this.offFor(editor)) return cx.notify();
    const texts = this.textsOf(editor);
    cx.write_to_clipboard(`${texts.title.trim()}\n\n${issueText(texts, { link: editor.link, ticket: note.from?.ticket ?? null })}`);
    this.say(cx, `Copied note ${note.number} as an issue. Paste it in ${editor.target.kind}, then bin the note.`);
    cx.notify();
  },

  copyCloses(cx, note) {
    cx.write_to_clipboard(note.issue?.closes ?? "");
    this.say(cx, `Copied "${note.issue?.closes}": put it in the fix's PR so the issue closes with it.`);
    cx.notify();
  },

  openUrl(note) {
    const url = note.url ?? note.issue?.url;
    if (!url) return;
    exec(window()?.platform === "macos" ? "open" : "xdg-open", [url]).catch((error) => notify({ title: "Suggestion box", body: `${url} did not open: ${error}`, level: "error" }));
  },

  // What the panel draws of the open editor.
  editorView() {
    const editor = this.editor;
    const note = editor && this.noteById(editor.id);
    if (!note) return null;
    const isChecking = this.checking.has(editor.id);
    const texts = this.textsOf(editor);
    const labels = Object.fromEntries(SECTIONS.map((name) => [name, fieldLabel(note, name, texts.sections[name], { isChecking })]));
    const hits = scanTexts(texts).map((hit) => ({ ...hit, isFine: editor.fine.has(hit.text) }));
    const draft = this.draftOf(editor);
    return {
      id: editor.id, fields: editor.fields, reason: editor.reason, texts, labels, hits, isChecking,
      target: editor.target, line: targetLine(editor.target), similar: editor.similar,
      off: this.offFor(editor), error: editor.error, isFiling: editor.isFiling, notGone: editor.notGone,
      gone: isChecking ? null : note.check?.gone ?? null, checkError: isChecking ? null : note.check?.error ?? null,
      canCopy: Boolean(editor.target && editor.target.kind !== "github"), canStartOver: Boolean(draft),
    };
  },
};
