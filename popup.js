import { normalizeCode, fetchKlines, searchSymbols } from "./data.js";
import { STRATEGIES, evaluateSignals, signalMarkers } from "./strategies.js";

const watchlistKey = "watchlist";
const settingsKey = "settings";
const watchlistEl = document.querySelector("#watchlist");
const statusEl = document.querySelector("#status");
const template = document.querySelector("#itemTemplate");
const defaultStrategies = Object.keys(STRATEGIES);

document.querySelector("#version").textContent = `v${chrome.runtime.getManifest().version}`;
document.querySelector("#addForm").addEventListener("submit", addStock);
document.querySelector("#codeInput").addEventListener("input", showSuggestions);
document.addEventListener("click", event => { if (!event.target.closest(".search-box")) document.querySelector("#suggestions").replaceChildren(); });
document.querySelector("#refresh").addEventListener("click", () => render());
document.querySelector("#checkNow").addEventListener("click", checkNow);
document.querySelector("#openStrategies").addEventListener("click", () => window.open(chrome.runtime.getURL("strategy.html"), "_blank"));
document.querySelector("#openHistory").addEventListener("click", () => window.open(chrome.runtime.getURL("history.html"), "_blank"));
document.querySelector("#openBonds").addEventListener("click", () => window.open(chrome.runtime.getURL("bond.html"), "_blank"));
document.querySelector("#notifyEnabled").addEventListener("change", async event => {
  const { settings = {} } = await chrome.storage.local.get(settingsKey);
  await chrome.storage.local.set({ [settingsKey]: { ...settings, notificationsEnabled: event.target.checked } });
});

async function addStock(event) {
  event.preventDefault();
  await addCode(document.querySelector("#codeInput").value);
}

async function addCode(value) {
  try {
    const code = normalizeCode(value);
    const { watchlist = [] } = await chrome.storage.local.get(watchlistKey);
    if (!watchlist.some(item => item.code === code)) await chrome.storage.local.set({ [watchlistKey]: [...watchlist, { code, strategies: defaultStrategies }] });
    document.querySelector("#codeInput").value = "";
    await render();
  } catch (error) { setStatus(error.message); }
}

let searchTimer;
async function showSuggestions(event) {
  const container = document.querySelector("#suggestions");
  const value = event.target.value.trim();
  clearTimeout(searchTimer);
  if (!value) { container.replaceChildren(); return; }
  container.replaceChildren(text("搜索中...", "suggestion-status"));
  searchTimer = setTimeout(async () => {
    try {
      const matches = await searchSymbols(value);
      container.replaceChildren(...(matches.length ? matches.map(item => {
        const option = document.createElement("button");
        option.type = "button"; option.className = "suggestion"; option.setAttribute("role", "option");
        option.innerHTML = `<strong>${item.name}</strong><span>${item.code}</span>`;
        option.addEventListener("click", () => addCode(item.code));
        return option;
      }) : [text("没有匹配标的", "suggestion-status")]));
    } catch (error) { container.replaceChildren(text(error.message, "suggestion-status")); }
  }, 180);
}

async function render() {
  await migrateWatchlist();
  const { watchlist = [], settings = {} } = await chrome.storage.local.get([watchlistKey, settingsKey]);
  document.querySelector("#notifyEnabled").checked = Boolean(settings.notificationsEnabled);
  watchlistEl.replaceChildren();
  if (!watchlist.length) { watchlistEl.innerHTML = '<p class="empty">还没有标的</p>'; return; }
  setStatus("更新中...");
  await Promise.all(watchlist.map(async item => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".stock-name").textContent = item.code;
    node.querySelector(".stock-name").title = item.code;
    node.querySelector(".stock-name").addEventListener("click", () => window.open(`${chrome.runtime.getURL("detail.html")}?code=${encodeURIComponent(item.code)}`, "_blank"));
    node.querySelector(".remove").addEventListener("click", () => removeStock(item.code));
    node.querySelector(".strategy-row").append(...Object.entries(STRATEGIES).map(([id, strategy]) => strategyToggle(item, id, strategy.name)));
    watchlistEl.append(node);
    try {
      const { name, candles, stale, cachedAt } = await fetchKlines(item.code);
      node.querySelector(".stock-name").textContent = `${name} ${item.code}${stale ? " · 缓存" : ""}`;
      if (stale && cachedAt) node.querySelector(".stock-name").title = `网络不可用，显示缓存于 ${new Date(cachedAt).toLocaleString()} 的数据`;
      node.querySelector(".price").textContent = candles.at(-1).close.toFixed(2);
      const enabledStrategies = item.strategies || defaultStrategies;
      const markers = signalMarkers(candles, enabledStrategies);
      drawChart(node.querySelector(".chart"), candles, markers);
      const signals = evaluateSignals(candles, enabledStrategies);
      const signalEl = node.querySelector(".signals");
      if (signals.length) {
        signalEl.replaceChildren(...signals.map(signal => badge(`${signal.direction === "SELL" ? "空" : "多"} · ${signal.name}`, signal.detail)));
      } else if (markers.length) {
        const recent = markers.at(-1);
        signalEl.replaceChildren(badge(`最近${recent.label}点 · ${candles[recent.index].date}`, "历史信号，仅作参考"));
      } else signalEl.replaceChildren(text("暂无已选策略信号", "none"));
    } catch (error) { node.querySelector(".signals").append(text(error.message, "none")); }
  }));
  setStatus(`已更新 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
}

async function migrateWatchlist() {
  const { watchlist = [] } = await chrome.storage.local.get(watchlistKey);
  let changed = false;
  const migrated = watchlist.map(item => {
    if (item.strategies?.includes("flushLongShort")) return item;
    changed = true;
    return { ...item, strategies: [...new Set([...(item.strategies || defaultStrategies), "flushLongShort"]) ] };
  });
  if (changed) await chrome.storage.local.set({ [watchlistKey]: migrated });
}

function strategyToggle(item, id, label) {
  const wrapper = document.createElement("label");
  const input = document.createElement("input"); input.type = "checkbox"; input.checked = (item.strategies || defaultStrategies).includes(id);
  input.addEventListener("change", () => saveStrategy(item.code, id, input.checked));
  wrapper.append(input, document.createTextNode(label)); return wrapper;
}
async function saveStrategy(code, strategy, enabled) {
  const { watchlist = [] } = await chrome.storage.local.get(watchlistKey);
  await chrome.storage.local.set({ [watchlistKey]: watchlist.map(item => item.code !== code ? item : { ...item, strategies: enabled ? [...new Set([...(item.strategies || defaultStrategies), strategy])] : (item.strategies || defaultStrategies).filter(id => id !== strategy) }) });
  render();
}
async function removeStock(code) { const { watchlist = [] } = await chrome.storage.local.get(watchlistKey); await chrome.storage.local.set({ [watchlistKey]: watchlist.filter(item => item.code !== code) }); render(); }
function badge(label, detail) { const element = text(label, `signal ${detail.includes("做空") || detail.includes("下穿") ? "sell" : "buy"}`); element.title = detail; return element; }
function text(value, className) { const element = document.createElement("span"); element.className = className; element.textContent = value; return element; }
function setStatus(value) { statusEl.textContent = value; }
function drawChart(svg, candles, markers = []) { const offset = Math.max(0, candles.length - 60); const data = candles.slice(offset); const values = data.map(item => item.close); const min = Math.min(...values); const max = Math.max(...values); const scaleY = value => 47 - ((value - min) / (max - min || 1)) * 38; const points = values.map((value, index) => `${(index / (values.length - 1)) * 280},${scaleY(value)}`).join(" "); const marks = markers.filter(marker => marker.index >= offset).map(marker => { const x = ((marker.index - offset) / (values.length - 1)) * 280; const y = Math.max(7, Math.min(43, scaleY(candles[marker.index].close) + (marker.direction === "BUY" ? 7 : -7))); const color = marker.direction === "BUY" ? "#12b76a" : "#f04438"; return `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"/><text x="${x}" y="${y + (marker.direction === "BUY" ? 3 : -5)}" fill="#fff" font-size="5" text-anchor="middle">${marker.label}</text>`; }).join(""); svg.innerHTML = `<polyline points="${points}" fill="none" stroke="#1677ff" stroke-width="1.5"/>${marks}<line x1="0" y1="47.5" x2="280" y2="47.5" stroke="#e4e7ec"/>`; }
async function checkNow() { setStatus("检查中..."); const result = await chrome.runtime.sendMessage({ type: "check-now" }); setStatus(result.ok ? `新记录 ${result.result.recordsAdded || 0} · 提醒 ${result.result.notifications || 0}` : result.error); }
render();
