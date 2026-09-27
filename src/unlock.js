'use strict';

// Depends on shared.js.

const form = document.getElementById('unlock-form');
const passwordInput = document.getElementById('password');
const feedbackEl = document.getElementById('feedback');
const manualEl = document.getElementById('manual');

document.getElementById('minutes').textContent = String(UNLOCK_MINUTES);

// Only ever send the user back to a browser management page, never to an
// arbitrary URL passed in the query string.
const requested = new URLSearchParams(location.search).get('target') || '';
const target = MANAGEMENT_PAGE.test(requested) ? requested : null;

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const auth = await getAuth();
  if (!auth) {
    // The password was removed in the meantime; nothing to protect.
    await unlockFor();
  } else if (!(await verifyPassword(passwordInput.value, auth))) {
    feedbackEl.textContent = 'Wrong password';
    feedbackEl.className = 'feedback visible error';
    passwordInput.select();
    return;
  } else {
    await unlockFor();
  }

  form.hidden = true;
  manualEl.hidden = false;
  manualEl.textContent = `Unlocked for ${UNLOCK_MINUTES} minutes.`;

  if (!target) return;
  try {
    const tab = await chrome.tabs.getCurrent();
    await chrome.tabs.update(tab.id, { url: target });
  } catch {
    // Some browsers (e.g. Firefox for about: pages) refuse to navigate there
    // from an extension; the user can open it by hand while unlocked.
    manualEl.textContent = `Unlocked for ${UNLOCK_MINUTES} minutes. Open ${target} again from the address bar.`;
  }
});
