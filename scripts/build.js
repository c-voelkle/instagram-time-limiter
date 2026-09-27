#!/usr/bin/env node
'use strict';

// Builds browser-specific copies of the extension into dist/:
//
//   dist/chromium  Chrome, Edge, Brave, Opera, Vivaldi, Arc (same as src/)
//   dist/firefox   Firefox 115+ (background scripts + gecko settings)
//
// Usage: node scripts/build.js   (no dependencies)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const FIREFOX_ID = 'instagram-time-limiter@extension';

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

function writeManifest(dir, manifest) {
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

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
        strict_min_version: '115.0',
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
};

fs.rmSync(DIST, { recursive: true, force: true });
for (const [name, manifest] of Object.entries(targets)) {
  const out = path.join(DIST, name);
  copyDir(SRC, out);
  writeManifest(out, manifest);
  console.log(`Built ${path.relative(ROOT, out)}`);
}
