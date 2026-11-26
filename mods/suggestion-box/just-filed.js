// Notes filed while the panel is open, kept in the app's storage per project, so a reload of the mod
// keeps them in sight.

// The notes filed while the panel is open, per project. Kept in the app's storage, so a reload of the
// mod (an update) or of the app keeps them in sight; they go to the history when the panel closes,
// when another project shows, and after two hours at the latest.
const JUST_FILED = "suggestion-box.just-filed";

const JUST_FILED_MS = 2 * 3600000;

export class JustFiled {
  // `storageKey`: the tests keep theirs apart from the app's own.
  constructor(storageKey = JUST_FILED) {
    this.storageKey = storageKey;
  }

  // What is kept, as { <project key>: [{ id, at }] } with only the items under two hours old; a
  // value in any other shape counts as nothing kept, so it can never stop the panel from drawing.
  read() {
    try {
      const kept = JSON.parse(localStorage.getItem(this.storageKey) ?? "null");
      if (!kept || typeof kept !== "object" || Array.isArray(kept)) return {};
      const fresh = {};
      for (const [key, items] of Object.entries(kept)) {
        if (!Array.isArray(items)) continue;
        const left = items.filter((item) => typeof item?.id === "string" && typeof item.at === "number" && Date.now() - item.at < JUST_FILED_MS);
        if (left.length) fresh[key] = left;
      }
      return fresh;
    } catch (error) {
      console.log(`suggestion box: no just-filed notes kept: ${error}`);
      return {};
    }
  }

  // The ids for a project, as a Set the panel draws from.
  for(key) {
    return new Set(key ? (this.read()[key] ?? []).map((item) => item.id) : []);
  }

  add(key, id) {
    if (!key) return;
    const kept = this.read();
    kept[key] = [...(kept[key] ?? []).filter((item) => item.id !== id), { id, at: Date.now() }];
    this.write(kept);
  }

  // One project's (when you leave it), or every project's (when the panel closes).
  clear(key = null) {
    if (key === null) return this.write(null);
    const kept = this.read();
    delete kept[key];
    this.write(kept);
  }

  write(value) {
    try {
      if (value && Object.keys(value).length) localStorage.setItem(this.storageKey, JSON.stringify(value));
      else localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.log(`suggestion box: could not keep the just-filed notes: ${error}`);
    }
  }
}
