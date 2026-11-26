// Writes the button's pixel icon into mods/suggestion-box/icons.
//   bun scripts/make-icon.js
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { files } from "./icon.js";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "mods", "suggestion-box", "icons");
mkdirSync(out, { recursive: true });
for (const [name, bytes] of Object.entries(files())) writeFileSync(join(out, name), bytes);
console.log(`icon: wrote ${Object.keys(files()).length} files to ${out}`);
