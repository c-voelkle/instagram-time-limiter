'use strict';

// Helpers shared by the background script and the extension pages.
// Loaded with importScripts() in the Chromium service worker, as a background
// script in Firefox, and with a <script> tag in popup/setup/unlock pages.

// Sites that share the daily limit and curfew. twitter.com redirects to x.com.
const SITE_URL = /^https?:\/\/([a-z0-9-]+\.)*(instagram\.com|x\.com|twitter\.com)(\/|$)/i;
const SITE_MATCHES = ['*://*.instagram.com/*', '*://*.x.com/*', '*://*.twitter.com/*'];

// What the countdown overlay and the block page show for each reason.
const BLOCK_SCENES = {
  limit: {
    title: 'Es ist Zeit, Deutsch zu lernen!',
    text: 'Dein Tageslimit ist erreicht. Morgen geht es weiter.',
    emoji: '🥨',
    floaters: ['Ä', 'Ö', 'Ü', 'ß', 'Hallo!', 'Danke', 'Tschüss', 'der', 'die', 'das'],
  },
  curfew: {
    title: 'Es ist Zeit, ein Buch zu lesen!',
    text: 'Die Sperrzeit hat begonnen. Ab Mitternacht geht es weiter.',
    emoji: '📚',
    floaters: ['🌙', '✨', '⭐', '📖', '💤', '✨', '⭐'],
  },
};

// Browser pages that can disable or remove the extension. While a password is
// set and the extension is locked, these are replaced with the unlock page.
const MANAGEMENT_PAGE =
  /^(chrome|edge|brave|opera|vivaldi):\/\/(extensions|settings\/extensions)\b|^about:(addons|debugging)\b/i;

const DEFAULT_SETTINGS = { dailyLimitMinutes: 30, curfew: '22:00' };

// Never credit more than this between two tracking checkpoints. Ticks arrive
// every 30s, so a larger gap means the computer slept or the browser was
// suspended and that time should not count as usage.
const MAX_CREDIT_MS = 90 * 1000;

// How long a correct password keeps settings and the extensions page open.
const UNLOCK_MINUTES = 5;

const PBKDF2_ITERATIONS = 200000;

// --- Removal notification ------------------------------------------------------
//
// If an accountability contact is set, the browser opens this page when the
// extension is removed, and the page emails the contact. The address goes in
// the URL fragment, which browsers never send to the web server.

const NOTIFY_PAGE = 'https://c-voelkle.github.io/instagram-time-limiter/goodbye.html';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function notifyUrl(email, { test = false } = {}) {
  const params = new URLSearchParams({ to: email });
  if (test) params.set('test', '1');
  return `${NOTIFY_PAGE}#${params}`;
}

function removalWarning(email) {
  return `Wenn diese Erweiterung entfernt wird, wird ${email} per E-Mail benachrichtigt.`;
}

// --- Dates -----------------------------------------------------------------

function todayKey(now = Date.now()) {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function startOfDay(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Returns today's curfew timestamp, or null when no curfew is configured.
function curfewTimestamp(settings, now) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(settings.curfew || '');
  if (!match) return null;
  const d = new Date(now);
  d.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return d.getTime();
}

// The curfew applies from the configured time until midnight.
function isPastCurfew(settings, now) {
  const ts = curfewTimestamp(settings, now);
  return ts !== null && now >= ts;
}

// --- Settings ----------------------------------------------------------------

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

// --- Password ------------------------------------------------------------------

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return {
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hash),
    iterations: PBKDF2_ITERATIONS,
  };
}

async function verifyPassword(password, auth) {
  if (!auth) return false;
  const hash = await derive(password, base64ToBytes(auth.salt), auth.iterations);
  const expected = base64ToBytes(auth.hash);
  if (hash.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i];
  return diff === 0;
}

async function getAuth() {
  const { auth } = await chrome.storage.local.get('auth');
  return auth || null;
}

// The unlock window is kept in session storage so it never outlives the
// browser session.
async function isUnlocked() {
  const { unlockedUntil } = await chrome.storage.session.get('unlockedUntil');
  return (unlockedUntil || 0) > Date.now();
}

async function unlockFor(minutes = UNLOCK_MINUTES) {
  await chrome.storage.session.set({ unlockedUntil: Date.now() + minutes * 60 * 1000 });
}

async function lockNow() {
  await chrome.storage.session.set({ unlockedUntil: 0 });
}
