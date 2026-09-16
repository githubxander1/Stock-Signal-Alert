import { fetchKlines } from "./data.js";
import { STRATEGIES, evaluateSignals } from "./strategies.js";

const ALARM = "signal-check";
const SETTINGS_KEY = "settings";
const WATCHLIST_KEY = "watchlist";
const notifiedKey = (code, signalId, direction, date) => `notified:${code}:${signalId}:${direction}:${date}`;

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create(ALARM, { periodInMinutes: 15 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create(ALARM, { periodInMinutes: 15 }));
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) checkWatchlist().catch(console.warn); });
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "check-now") return;
  checkWatchlist().then(result => sendResponse({ ok: true, result })).catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function checkWatchlist() {
  const stored = await chrome.storage.local.get([SETTINGS_KEY, WATCHLIST_KEY]);
  const settings = stored[SETTINGS_KEY] || {};
  if (!settings.notificationsEnabled) return { skipped: true };
  const watchlist = stored[WATCHLIST_KEY] || [];
  let notifications = 0;
  for (const item of watchlist) {
    try {
      const { name, candles } = await fetchKlines(item.code);
      const strategies = [...new Set([...(item.strategies || Object.keys(STRATEGIES)), "flushLongShort"] )];
      const signals = evaluateSignals(candles, strategies);
      for (const signal of signals) {
        const key = notifiedKey(item.code, signal.id, signal.direction, candles.at(-1).date);
        if ((await chrome.storage.local.get(key))[key]) continue;
        await chrome.notifications.create(key, {
          type: "basic",
          iconUrl: "icons/icon-128.png",
          title: `${name} (${item.code}) ${signal.name}`,
          message: `${signal.detail}，收盘价 ${candles.at(-1).close}`,
          priority: 1
        });
        await chrome.storage.local.set({ [key]: Date.now() });
        notifications += 1;
      }
    } catch (error) { console.warn(`signal check failed: ${item.code}`, error); }
  }
  return { notifications };
}
