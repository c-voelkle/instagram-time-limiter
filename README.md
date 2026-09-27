# Instagram Time Limiter

A browser extension (Manifest V3) that tracks the time you actively spend on Instagram and closes the tab when you hit your daily limit or curfew. It's password-protected, so the limits can't be quietly loosened or switched off.

Works in **Chrome, Edge, Brave, Opera, Vivaldi, Arc** and **Firefox 115+**. See [Safari](#safari) for Safari.

## Features

- **Active time only.** Time counts only while an Instagram tab is the active tab in the focused browser window.
- **Daily limit.** When today's total reaches the limit, the Instagram tab you're using closes. Set it to 0 to turn it off.
- **Curfew.** From the curfew time until midnight, every open Instagram tab closes, and any new one closes right away. Leave it empty to turn it off.
- **10-second warning.** A countdown card appears in the corner of the page before the tab closes.
- **Password protection.** On install, a setup page asks for a password. After that, the password is needed to:
  - change or turn off the daily limit or curfew (in the popup)
  - open the browser's extensions page (`chrome://extensions`, `edge://extensions`, `brave://extensions`, `about:addons`, `about:debugging`, …), where the extension could be disabled or removed. Those pages are replaced with a lock screen.

  A correct password unlocks both for 5 minutes. **Lock now** in the popup ends that early. The password is stored only as a salted PBKDF2-SHA-256 hash. **It can't be recovered if forgotten.**
- **Survives background suspension.** Session timestamps and today's total are saved in extension storage. The total resets at local midnight.

## What the password can't stop

Browsers don't let an extension block its own removal, so the lock is a strong deterrent, not a guarantee. Someone determined can still:

- right-click the toolbar icon and choose **Remove from…** (the browser's own confirmation dialog can't be intercepted)
- use a private/incognito window, unless the extension is allowed there (the popup warns when it isn't), a different browser profile, or a different browser
- delete the extension's folder from disk

For real uninstall protection, install it through **browser policy** as the device's administrator. See [Enforce with browser policy](#enforce-with-browser-policy).

## Project layout

| Path | Purpose |
| --- | --- |
| `src/manifest.json` | MV3 manifest (Chromium). `src/` loads directly as an unpacked extension. |
| `src/background.js` | Background logic: tracking, limits, countdown, closing tabs, extensions-page lock |
| `src/shared.js` | Helpers shared by the background script and pages (dates, settings, password hashing) |
| `src/popup.*` | Toolbar popup: today's time, settings, unlock |
| `src/setup.*` | First-run page to create or change the password |
| `src/unlock.*` | Lock screen shown in place of the extensions page |
| `src/page.css` | Styles for the full-tab pages |
| `src/icons/` | PNG icons (16/32/48/128) |
| `scripts/build.js` | Builds `dist/chromium` and `dist/firefox` |
| `scripts/generate-icons.js` | Regenerates the icons |

Both scripts need only Node.js, no npm packages.

Permissions: `tabs`, `storage`, `alarms`, `activeTab`, `scripting` (for the countdown overlay), and host access to `instagram.com`.

## Install

```bash
node scripts/build.js
```

### Chrome, Edge, Brave, Opera, Vivaldi, Arc

1. Open the extensions page (`chrome://extensions`, `edge://extensions`, etc.).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select `dist/chromium` (or `src/`).
4. The setup tab opens. Choose a password.
5. Optional but recommended: open the extension's **Details** and turn on **Allow in Incognito** / **Allow in InPrivate**. Do this before setting the password, or unlock first.

### Firefox

- **Try it out:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `dist/firefox/manifest.json`. Temporary add-ons are removed when Firefox restarts.
- **Keep it permanently:** Firefox only installs signed add-ons for good. Zip the *contents* of `dist/firefox` and submit it at [addons.mozilla.org](https://addons.mozilla.org/developers/) as an **unlisted** add-on for free automatic signing, then install the signed `.xpi`.
- When the setup page asks, allow access to instagram.com. Firefox treats host access as optional.
- To use it in private windows, open `about:addons` → the extension → **Run in Private Windows: Allow**.

### Safari

Safari needs a Mac with Xcode:

```bash
xcrun safari-web-extension-converter dist/chromium
```

Then build and run the generated Xcode project and enable the extension in Safari → Settings → Extensions. This hasn't been tested on Safari.

## Enforce with browser policy

Policies are set by the device's administrator and can stop the extension from being disabled or removed at all.

- **Chrome / Edge / Brave:** the `ExtensionInstallForcelist` policy force-installs an extension and hides its Remove/Disable controls. On Windows and macOS machines that aren't managed by an organization, this only works for extensions published in the Chrome Web Store or Edge Add-ons store. Publish it (unlisted is fine) and force-install it by its store ID.
- **Firefox:** create `policies.json` in the Firefox install folder's `distribution` directory (for example `C:\Program Files\Mozilla Firefox\distribution\policies.json`):

  ```json
  {
    "policies": {
      "ExtensionSettings": {
        "instagram-time-limiter@extension": {
          "installation_mode": "force_installed",
          "install_url": "file:///C:/path/to/instagram-time-limiter.xpi"
        }
      }
    }
  }
  ```

  This requires the signed `.xpi` described above.

## Test it

1. **Tracking:** open instagram.com and open the popup. The timer counts up. Switch to another tab or app, and it stops.
2. **Password:** in the popup the settings are greyed out. Enter the password to unlock them, then click **Lock now**.
3. **Extensions-page lock:** while locked, open `chrome://extensions` (or `about:addons`). The lock screen appears instead. The correct password opens the real page for 5 minutes.
4. **Daily limit:** unlock, set the limit to `1` minute, and stay on Instagram for about a minute. The countdown appears, then the tab closes.
5. **Curfew:** set the limit to `0` and the curfew one or two minutes from now. Open a few Instagram tabs. At the curfew time they all show the countdown and close.
6. **Debugging:** unlock, then open the background console from the extensions page (**service worker** in Chromium, **Inspect** in Firefox's `about:debugging`).

Closing times are accurate to within about 30 seconds after the browser has been idle. MV3 wakes the background script with alarms, and alarms are limited to one every 30 seconds.
