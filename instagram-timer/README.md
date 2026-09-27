# Instagram Time Limiter (Chrome, Manifest V3)

Tracks the time you actively spend on Instagram and closes the tab when you hit your daily limit or curfew.

- **Active time only.** Time counts only while an Instagram tab is the active tab in the focused Chrome window.
- **Daily limit.** When today's total reaches the limit, the Instagram tab you're using closes. Set the limit to 0 to turn it off.
- **Curfew.** From the curfew time until midnight, every open Instagram tab closes, and any new one closes right away. Leave the field empty to turn it off.
- **10-second warning.** A countdown card appears in the corner of the page before the tab closes.
- **Survives service-worker sleep.** Session timestamps and today's total are saved in `chrome.storage.local`. The total resets automatically at local midnight.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest |
| `background.js` | Service worker: tracking, limits, countdown and closing |
| `popup.html` / `popup.js` / `popup.css` | Popup: today's time, settings form |
| `icons/icon{16,32,48,128}.png` | Pre-generated icons |
| `icons/generate-icons.js` | Regenerates the icons (`node icons/generate-icons.js`, no dependencies) |

The `scripting` permission is included in addition to `tabs`, `storage`, `alarms` and `activeTab`. It's needed to inject the countdown overlay with `chrome.scripting.executeScript`.

## Load it

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `instagram-timer` folder.
4. Pin the extension from the puzzle-piece menu so the popup is easy to reach.

## Test it

1. **Tracking:** open instagram.com and open the popup. The timer counts up. Switch to another tab or app, and it stops.
2. **Daily limit:** set the limit to `1` minute and save. Stay on Instagram for about a minute. The countdown appears, then the tab closes. Opening Instagram again today shows the countdown right away.
3. **Curfew:** set the limit to `0`, set the curfew one or two minutes from now, and save. Open a few Instagram tabs. At the curfew time, every one of them shows the countdown and closes.
4. **Reset:** set the limit back to something like `30` and the curfew to `22:00`.
5. **Debugging:** on `chrome://extensions`, click **service worker** under the extension to see its console. Run `chrome.storage.local.get(null, console.log)` to see the stored state.

Closing times are accurate to within about 30 seconds after Chrome has been idle. MV3 wakes the service worker with alarms, and alarms are limited to one every 30 seconds.
