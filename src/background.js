'use strict';

// ---------------------------------------------------------------------------
// Time Limiter for Instagram — background script
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

function isSiteTab(tab) {
  return SITE_URL.test(tab.url || tab.pendingUrl || '');
}

// Returns the active limited-site tab only if its window is the focused one.
async function findFocusedSiteTab() {
  let win;
  try {
    win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
  } catch {
    return null;
  }
  if (!win || !win.focused) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  return tab && isSiteTab(tab) ? tab : null;
}

async function ensureTickAlarm() {
  const existing = await chrome.alarms.get(TICK_ALARM);
  if (!existing) {
    await chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_MINUTES });
  }
}

async function scheduleAlarms(settings, state, siteTab, now) {
  const curfewTs = curfewTimestamp(settings, now);
  if (curfewTs !== null && curfewTs > now) {
    await chrome.alarms.create(CURFEW_ALARM, { when: curfewTs });
  } else {
    await chrome.alarms.clear(CURFEW_ALARM);
  }

  const limitSeconds = settings.dailyLimitMinutes * 60;
  const remainingMs = (limitSeconds - state.accumulatedSeconds) * 1000;
  if (siteTab && limitSeconds > 0 && remainingMs > 0) {
    await chrome.alarms.create(LIMIT_ALARM, { when: now + remainingMs });
  } else {
    await chrome.alarms.clear(LIMIT_ALARM);
  }
}

async function evaluate() {
  const now = Date.now();
  const settings = await getSettings();
  const state = await getState(now);

  const limitSeconds = settings.dailyLimitMinutes * 60;
  const previousUpdate = state.lastUpdated ?? now;
  const wasUnderLimit = state.accumulatedSeconds < limitSeconds;

  creditRunningSession(state, now);

  const siteTab = await findFocusedSiteTab();
  state.sessionStart = siteTab ? now : null;
  state.sessionTabId = siteTab ? siteTab.id : null;
  state.lastUpdated = now;
  await chrome.storage.local.set({ state });

  const overLimit = limitSeconds > 0 && state.accumulatedSeconds >= limitSeconds;
  const curfewTs = curfewTimestamp(settings, now);
  const pastCurfew = curfewTs !== null && now >= curfewTs;

  if (pastCurfew) {
    // Only tabs already open when the curfew begins get the countdown.
    await enforce('curfew', (tab) => previousUpdate < curfewTs);
  } else if (overLimit) {
    // Only the tab in use at the moment the limit is crossed gets the countdown.
    await enforce('limit', (tab) => wasUnderLimit && tab.id === siteTab?.id);
  }

  await closeOverdueTabs(now);
  await guardAllManagementTabs();
  await ensureTickAlarm();
  await scheduleAlarms(settings, state, siteTab, now);
}

// Once a limit applies, every limited-site tab either gets a one-time
// 10-second countdown (if it was in use when the block began) or is replaced
// by the block page straight away.
async function enforce(reason, getsCountdown) {
  const pending = await getPending();
  const tabs = await chrome.tabs.query({ url: SITE_MATCHES });
  for (const tab of tabs) {
    if (pending[tab.id]) continue;
    if (getsCountdown(tab)) {
      await beginCountdown(tab.id, reason);
    } else {
      await showBlockPage(tab.id, reason);
    }
  }
}

async function showBlockPage(tabId, reason) {
  try {
    await chrome.tabs.update(tabId, { url: chrome.runtime.getURL(`blocked.html?reason=${reason}`) });
  } catch {
    // Tab is already gone.
  }
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
  const { lockExtensionsPage } = await chrome.storage.local.get('lockExtensionsPage');
  if (!lockExtensionsPage || !(await getAuth()) || (await isUnlocked())) return;

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

// Injected into the limited site's page. Must be self-contained: `scene` is
// one of BLOCK_SCENES, passed in as plain data.
function showCountdownOverlay(scene, seconds) {
  const HOST_ID = 'ig-time-limiter-overlay';
  document.getElementById(HOST_ID)?.remove();
  clearInterval(window.__igTimeLimiterInterval);

  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'open' });

  // A constructed stylesheet isn't subject to the page's style-src CSP.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    .card {
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
      width: 360px; max-width: calc(100vw - 40px); box-sizing: border-box;
      padding: 18px 20px 16px; overflow: hidden;
      background: #16161b; color: #fff;
      border-radius: 18px; box-shadow: 0 14px 40px rgba(0, 0, 0, 0.4);
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .row { position: relative; display: flex; align-items: center; gap: 16px; }
    .emoji {
      flex: none; width: 64px; height: 64px; border-radius: 50%;
      display: grid; place-items: center; font-size: 36px;
      background: linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045);
      animation: bounce 1.1s ease-in-out infinite;
    }
    .title { font-size: 17px; font-weight: 700; line-height: 1.3; }
    .sub { margin-top: 4px; opacity: 0.75; font-size: 13px; }
    .bar { position: relative; height: 4px; margin-top: 14px; border-radius: 2px; background: rgba(255, 255, 255, 0.15); overflow: hidden; }
    .bar > div {
      height: 100%; width: 100%;
      background: linear-gradient(90deg, #833ab4, #fd1d1d, #fcb045);
      transform-origin: left; animation: drain linear forwards;
    }
    .floater {
      position: absolute; bottom: -24px; font-weight: 700; opacity: 0;
      color: rgba(255, 255, 255, 0.55); pointer-events: none;
      animation: float-up 3.2s ease-in infinite;
    }
    @keyframes pop-in { from { transform: translateY(30px) scale(0.85); opacity: 0; } }
    @keyframes bounce {
      0%, 100% { transform: translateY(0) rotate(-6deg); }
      50% { transform: translateY(-8px) rotate(6deg); }
    }
    @keyframes drain { to { transform: scaleX(0); } }
    @keyframes float-up {
      0% { transform: translateY(0) rotate(0); opacity: 0; }
      15% { opacity: 1; }
      100% { transform: translateY(-150px) rotate(20deg); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .card, .emoji, .floater { animation: none; }
      .floater { display: none; }
    }
  `);
  root.adoptedStyleSheets = [sheet];

  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'alert');
  card.setAttribute('aria-live', 'assertive');

  scene.floaters.forEach((text, i) => {
    const floater = document.createElement('span');
    floater.className = 'floater';
    floater.textContent = text;
    floater.style.left = `${8 + ((i * 37) % 84)}%`;
    floater.style.fontSize = `${13 + ((i * 7) % 10)}px`;
    floater.style.animationDelay = `${(i * 0.45) % 3.2}s`;
    card.appendChild(floater);
  });

  const row = document.createElement('div');
  row.className = 'row';
  const emoji = document.createElement('div');
  emoji.className = 'emoji';
  emoji.textContent = scene.emoji;
  const textBox = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = scene.title;
  const subEl = document.createElement('div');
  subEl.className = 'sub';
  textBox.append(title, subEl);
  row.append(emoji, textBox);

  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('div');
  fill.style.animationDuration = `${seconds}s`;
  bar.appendChild(fill);

  card.append(row, bar);
  root.appendChild(card);
  document.documentElement.appendChild(host);

  let left = seconds;
  const render = () => {
    subEl.textContent = `Dieser Tab schließt sich in ${left} Sekunde${left === 1 ? '' : 'n'}.`;
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

async function injectOverlay(tabId, reason, secondsLeft) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showCountdownOverlay,
      args: [BLOCK_SCENES[reason], secondsLeft],
    });
  } catch (err) {
    // The page may still be loading or showing an error page. The fallback
    // timer and tick alarm still close the tab on schedule.
    console.warn('[IG Timer] Could not show countdown overlay:', err.message);
  }
}

async function beginCountdown(tabId, reason) {
  const pending = await getPending();
  if (pending[tabId]) return;

  const deadline = Date.now() + COUNTDOWN_SECONDS * 1000;
  pending[tabId] = { deadline, reason };
  await setPending(pending);

  await injectOverlay(tabId, reason, COUNTDOWN_SECONDS);

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
    // The user navigated away from the site during the countdown.
    if (!isSiteTab(tab)) return;
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
      await injectOverlay(tabId, entry.reason || 'limit', secondsLeft);
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
  if (area === 'local' && (changes.settings || changes.auth || changes.lockExtensionsPage)) {
    scheduleEvaluation();
  }
  if (area === 'session' && changes.unlockedUntil) scheduleEvaluation();
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'countdownFinished' && sender.tab?.id !== undefined) {
    closeTab(sender.tab.id);
  }
});
