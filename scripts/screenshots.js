#!/usr/bin/env node
'use strict';

// Renders the store screenshots (1280x800 PNG) and the small promo tile
// (440x280) into store/screenshots/ from the
// real extension pages, using headless Chrome and a stubbed `chrome` API that
// serves sample data.
//
// Usage: node scripts/screenshots.js   (needs Google Chrome or Edge installed)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'store', 'screenshots');
const WORK = path.join(ROOT, 'dist', 'screenshot-pages');

const WIDTH = 1280;
const HEIGHT = 800;

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

// Minimal stand-in for the extension APIs. Unknown properties resolve to
// no-op functions so pages can register listeners without errors.
const STUB = `'use strict';
(() => {
  const now = Date.now();
  const d = new Date(now);
  const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const data = {
    local: {
      settings: { dailyLimitMinutes: 30, curfew: '22:00' },
      state: { date: today, accumulatedSeconds: 18 * 60 + 25, sessionStart: null },
      auth: window.__SHOT_AUTH === false ? undefined : { salt: 'AA==', hash: 'AA==', iterations: 1 },
      lockExtensionsPage: true,
    },
    session: { unlockedUntil: now + 4 * 60 * 1000 },
  };
  const pick = (store, keys) => {
    const list = keys == null ? Object.keys(store) : [].concat(keys);
    const out = {};
    for (const k of list) if (store[k] !== undefined) out[k] = store[k];
    return out;
  };
  const noop = () => new Proxy(function () {}, {
    get: (_, key) => (key === 'then' ? undefined : noop()),
    apply: () => Promise.resolve(undefined),
  });
  const storage = (name) => ({ get: async (keys) => pick(data[name], keys), set: async () => {} });
  const api = {
    storage: { local: storage('local'), session: storage('session'), onChanged: { addListener() {} } },
    extension: { isAllowedIncognitoAccess: async () => true },
    runtime: { getURL: (p) => p, sendMessage: async () => {}, onMessage: { addListener() {} } },
  };
  window.chrome = new Proxy(api, { get: (target, key) => (key in target ? target[key] : noop()) });
})();
`;

const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

// Screenshot 1: the popup, shown large next to a short caption.
const POPUP_SHOWCASE = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    display: flex; align-items: center; justify-content: center; gap: 90px;
    background: linear-gradient(135deg, #f6f0fb, #fdeeee 55%, #fff5e6);
    font-family: ${FONT}; color: #1c1c21;
  }
  .copy { max-width: 440px; }
  h1 { margin: 0 0 18px; font-size: 46px; line-height: 1.12; letter-spacing: -0.5px; }
  p { margin: 0; font-size: 21px; line-height: 1.5; color: #55555f; }
  .frame {
    width: 300px; height: 492px; transform: scale(1.3); transform-origin: center;
    border-radius: 14px; overflow: hidden; background: #fff;
    box-shadow: 0 24px 60px rgba(60, 20, 80, 0.22);
  }
  iframe { width: 300px; height: 492px; border: 0; display: block; }
</style></head><body>
  <div class="copy">
    <h1>Set a daily limit for Instagram and X</h1>
    <p>See today's time at a glance, choose your limit and a bedtime curfew. Changes are protected by your password.</p>
  </div>
  <div class="frame"><iframe src="popup.html"></iframe></div>
</body></html>`;

// Screenshot 2: the real countdown overlay on a neutral placeholder page.
const COUNTDOWN_SHOWCASE = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body { background: #eeeef2; font-family: ${FONT}; }
  .feed { width: 520px; margin: 36px 0 0 500px; display: grid; gap: 22px; filter: blur(1.5px); }
  .post { background: #fff; border-radius: 14px; padding: 16px; }
  .row { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .dot { width: 38px; height: 38px; border-radius: 50%; background: #d8d8e0; }
  .line { height: 12px; border-radius: 6px; background: #e0e0e7; }
  .img { height: 380px; border-radius: 10px; background: linear-gradient(135deg, #d9d6e4, #e8dfe3); }
  .caption {
    position: fixed; left: 56px; top: 64px; max-width: 380px;
    font-size: 40px; line-height: 1.15; font-weight: 700; color: #1c1c21; letter-spacing: -0.5px;
  }
  .caption span { display: block; margin-top: 12px; font-size: 19px; line-height: 1.5; font-weight: 400; color: #55555f; }
</style></head><body>
  <div class="caption">A gentle warning first<span>When time runs out while you're scrolling, a 10-second countdown appears before the tab closes.</span></div>
  <div class="feed">
    <div class="post"><div class="row"><div class="dot"></div><div class="line" style="width:160px"></div></div><div class="img"></div></div>
    <div class="post"><div class="row"><div class="dot"></div><div class="line" style="width:120px"></div></div><div class="img"></div></div>
  </div>
  <script src="stub.js"></script>
  <script src="shared.js"></script>
  <script src="background.js"></script>
  <script>
    showCountdownOverlay(BLOCK_SCENES.limit, 7);
    clearInterval(window.__igTimeLimiterInterval);
    // Scale the card up so it reads well in the store gallery.
    const host = document.getElementById('ig-time-limiter-overlay');
    const card = host.shadowRoot.querySelector('.card');
    card.style.transformOrigin = 'bottom right';
    card.style.transform = 'scale(1.45)';
    card.style.right = '48px';
    card.style.bottom = '48px';
    card.style.animation = 'none';
  </script>
</body></html>`;

// Small promo tile (440x280) for the Chrome Web Store listing.
const PROMO_TILE = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  html, body { margin: 0; width: 440px; height: 280px; overflow: hidden; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
    background: linear-gradient(135deg, #833ab4, #fd1d1d 55%, #fcb045);
    font-family: ${FONT}; color: #fff; text-align: center;
  }
  img { width: 88px; height: 88px; border-radius: 22px; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.25); }
  h1 { margin: 0; font-size: 30px; line-height: 1.15; letter-spacing: -0.3px; }
  p { margin: 0; font-size: 16px; opacity: 0.92; }
</style></head><body>
  <img src="icons/icon128.png" alt="">
  <div><h1>Time Limiter for Instagram</h1><p>Daily limit · Curfew · Password lock</p></div>
</body></html>`;

function findBrowser() {
  const found = BROWSERS.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Chrome or Edge not found. Set CHROME_PATH to the browser executable.');
  return found;
}

function injectStub(file, { noAuth = false } = {}) {
  const html = fs.readFileSync(file, 'utf8');
  const flag = noAuth ? '<script>window.__SHOT_AUTH = false;</script>\n  ' : '';
  fs.writeFileSync(file, html.replace('<script src="shared.js"></script>', `${flag}<script src="stub.js"></script>\n  <script src="shared.js"></script>`));
}

function capture(browser, page, outFile, width = WIDTH, height = HEIGHT, query = '') {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'));
  try {
    execFileSync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--allow-file-access-from-files',
      '--virtual-time-budget=3000',
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      `--screenshot=${outFile}`,
      pathToFileURL(page).href + query,
    ], { stdio: 'ignore' });
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
  console.log(`Wrote ${path.relative(ROOT, outFile)}`);
}

fs.rmSync(WORK, { recursive: true, force: true });
fs.cpSync(SRC, WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, 'stub.js'), STUB);
injectStub(path.join(WORK, 'popup.html'));
injectStub(path.join(WORK, 'setup.html'), { noAuth: true });
fs.writeFileSync(path.join(WORK, 'shot-popup.html'), POPUP_SHOWCASE);
fs.writeFileSync(path.join(WORK, 'shot-countdown.html'), COUNTDOWN_SHOWCASE);
fs.writeFileSync(path.join(WORK, 'shot-promo.html'), PROMO_TILE);

fs.mkdirSync(OUT, { recursive: true });
const browser = findBrowser();
capture(browser, path.join(WORK, 'shot-popup.html'), path.join(OUT, '1-popup.png'));
capture(browser, path.join(WORK, 'shot-countdown.html'), path.join(OUT, '2-countdown.png'));
capture(browser, path.join(WORK, 'blocked.html'), path.join(OUT, '3-block-page.png'), WIDTH, HEIGHT, '?reason=limit');
capture(browser, path.join(WORK, 'blocked.html'), path.join(OUT, '4-curfew-page.png'), WIDTH, HEIGHT, '?reason=curfew');
capture(browser, path.join(WORK, 'setup.html'), path.join(OUT, '5-password-setup.png'));
capture(browser, path.join(WORK, 'shot-promo.html'), path.join(OUT, 'promo-tile-440x280.png'), 440, 280);
