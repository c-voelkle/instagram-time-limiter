'use strict';

// Depends on shared.js.

const form = document.getElementById('password-form');
const titleEl = document.getElementById('title');
const introEl = document.getElementById('intro');
const currentGroup = document.getElementById('current-group');
const currentInput = document.getElementById('current');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirm');
const feedbackEl = document.getElementById('feedback');
const doneEl = document.getElementById('done');

let existingAuth = null;

function showFeedback(text, kind) {
  feedbackEl.textContent = text;
  feedbackEl.className = `feedback visible ${kind}`;
}

async function load() {
  existingAuth = await getAuth();
  if (existingAuth) {
    titleEl.textContent = 'Change your password';
    introEl.textContent = 'Enter your current password, then choose a new one.';
    currentGroup.hidden = false;
    currentInput.required = true;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  // Firefox makes host permissions optional for MV3 extensions. The request
  // has to happen right away, inside the click, before any await.
  const hostAccess = chrome.permissions
    .request({ origins: [IG_MATCH] })
    .catch(() => false);

  if (existingAuth && !(await verifyPassword(currentInput.value, existingAuth))) {
    showFeedback('Current password is wrong', 'error');
    currentInput.select();
    return;
  }
  if (passwordInput.value.length < 6) {
    showFeedback('Use at least 6 characters', 'error');
    passwordInput.focus();
    return;
  }
  if (passwordInput.value !== confirmInput.value) {
    showFeedback("Passwords don't match", 'error');
    confirmInput.select();
    return;
  }

  const auth = await hashPassword(passwordInput.value);
  await chrome.storage.local.set({ auth });
  await lockNow();

  form.reset();
  form.hidden = true;
  doneEl.hidden = false;

  if (!(await hostAccess)) {
    doneEl.textContent =
      'Password saved, but Instagram access was not granted, so time will not be tracked. ' +
      "Grant access to instagram.com in the browser's extension permissions.";
  }
});

load();
