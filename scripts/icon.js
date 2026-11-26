// The tab bar button's icon, a pixel suggestion box with a note going into its slot, drawn cell by
// cell as Parrot draws its parrot: 16 x 16 cells, written at 2 pixels a cell (shown at 16 points,
// sharp on a Retina screen), in colour and in grey for while collecting is off.
//   bun scripts/make-icon.js
import { deflateSync } from "node:zlib";

export const PAL = {
  K: "#1c1719", // outline
  Y: "#f7bd1d", // the note
  y: "#b8860b", // its lines
  h: "#d9a066", // the lid, lit
  S: "#2b1d12", // the slot
  P: "#a8723c", // wood
  p: "#6c4421", // wood in shadow
  W: "#f7f3ec", // the label
};

export const BOX = [
  "......KKKKKK......",
  "......KYYYYK......",
  "......KyyyyK......",
  "......KYYYYK......",
  "..KKKKKYyyYKKKKK..",
  "..KhhhKSSSSKhhhK..",
  "..KKKKKKKKKKKKKK..",
  "..KhPPPPPPPPPPPK..",
  "..KPPPPPPPPPPPPK..",
  "..KPPPKKKKKKPPPK..",
  "..KPPPKWWWWKPPPK..",
  "..KPPPKKKKKKPPPK..",
  "..KPPPPPPPPPPPPK..",
  "..KppppppppppppK..",
  "..KKKKKKKKKKKKKK..",
].map((row) => row.slice(1, 17));

// The grid made square: 16 rows, the note at the top and an empty row under the box.
export function grid() {
  const rows = [...BOX, ".".repeat(16)];
  return rows.map((row) => [...row].map((cell) => (cell === "." ? null : cell)));
}

// The same picture without colour, for the button while collecting is off.
export function grey(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l = Math.round(0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255));
  return [l, l, l];
}

const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// A grid as an RGBA PNG, each cell `scale` pixels wide, transparent where the grid is empty.
export function png(cells, scale, colour = rgb) {
  const h = cells.length * scale, w = cells[0].length * scale, stride = w * 4 + 1;
  const rows = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cells[Math.floor(y / scale)][Math.floor(x / scale)];
    if (!c) continue;
    const [r, g, b] = colour(PAL[c]), i = y * stride + 1 + x * 4;
    rows[i] = r; rows[i + 1] = g; rows[i + 2] = b; rows[i + 3] = 255;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

export const SCALE = 2;

// Every icon file the mod needs, by name.
export function files() {
  return { "box.png": png(grid(), SCALE), "box-off.png": png(grid(), SCALE, grey), "box-large.png": png(grid(), 8) };
}
