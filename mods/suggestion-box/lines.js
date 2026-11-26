// Following a note's lines while the code moves: through the hunks of a `git diff -U0`, or by
// finding the note's snippet again. Pure: no Herdr and no Node imports.

// The hunks of a `git diff -U0` as { oldStart, oldCount, newStart, newCount }.
export function parseHunks(diff) {
  const hunks = [];
  for (const line of String(diff ?? "").split("\n")) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) continue;
    hunks.push({
      oldStart: Number(match[1]),
      oldCount: match[2] === undefined ? 1 : Number(match[2]),
      newStart: Number(match[3]),
      newCount: match[4] === undefined ? 1 : Number(match[4]),
    });
  }
  return hunks;
}

// Whether any hunk changes lines first..last of the old file: removes or rewrites one of them, or
// inserts between two of them.
export function touches(hunks, first, last) {
  return hunks.some((hunk) => {
    if (hunk.oldCount === 0) return hunk.oldStart >= first && hunk.oldStart < last;
    const end = hunk.oldStart + hunk.oldCount - 1;
    return hunk.oldStart <= last && end >= first;
  });
}

// The lines a note covers: its snippet, else its one line, as { first, last }.
export function noteRange(note) {
  if (note.snippet?.lines?.length) return { first: note.snippet.start, last: note.snippet.start + note.snippet.lines.length - 1 };
  if (note.at?.line) return { first: note.at.line, last: note.at.line };
  return null;
}

const squash = (line) => line.replace(/\s+/g, " ").trim();

// Where the snippet starts in a file's text now, nearest its old place, or null when it is gone.
// Spacing does not count. A snippet of nothing but brackets and blank lines proves nothing.
export function findSnippet(text, snippet, near = 1) {
  const wanted = (snippet?.lines ?? []).map(squash);
  if (!wanted.some((line) => /[\w]/.test(line))) return null;
  const lines = String(text ?? "").split("\n").map(squash);
  let best = null;
  for (let start = 0; start + wanted.length <= lines.length; start++) {
    if (!wanted.every((line, i) => lines[start + i] === line)) continue;
    const at = start + 1;
    if (best === null || Math.abs(at - near) < Math.abs(best - near)) best = at;
  }
  return best;
}
