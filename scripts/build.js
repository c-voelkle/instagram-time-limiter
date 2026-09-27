#!/usr/bin/env node
'use strict';

// Builds browser-specific copies of the extension into dist/:
//
//   dist/chromium/                              Chrome, Edge, Brave, Opera, Vivaldi, Arc
//   dist/firefox/                               Firefox 140+
//   dist/instagram-time-limiter-chromium.zip    for Edge Add-ons / Opera / manual install
//   dist/instagram-time-limiter-firefox.zip     for addons.mozilla.org
//
// The zips have manifest.json at their root, as the stores require.
//
// Usage: node scripts/build.js   (no dependencies)

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const PACKAGE_NAME = 'instagram-time-limiter';
const FIREFOX_ID = 'instagram-time-limiter@c-voelkle.github.io';

// --- Files -------------------------------------------------------------------

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

function listFiles(dir, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(path.join(dir, entry.name), rel));
    else files.push(rel);
  }
  return files.sort();
}

// --- Minimal ZIP writer ---------------------------------------------------------

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

// Fixed timestamp (1980-01-01) so identical sources produce identical zips.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

function writeZip(dir, outFile) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const name of listFiles(dir)) {
    const data = fs.readFileSync(path.join(dir, name));
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  fs.writeFileSync(outFile, Buffer.concat([...locals, ...centrals, end]));
}

// --- Targets -------------------------------------------------------------------

const base = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));

const targets = {
  chromium: base,
  firefox: {
    ...base,
    // Firefox runs MV3 background code as scripts rather than a service
    // worker, so shared.js is listed here instead of loaded via importScripts.
    background: { scripts: ['shared.js', 'background.js'] },
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_ID,
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
};

fs.rmSync(DIST, { recursive: true, force: true });
for (const [name, manifest] of Object.entries(targets)) {
  const out = path.join(DIST, name);
  copyDir(SRC, out);
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const zip = path.join(DIST, `${PACKAGE_NAME}-${name}.zip`);
  writeZip(out, zip);
  console.log(`Built ${path.relative(ROOT, out)} and ${path.relative(ROOT, zip)} (v${manifest.version})`);
}
