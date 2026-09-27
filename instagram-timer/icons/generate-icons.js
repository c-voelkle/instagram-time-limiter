#!/usr/bin/env node
'use strict';

// Generates icon16/32/48/128.png with no dependencies: a rounded square with
// an Instagram-style gradient and a white clock face. Run from any directory:
//   node icons/generate-icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 4;

const GRADIENT = [
  [0.0, [131, 58, 180]], // purple
  [0.5, [253, 29, 29]], // red
  [1.0, [252, 176, 69]], // orange
];

function lerpColor(t) {
  for (let i = 1; i < GRADIENT.length; i++) {
    const [t1, c1] = GRADIENT[i];
    const [t0, c0] = GRADIENT[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return c0.map((v, j) => v + (c1[j] - v) * k);
    }
  }
  return GRADIENT[GRADIENT.length - 1][1];
}

function insideRoundedSquare(x, y, radius) {
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Returns [r, g, b, a] for a point in unit coordinates (0..1).
function sample(x, y) {
  if (!insideRoundedSquare(x, y, 0.22)) return [0, 0, 0, 0];

  const cx = 0.5;
  const cy = 0.5;
  const dist = Math.hypot(x - cx, y - cy);
  const ringOuter = 0.34;
  const ringInner = 0.26;
  const handWidth = 0.045;

  const onRing = dist <= ringOuter && dist >= ringInner;
  const onHourHand = distanceToSegment(x, y, cx, cy, cx, cy - 0.17) <= handWidth;
  const onMinuteHand = distanceToSegment(x, y, cx, cy, cx + 0.13, cy + 0.06) <= handWidth;

  if (onRing || onHourHand || onMinuteHand) return [255, 255, 255, 255];

  const [r, g, b] = lerpColor((x + (1 - y)) / 2);
  return [r, g, b, 255];
}

function renderPixels(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const n = SUPERSAMPLE * SUPERSAMPLE;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) / size;
          const y = (py + (sy + 0.5) / SUPERSAMPLE) / size;
          const [sr, sg, sb, sa] = sample(x, y);
          r += sr * sa;
          g += sg * sa;
          b += sb * sa;
          a += sa;
        }
      }
      const i = (py * size + px) * 4;
      pixels[i] = a ? Math.round(r / a) : 0;
      pixels[i + 1] = a ? Math.round(g / a) : 0;
      pixels[i + 2] = a ? Math.round(b / a) : 0;
      pixels[i + 3] = Math.round(a / n);
    }
  }
  return pixels;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of SIZES) {
  const file = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(file, encodePng(size, renderPixels(size)));
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
}
