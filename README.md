# Time Limiter for Instagram

A free, open-source browser extension that caps your daily time on Instagram and X, enforces a bedtime curfew, and locks its settings behind a password so the limits stick.

**➜ Install: https://c-voelkle.github.io/instagram-time-limiter/**

Works in **Chrome, Edge, Brave, Opera, Vivaldi, Arc** and **Firefox 140+**.

*Not affiliated with, endorsed by, or sponsored by Instagram, Meta or X.*

## Features

- **Instagram and X, one budget.** Time on instagram.com and x.com (including twitter.com) counts toward a single daily limit.
- **Active time only.** Time counts only while one of those sites is the active tab in the focused browser window.
- **Daily limit.** When today's total is used up while you're on the site, a 10-second countdown appears, then the tab closes. After that, opening Instagram or X shows an animated block page (“Es ist Zeit, Deutsch zu lernen!”) straight away. Set the limit to 0 to turn it off.
- **Curfew.** From the curfew time until midnight, open tabs get the countdown and then close, and any later visit shows the block page (“Es ist Zeit, ein Buch zu lesen!”). Leave it empty to turn it off.
- **Password protection.** On install, a setup page asks for a password. After that, changing or turning off the daily limit or curfew requires it.
- **Optional extensions-page lock.** If you tick it during setup, opening the browser's extensions page (`chrome://extensions`, `edge://extensions`, `about:addons`, …) shows a password screen instead, so the extension can't be switched off there on impulse.

  A correct password unlocks settings and that page for 5 minutes. The password is stored only as a salted PBKDF2-SHA-256 hash and **can't be recovered if forgotten**.
- **Optional removal notification.** Set an accountability contact during setup and, if the extension is removed, that address gets an email (sent via [FormSubmit](https://formsubmit.co/) from `docs/goodbye.html`). The popup openly tells the user about this. Disabling the extension can't be detected. Only removal can.
- **Private by design.** No analytics or accounts. Apart from the optional removal email, nothing leaves the device. See the [privacy policy](https://c-voelkle.github.io/instagram-time-limiter/privacy.html).

### What the password can't stop

Browsers don't let an extension block its own removal, so the lock is a strong deterrent, not a guarantee. Someone determined can still:

- right-click the toolbar icon and choose **Remove**
- use a private window (unless the extension is allowed there), another browser profile, or another browser

## Install

See the [install page](https://c-voelkle.github.io/instagram-time-limiter/). It detects your browser and shows the steps.

- **Edge, Firefox:** one-click install from the free stores once the listings are approved.
- **Chrome, Brave, Opera, Vivaldi:** download `instagram-time-limiter-chromium.zip` from the [latest release](https://github.com/c-voelkle/instagram-time-limiter/releases/latest), unzip it, open the extensions page, turn on **Developer mode**, and click **Load unpacked**.

## Development

| Path | Purpose |
| --- | --- |
| `src/` | The extension (Chromium manifest). Load it directly as an unpacked extension. |
| `src/background.js` | Background logic: tracking, limits, countdown, closing tabs, extensions-page lock |
| `src/shared.js` | Helpers shared by the background script and pages |
| `src/popup.*`, `src/setup.*`, `src/unlock.*`, `src/blocked.*` | Toolbar popup, password setup page, lock screen, animated block page |
| `scripts/build.js` | Builds `dist/chromium`, `dist/firefox` and store-ready zips |
| `scripts/generate-icons.js` | Regenerates the PNG icons |
| `scripts/screenshots.js` | Renders store screenshots and promo tile into `store/screenshots/` (needs Chrome or Edge) |
| `docs/` | Install website and privacy policy (GitHub Pages) |
| `store/SUBMISSION.md` | Store listing text, permission justifications, reviewer notes |
| `.github/workflows/release.yml` | Builds and publishes a GitHub Release when a `v*` tag is pushed |

The scripts need only Node.js, no npm packages.

```bash
node scripts/build.js
```

### Releasing a new version

1. Bump `"version"` in `src/manifest.json`.
2. Commit, then tag and push:
   ```bash
   git tag v1.2.1 && git push origin main v1.2.1
   ```
3. The workflow publishes the zips to a GitHub Release, and the install page's download links pick them up automatically.
4. Upload the new zips to the Edge and Firefox stores. See [store/SUBMISSION.md](store/SUBMISSION.md).

### Testing

1. **Tracking:** open instagram.com and open the popup. The timer counts up. Switch to another tab or app, and it stops.
2. **Password:** settings in the popup are greyed out. Unlock with the password, change something, then click **Lock now**.
3. **Extensions-page lock:** with the lock enabled, open `chrome://extensions` or `about:addons`. The lock screen appears instead.
4. **Daily limit:** set the limit to 1 minute and stay on Instagram. The countdown appears, then the tab closes.
5. **Curfew:** set the limit to 0 and the curfew one minute from now, with a few Instagram tabs open. They all close.

Closing times are accurate to within about 30 seconds after the browser has been idle. MV3 wakes background scripts with alarms, and alarms are limited to one every 30 seconds.

## License

[MIT](LICENSE)
