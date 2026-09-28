# Store submission guide

Firefox Add-ons and Edge Add-ons are **free**; the Chrome Web Store has a one-time $5 fee. Each needs a one-time account and a short review, usually 1–7 days. After approval, paste the listing URL into `STORE_URLS` in `docs/index.html`. The install page then shows a one-click button.

Upload files: download them from the [latest release](https://github.com/c-voelkle/instagram-time-limiter/releases/latest), or run `node scripts/build.js` and use the zips in `dist/`.

---

## 1. Firefox Add-ons (addons.mozilla.org)

1. Sign in or create a Firefox account at https://addons.mozilla.org/developers/.
2. Click **Submit a New Add-on** and choose **On this site** (a listed add-on, so it appears in search with an "Add to Firefox" button).
3. Upload `instagram-time-limiter-firefox.zip`. For platforms, tick **Firefox** only, not Android.
4. When asked about source code: **No**. The code isn't minified or bundled.
5. Fill in the listing using the text below. Category: **Social & Communication** or **Other**. License: **MIT**.
6. Privacy policy: paste the text of `docs/privacy.html`, or link https://c-voelkle.github.io/instagram-time-limiter/privacy.html
7. Paste the **Notes to reviewer** below and submit.
8. Once approved, the URL looks like `https://addons.mozilla.org/firefox/addon/<slug>/`. Put it in `STORE_URLS.firefox`.

## 2. Microsoft Edge Add-ons

1. Register as an Edge extension developer (free) at https://partner.microsoft.com/dashboard/microsoftedge/overview. A personal Microsoft account is enough. Choose **Individual** as the account type.
2. Click **Create new extension** and upload `instagram-time-limiter-chromium.zip`.
3. **Availability:** Public, all markets.
4. **Properties:** Category **Productivity**. Privacy policy URL: https://c-voelkle.github.io/instagram-time-limiter/privacy.html. Website: https://c-voelkle.github.io/instagram-time-limiter/. Support: https://github.com/c-voelkle/instagram-time-limiter/issues
5. **Store listing (English):** use the text below. Upload `src/icons/icon128.png` as the logo, plus at least one screenshot (1280×800 or 640×400). Take it of the popup and of the countdown on Instagram.
6. **Submit**, pasting the **Notes to reviewer** into the certification notes.
7. Once approved, the URL looks like `https://microsoftedge.microsoft.com/addons/detail/<id>`. Put it in `STORE_URLS.edge`.

## 3. Chrome Web Store (one-time $5 developer fee)

Needed for one-click installs in Chrome and to force-install via policy (hides Remove/Disable).

1. Developer Dashboard: https://chrome.google.com/webstore/devconsole. Choose **Non-trader** in the account settings.
2. Click **New item** (German: *Neuer Artikel*) and upload `instagram-time-limiter-chromium.zip`.
3. **Store listing** tab:
   - Description: the text below. Category: **Productivity → Tools**. Language: English.
   - Store icon: `store/store-icon-128.png` (96×96 artwork with 16px transparent padding, per the store guidelines)
   - Screenshots: all five in `store/screenshots/` (`1-popup.png` … `5-password-setup.png`)
   - Small promo tile: `store/screenshots/promo-tile-440x280.png`
   - Homepage: https://c-voelkle.github.io/instagram-time-limiter/. Support: https://github.com/c-voelkle/instagram-time-limiter/issues
4. **Privacy** tab:
   - Single purpose: the **Single purpose** text below.
   - Permission justifications: the table below, one per permission.
   - Remote code: **No, I am not using remote code**.
   - Data usage: tick **Personally identifiable information** (only the optional accountability contact's email address, sent via FormSubmit when the extension is removed or a test email is sent). Tick nothing else, then tick all three certification checkboxes.
   - Privacy policy URL: https://c-voelkle.github.io/instagram-time-limiter/privacy.html
5. **Distribution** tab: **Public** for one-click installs by anyone, or **Unlisted** if only you need it for the force-install policy. All regions.
6. **Submit for review**, and paste the **Notes to reviewer** if asked.
7. Once approved, the item ID (32 letters) is shown in the dashboard. Use it for the force-install policy. The store URL is `https://chromewebstore.google.com/detail/<id>`.

## Optional: Opera add-ons (free)

https://addons.opera.com/developer/. Upload the same Chromium zip with the same listing text. Reviews can be slow.

---

## Listing text

**Name:** Time Limiter for Instagram

**Summary (short description, ≤ 132 characters):**
Shared daily time limit and curfew for Instagram and X, with a friendly reminder once time is up. Password-protected.

**Description:**

> Take back your time from Instagram and X.
>
> Time Limiter for Instagram counts only the time Instagram or X is actually on screen, meaning the active tab in the focused window, from one shared daily budget.
>
> FEATURES
> • Daily time limit: choose how many minutes per day you allow yourself across Instagram and X. The counter resets at midnight.
> • Bedtime curfew: after the time you pick (for example 22:00), Instagram and X are off until midnight.
> • Friendly reminders: if time runs out while you're scrolling, a 10-second countdown appears before the tab closes. After that, opening the sites shows a cheerful animated reminder instead of the feed: "Es ist Zeit, Deutsch zu lernen!" or, after curfew, "Es ist Zeit, ein Buch zu lesen!"
> • Password lock: changing or switching off the limits needs a password. Hand it to a friend, partner or parent to keep yourself accountable.
> • Optional removal notification: set an accountability contact's email during setup. If the extension is removed, that person gets a short email. The popup clearly tells the user about this.
> • Optional extensions-page lock: if you turn it on during setup, the browser's extensions page asks for the password first, so the extension can't be switched off on impulse.
>
> PRIVACY
> Your usage time and settings are stored locally in your browser, and your password only as a secure hash. No accounts, analytics or ads. The only data ever sent is the optional removal email to the contact you choose.
>
> Free and open source (MIT): https://github.com/c-voelkle/instagram-time-limiter
>
> Not affiliated with, endorsed by, or sponsored by Instagram, Meta or X.

---

## Permission justifications

Edge and Opera ask for these. Firefox reviewers may too.

| Permission | Justification |
| --- | --- |
| `tabs` | Detect whether the active tab is instagram.com (to count usage time), close Instagram tabs when the user's limit or curfew is reached, and show the password screen when the user has opted to lock the extensions page. |
| `storage` | Save the user's settings, today's usage time and the password hash locally. Nothing is synced or transmitted. |
| `alarms` | Wake the background script every 30 seconds and at the exact limit/curfew time to enforce the limits. |
| `scripting` | Inject the 10-second countdown notice into the Instagram page before the tab is closed. |
| Host: `*://*.instagram.com/*`, `*://*.x.com/*`, `*://*.twitter.com/*` | Required to show the countdown notice on these pages before they close. No page content is read or modified. |

**Single purpose:** Limit the time the user spends on Instagram and X by enforcing a user-configured shared daily limit and curfew.

**Remote code:** None. All code ships in the package.

**Data collection:** Only if the user sets an optional accountability contact: that email address is sent to FormSubmit (formsubmit.co) to deliver one notification when the extension is removed (via `runtime.setUninstallURL`), or a test message on request. Disclosed in the popup and the privacy policy.

---

## Notes to reviewer

> This is a self-control / digital-wellbeing extension. It's open source: https://github.com/c-voelkle/instagram-time-limiter (not minified, no build step beyond copying files).
>
> How to test:
> 1. Install. A setup page opens. Enter any password (at least 6 characters), e.g. "reviewer1".
> 2. Open the toolbar popup and click Unlock with the password. Set "Daily limit" to 1 minute and save.
> 3. Keep an instagram.com tab focused for about a minute. A 10-second countdown appears in the bottom-right corner, then the tab closes.
> 4. Curfew: set the limit to 0 and the curfew to one minute from now. Open instagram.com and wait. The same countdown appears and the tab closes.
>
> About the optional extensions-page lock: during setup, users can choose (clearly labelled checkbox, explained on the setup page) to require their password before the browser's extensions page opens. It's meant for people who want to hold themselves accountable. It never prevents removal: the browser's own "Remove" option in the toolbar context menu always works, and the lock can be turned off at any time from the setup page. When it's on, visiting the extensions page shows a password screen. The correct password (e.g. "reviewer1") opens the real page for 5 minutes.
>
> Optional removal notification: if the user enters an "Accountability contact" email during setup, the extension registers an uninstall URL (runtime.setUninstallURL) pointing to https://c-voelkle.github.io/instagram-time-limiter/goodbye.html. When the extension is removed, that page sends one email to the contact via FormSubmit. The popup permanently shows a notice about this. The extension itself makes no network requests.
