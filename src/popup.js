'use strict';

// Depends on shared.js.

const elapsedEl = document.getElementById('elapsed');
const progressEl = document.getElementById('progress-bar');
const statusEl = document.getElementById('status');
const incognitoWarningEl = document.getElementById('incognito-warning');
const contactNoticeEl = document.getElementById('contact-notice');
const noPasswordEl = document.getElementById('no-password');
const unlockForm = document.getElementById('unlock-form');
const unlockInput = document.getElementById('unlock-password');
const unlockFeedbackEl = document.getElementById('unlock-feedback');
const settingsForm = document.getElementById('settings-form');
const settingsFields = document.getElementById('settings-fields');
const limitInput = document.getElementById('daily-limit');
const curfewInput = document.getElementById('curfew');
const feedbackEl = document.getElementById('feedback');
const unlockedFooter = document.getElementById('unlocked-footer');
const unlockedUntilEl = document.getElementById('unlocked-until');

let settings = { ...DEFAULT_SETTINGS };
let state = null;
let auth = null;
let unlockedUntil = 0;
let feedbackTimer = null;

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

function renderTime() {
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
    if (isPastCurfew(settings, now)) {
      parts.push(`Curfew active since ${settings.curfew}`);
      alert = true;
    } else {
      parts.push(`Curfew at ${settings.curfew}`);
    }
  }
  statusEl.textContent = parts.join(' · ');
  statusEl.classList.toggle('alert', alert);
}

function renderLock() {
  const unlocked = !auth || unlockedUntil > Date.now();
  noPasswordEl.hidden = Boolean(auth);
  unlockForm.hidden = unlocked;
  settingsFields.disabled = !unlocked;
  unlockedFooter.hidden = !auth || !unlocked;
  if (auth && unlocked) {
    const time = new Date(unlockedUntil).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    unlockedUntilEl.textContent = `Unlocked until ${time}`;
  }
}

function renderContact(email) {
  contactNoticeEl.hidden = !email;
  contactNoticeEl.textContent = email ? removalWarning(email) : '';
}

function render() {
  renderTime();
  renderLock();
}

function showFeedback(el, text, kind) {
  clearTimeout(feedbackTimer);
  el.textContent = text;
  el.className = `feedback visible ${kind}`;
  feedbackTimer = setTimeout(() => el.classList.remove('visible'), 2500);
}

async function load() {
  const stored = await chrome.storage.local.get(['settings', 'state', 'auth', 'contactEmail']);
  settings = { ...DEFAULT_SETTINGS, ...stored.settings };
  state = stored.state || null;
  auth = stored.auth || null;
  renderContact(stored.contactEmail);
  ({ unlockedUntil = 0 } = await chrome.storage.session.get('unlockedUntil'));

  limitInput.value = settings.dailyLimitMinutes;
  curfewInput.value = settings.curfew || '';
  render();

  try {
    incognitoWarningEl.hidden = await chrome.extension.isAllowedIncognitoAccess();
  } catch {
    incognitoWarningEl.hidden = true;
  }
}

unlockForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (await verifyPassword(unlockInput.value, auth)) {
    unlockInput.value = '';
    await unlockFor();
  } else {
    showFeedback(unlockFeedbackEl, 'Wrong password', 'error');
    unlockInput.select();
  }
});

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (auth && !(await isUnlocked())) {
    render();
    showFeedback(feedbackEl, 'Locked — enter your password', 'error');
    return;
  }

  const minutes = Number(limitInput.value);
  if (limitInput.value.trim() === '' || !Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    showFeedback(feedbackEl, 'Enter 0–1440 minutes', 'error');
    limitInput.focus();
    return;
  }
  const curfew = curfewInput.value;
  if (curfew && !/^\d{2}:\d{2}$/.test(curfew)) {
    showFeedback(feedbackEl, 'Invalid curfew time', 'error');
    curfewInput.focus();
    return;
  }

  settings = { dailyLimitMinutes: minutes, curfew };
  await chrome.storage.local.set({ settings });
  render();
  showFeedback(feedbackEl, 'Saved ✓', 'ok');
});

function openSetup() {
  chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
  window.close();
}

document.getElementById('set-password').addEventListener('click', openSetup);
document.getElementById('change-password').addEventListener('click', openSetup);
document.getElementById('lock-now').addEventListener('click', () => lockNow());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.state) state = changes.state.newValue || null;
    if (changes.auth) auth = changes.auth.newValue || null;
    if (changes.contactEmail) renderContact(changes.contactEmail.newValue);
    if (changes.settings) {
      settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
      limitInput.value = settings.dailyLimitMinutes;
      curfewInput.value = settings.curfew || '';
    }
  }
  if (area === 'session' && changes.unlockedUntil) {
    unlockedUntil = changes.unlockedUntil.newValue || 0;
  }
  render();
});

load();
setInterval(render, 1000);
