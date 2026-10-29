import { fetchKlines } from "./data.js";
import { STRATEGIES, evaluateSignals } from "./strategies.js";
import { SIGNAL_HISTORY_KEY, createFirstSignalRecords, mergeFirstSignalRecords } from "./signal-history.js";

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

let activeCheck;
async function checkWatchlist() {
  if (activeCheck) return activeCheck;
  activeCheck = runWatchlistCheck();
  try { return await activeCheck; } finally { activeCheck = null; }
}

async function runWatchlistCheck() {
  const stored = await chrome.storage.local.get([SETTINGS_KEY, WATCHLIST_KEY]);
  const settings = stored[SETTINGS_KEY] || {};
  const watchlist = stored[WATCHLIST_KEY] || [];
  const historyStored = await chrome.storage.local.get(SIGNAL_HISTORY_KEY);
  let history = historyStored[SIGNAL_HISTORY_KEY] || [];
  let notifications = 0;
  let recordsAdded = 0;
  for (const item of watchlist) {
    try {
      const { name, candles, stale } = await fetchKlines(item.code);
      if (stale) continue;
      const strategies = [...new Set([...(item.strategies || Object.keys(STRATEGIES)), "flushLongShort"] )];
      const signals = evaluateSignals(candles, strategies);
      const candidates = createFirstSignalRecords({ code: item.code, name, candles, signals });
      const knownKeys = new Set(history.map(record => record.key));
      recordsAdded += candidates.filter(record => !knownKeys.has(record.key)).length;
      const nextHistory = mergeFirstSignalRecords(history, candidates);
      history = nextHistory;
      if (settings.notificationsEnabled) for (const signal of signals) {
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
  if (recordsAdded) await chrome.storage.local.set({ [SIGNAL_HISTORY_KEY]: history });
  return { notifications, recordsAdded };
}
