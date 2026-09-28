'use strict';

// Depends on shared.js.

const form = document.getElementById('password-form');
const titleEl = document.getElementById('title');
const introEl = document.getElementById('intro');
const currentGroup = document.getElementById('current-group');
const currentInput = document.getElementById('current');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirm');
const lockPageInput = document.getElementById('lock-extensions-page');
const feedbackEl = document.getElementById('feedback');
const doneEl = document.getElementById('done');
const contactInput = document.getElementById('contact');

let existingAuth = null;

function showFeedback(text, kind) {
  feedbackEl.textContent = text;
  feedbackEl.className = `feedback visible ${kind}`;
}

async function load() {
  existingAuth = await getAuth();
  if (existingAuth) {
    const { lockExtensionsPage, contactEmail } = await chrome.storage.local.get([
      'lockExtensionsPage',
      'contactEmail',
    ]);
    lockPageInput.checked = Boolean(lockExtensionsPage);
    contactInput.value = contactEmail || '';
    titleEl.textContent = 'Password & protection';
    introEl.textContent =
      'Enter your current password to change it or to change extensions-page protection. ' +
      'Leave the new password fields empty to keep your current password.';
    currentGroup.hidden = false;
    currentInput.required = true;
    passwordInput.required = false;
    confirmInput.required = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  // Firefox makes host permissions optional for MV3 extensions. The request
  // has to happen right away, inside the click, before any await.
  const hostAccess = chrome.permissions
    .request({ origins: SITE_MATCHES })
    .catch(() => false);

  if (existingAuth && !(await verifyPassword(currentInput.value, existingAuth))) {
    showFeedback('Current password is wrong', 'error');
    currentInput.select();
    return;
  }

  const keepPassword = existingAuth && !passwordInput.value && !confirmInput.value;
  if (!keepPassword) {
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
  }

  const contactEmail = contactInput.value.trim();
  if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
    showFeedback('Check the contact email address', 'error');
    contactInput.focus();
    return;
  }

  const update = { lockExtensionsPage: lockPageInput.checked, contactEmail };
  if (!keepPassword) update.auth = await hashPassword(passwordInput.value);
  await chrome.storage.local.set(update);
  await lockNow();

  form.reset();
  form.hidden = true;
  doneEl.hidden = false;

  if (!(await hostAccess)) {
    doneEl.textContent =
      'Saved, but access to Instagram and X was not granted, so time will not be tracked. ' +
      "Grant access to instagram.com and x.com in the browser's extension permissions.";
  }
});

// Opens the notification page in test mode. The first email to a new address
// asks the contact to confirm before any notifications are delivered.
document.getElementById('test-email').addEventListener('click', () => {
  const email = contactInput.value.trim();
  if (!EMAIL_PATTERN.test(email)) {
    showFeedback('Enter a valid contact email first', 'error');
    contactInput.focus();
    return;
  }
  chrome.tabs.create({ url: notifyUrl(email, { test: true }) });
});

load();
