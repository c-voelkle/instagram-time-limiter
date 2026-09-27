'use strict';

// Must match the values in background.js.
const DEFAULT_SETTINGS = { dailyLimitMinutes: 30, curfew: '22:00' };
const MAX_CREDIT_MS = 90 * 1000;

const elapsedEl = document.getElementById('elapsed');
const progressEl = document.getElementById('progress-bar');
const statusEl = document.getElementById('status');
const formEl = document.getElementById('settings-form');
const limitInput = document.getElementById('daily-limit');
const curfewInput = document.getElementById('curfew');
const feedbackEl = document.getElementById('feedback');

let settings = { ...DEFAULT_SETTINGS };
let state = null;
let feedbackTimer = null;

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

// Today's total, including the portion of a session that is still running.
function elapsedSecondsToday(now) {
  if (!state) return 0;
  let total = state.date === todayKey(now) ? state.accumulatedSeconds : 0;
  if (state.sessionStart !== null && state.sessionStart !== undefined) {
    const from = Math.max(state.sessionStart, startOfDay(now));
    total += Math.min(Math.max(0, now - from), MAX_CREDIT_MS) / 1000;
  }
  return total;
}

function formatDuration(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = String(s % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, '0')}m ${seconds}s`
    : `${minutes}m ${seconds}s`;
}

function isPastCurfew(now) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(settings.curfew || '');
  if (!match) return false;
  const d = new Date(now);
  d.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return now >= d.getTime();
}

function render() {
  const now = Date.now();
  const elapsed = elapsedSecondsToday(now);
  const limitSeconds = settings.dailyLimitMinutes * 60;

  elapsedEl.textContent = formatDuration(elapsed);
  progressEl.style.width =
    limitSeconds > 0 ? `${Math.min(100, (elapsed / limitSeconds) * 100)}%` : '0%';

  const parts = [];
  let alert = false;
  if (limitSeconds > 0) {
    const remaining = limitSeconds - elapsed;
    if (remaining <= 0) {
      parts.push('Daily limit reached');
      alert = true;
    } else {
      parts.push(`${formatDuration(remaining)} left of ${settings.dailyLimitMinutes} min`);
    }
  } else {
    parts.push('No daily limit');
  }
  if (settings.curfew) {
    if (isPastCurfew(now)) {
      parts.push(`Curfew active since ${settings.curfew}`);
      alert = true;
    } else {
      parts.push(`Curfew at ${settings.curfew}`);
    }
  }
  statusEl.textContent = parts.join(' · ');
  statusEl.classList.toggle('alert', alert);
}

function showFeedback(text, kind) {
  clearTimeout(feedbackTimer);
  feedbackEl.textContent = text;
  feedbackEl.className = `feedback visible ${kind}`;
  feedbackTimer = setTimeout(() => feedbackEl.classList.remove('visible'), 2000);
}

async function load() {
  const stored = await chrome.storage.local.get(['settings', 'state']);
  settings = { ...DEFAULT_SETTINGS, ...stored.settings };
  state = stored.state || null;

  limitInput.value = settings.dailyLimitMinutes;
  curfewInput.value = settings.curfew || '';
  render();
}

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();

  const minutes = Number(limitInput.value);
  if (limitInput.value.trim() === '' || !Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    showFeedback('Enter 0–1440 minutes', 'error');
    limitInput.focus();
    return;
  }
  const curfew = curfewInput.value;
  if (curfew && !/^\d{2}:\d{2}$/.test(curfew)) {
    showFeedback('Invalid curfew time', 'error');
    curfewInput.focus();
    return;
  }

  settings = { dailyLimitMinutes: minutes, curfew };
  await chrome.storage.local.set({ settings });
  render();
  showFeedback('Saved ✓', 'ok');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.state) state = changes.state.newValue || null;
  if (changes.settings) settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
  render();
});

load();
setInterval(render, 1000);
