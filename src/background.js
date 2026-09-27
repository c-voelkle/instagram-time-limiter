'use strict';

// ---------------------------------------------------------------------------
// Instagram Time Limiter — background script
//
// Runs as a Manifest V3 service worker in Chromium browsers and as an MV3
// background script in Firefox. All tracking state lives in extension storage
// so nothing is lost when the background context is suspended. Time is
// credited in "checkpoints": every event (tab switch, window focus change,
// 30s alarm tick) adds the time since the last checkpoint to today's total
// and starts a new checkpoint.
// ---------------------------------------------------------------------------

// Chromium service worker: load shared helpers. Firefox loads shared.js via
// the manifest's background.scripts list instead.
if (typeof importScripts === 'function') importScripts('shared.js');

const TICK_ALARM = 'tick';
const LIMIT_ALARM = 'limit';
const CURFEW_ALARM = 'curfew';
const TICK_MINUTES = 0.5;

const COUNTDOWN_SECONDS = 10;

// --- Storage -----------------------------------------------------------------

async function getState(now) {
  const { state } = await chrome.storage.local.get('state');
  const today = todayKey(now);
  if (!state) {
    return { date: today, accumulatedSeconds: 0, sessionStart: null, sessionTabId: null };
  }
  if (state.date !== today) {
    // New calendar day: reset the counter but keep any running session so the
    // time since midnight is still credited to the new day.
    return { ...state, date: today, accumulatedSeconds: 0 };
  }
  return state;
}

// Pending countdowns live in session storage: they survive background
// restarts but are cleared when the browser closes.
async function getPending() {
  const { closing } = await chrome.storage.session.get('closing');
  return closing || {};
}

async function setPending(closing) {
  await chrome.storage.session.set({ closing });
}

// --- Tracking ----------------------------------------------------------------

function creditRunningSession(state, now) {
  if (state.sessionStart === null || state.sessionStart === undefined) return;
  const from = Math.max(state.sessionStart, startOfDay(now));
  const credit = Math.min(Math.max(0, now - from), MAX_CREDIT_MS);
  state.accumulatedSeconds += credit / 1000;
}

// Returns the active Instagram tab only if its window is the focused one.
async function findFocusedInstagramTab() {
  let win;
  try {
    win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
  } catch {
    return null;
  }
  if (!win || !win.focused) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!tab) return null;
  return IG_URL.test(tab.url || tab.pendingUrl || '') ? tab : null;
}

async function ensureTickAlarm() {
  const existing = await chrome.alarms.get(TICK_ALARM);
  if (!existing) {
    await chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_MINUTES });
  }
}

async function scheduleAlarms(settings, state, igTab, now) {
  const curfewTs = curfewTimestamp(settings, now);
  if (curfewTs !== null && curfewTs > now) {
    await chrome.alarms.create(CURFEW_ALARM, { when: curfewTs });
  } else {
    await chrome.alarms.clear(CURFEW_ALARM);
  }

  const limitSeconds = settings.dailyLimitMinutes * 60;
  const remainingMs = (limitSeconds - state.accumulatedSeconds) * 1000;
  if (igTab && limitSeconds > 0 && remainingMs > 0) {
    await chrome.alarms.create(LIMIT_ALARM, { when: now + remainingMs });
  } else {
    await chrome.alarms.clear(LIMIT_ALARM);
  }
}

async function evaluate() {
  const now = Date.now();
  const settings = await getSettings();
  const state = await getState(now);

  creditRunningSession(state, now);

  const igTab = await findFocusedInstagramTab();
  state.sessionStart = igTab ? now : null;
  state.sessionTabId = igTab ? igTab.id : null;
  state.lastUpdated = now;
  await chrome.storage.local.set({ state });

  const limitSeconds = settings.dailyLimitMinutes * 60;
  const overLimit = limitSeconds > 0 && state.accumulatedSeconds >= limitSeconds;

  if (isPastCurfew(settings, now)) {
    const tabs = await chrome.tabs.query({ url: IG_MATCH });
    for (const tab of tabs) {
      await beginCountdown(tab.id, `It's past your ${settings.curfew} Instagram curfew.`);
    }
  } else if (overLimit && igTab) {
    await beginCountdown(
      igTab.id,
      `You've reached your ${settings.dailyLimitMinutes}-minute daily Instagram limit.`
    );
  }

  await closeOverdueTabs(now);
  await guardAllManagementTabs();
  await ensureTickAlarm();
  await scheduleAlarms(settings, state, igTab, now);
}

// Events can arrive in bursts; run evaluations one at a time so two of them
// never read and write the same state concurrently.
let queue = Promise.resolve();
function scheduleEvaluation() {
  queue = queue.then(evaluate).catch((err) => console.error('[IG Timer]', err));
  return queue;
}

// --- Tamper protection ---------------------------------------------------------

async function guardManagementTab(tabId, url) {
  if (!MANAGEMENT_PAGE.test(url || '')) return;
  if (!(await getAuth()) || (await isUnlocked())) return;

  const lockUrl = chrome.runtime.getURL(`unlock.html?target=${encodeURIComponent(url)}`);
  try {
    await chrome.tabs.update(tabId, { url: lockUrl });
  } catch {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // Tab is already gone.
    }
  }
}

async function guardAllManagementTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    await guardManagementTab(tab.id, tab.url || tab.pendingUrl);
  }
}

// --- Countdown & closing -------------------------------------------------------

// Injected into the Instagram page. Must be self-contained.
function showCountdownOverlay(message, seconds) {
  const HOST_ID = 'ig-time-limiter-overlay';
  document.getElementById(HOST_ID)?.remove();
  clearInterval(window.__igTimeLimiterInterval);

  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .card {
        position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
        display: flex; align-items: center; gap: 14px;
        max-width: 340px; padding: 14px 18px;
        background: rgba(20, 20, 24, 0.94); color: #fff;
        border-radius: 14px; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
        font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: slide-in 0.25s ease-out;
      }
      .count {
        flex: none; width: 44px; height: 44px; border-radius: 50%;
        display: grid; place-items: center;
        font-size: 20px; font-weight: 700;
        background: linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045);
      }
      .title { font-weight: 600; }
      .sub { opacity: 0.75; font-size: 13px; }
      @keyframes slide-in { from { transform: translateY(20px); opacity: 0; } }
    </style>
    <div class="card" role="alert" aria-live="assertive">
      <div class="count"></div>
      <div>
        <div class="title"></div>
        <div class="sub"></div>
      </div>
    </div>`;
  root.querySelector('.title').textContent = message;
  const countEl = root.querySelector('.count');
  const subEl = root.querySelector('.sub');
  document.documentElement.appendChild(host);

  let left = seconds;
  const render = () => {
    countEl.textContent = String(left);
    subEl.textContent = `This tab will close in ${left} second${left === 1 ? '' : 's'}.`;
  };
  render();

  window.__igTimeLimiterInterval = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(window.__igTimeLimiterInterval);
      chrome.runtime.sendMessage({ type: 'countdownFinished' }).catch(() => {});
    } else {
      render();
    }
  }, 1000);
}

async function injectOverlay(tabId, message, secondsLeft) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showCountdownOverlay,
      args: [message, secondsLeft],
    });
  } catch (err) {
    // The page may still be loading or showing an error page. The fallback
    // timer and tick alarm still close the tab on schedule.
    console.warn('[IG Timer] Could not show countdown overlay:', err.message);
  }
}

async function beginCountdown(tabId, message) {
  const pending = await getPending();
  if (pending[tabId]) return;

  const deadline = Date.now() + COUNTDOWN_SECONDS * 1000;
  pending[tabId] = { deadline, message };
  await setPending(pending);

  await injectOverlay(tabId, message, COUNTDOWN_SECONDS);

  // Fallback in case the overlay could not run or its message is lost.
  setTimeout(() => closeTab(tabId), COUNTDOWN_SECONDS * 1000 + 1500);
}

async function closeTab(tabId) {
  const pending = await getPending();
  if (!pending[tabId]) return;
  delete pending[tabId];
  await setPending(pending);

  try {
    const tab = await chrome.tabs.get(tabId);
    // The user navigated away from Instagram during the countdown.
    if (!IG_URL.test(tab.url || tab.pendingUrl || '')) return;
    await chrome.tabs.remove(tabId);
  } catch {
    // Tab is already gone.
  }
}

// Last resort if the background context was suspended during a countdown.
async function closeOverdueTabs(now) {
  const pending = await getPending();
  for (const [tabId, entry] of Object.entries(pending)) {
    if (now >= entry.deadline + 3000) {
      await closeTab(Number(tabId));
    }
  }
}

// --- Event wiring (registered synchronously at top level) ----------------------

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  if (reason === 'install' && !(await getAuth())) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
  }
  scheduleEvaluation();
});

chrome.runtime.onStartup.addListener(() => scheduleEvaluation());

chrome.tabs.onActivated.addListener(() => scheduleEvaluation());
chrome.tabs.onReplaced.addListener(() => scheduleEvaluation());
chrome.windows.onFocusChanged.addListener(() => scheduleEvaluation());

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== 'complete') return;

  await guardManagementTab(tabId, changeInfo.url || tab.url);

  // A reload wipes the overlay; show it again with the time that is left.
  if (changeInfo.status === 'complete') {
    const entry = (await getPending())[tabId];
    if (entry) {
      const secondsLeft = Math.max(1, Math.ceil((entry.deadline - Date.now()) / 1000));
      await injectOverlay(tabId, entry.message, secondsLeft);
    }
  }
  scheduleEvaluation();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const pending = await getPending();
  if (pending[tabId]) {
    delete pending[tabId];
    await setPending(pending);
  }
  scheduleEvaluation();
});

chrome.alarms.onAlarm.addListener(() => scheduleEvaluation());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.settings || changes.auth)) scheduleEvaluation();
  if (area === 'session' && changes.unlockedUntil) scheduleEvaluation();
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'countdownFinished' && sender.tab?.id !== undefined) {
    closeTab(sender.tab.id);
  }
});
