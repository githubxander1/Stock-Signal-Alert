import { fetchKlines } from "./data.js";
import { STRATEGIES, evaluateSignals, signalMarkers } from "./strategies.js";

const explanations = {
  flushLongShort: "使用 21 日高低点振荡值与 6 日平滑线的交叉判断多空点，显示历史多点和空点。",
  macdCross: "DIF 上穿 DEA 为金叉做多，DIF 下穿 DEA 为死叉做空。",
  rsiOversold: "RSI14 小于 20 视为超卖做多，大于 80 视为超买做空。",
  kdjRebound: "J 值从 20 以下回升且 K 上穿 D 时做多。",
  maBull: "MA5、MA10、MA20 依次向上排列且收盘价站上 MA5。",
  oneBullThreeMa: "阳线开盘位于三条均线下方，收盘同时突破三条均线。"
};
const keys = Object.keys(STRATEGIES);
let selected = keys[0];
const nav = document.querySelector("#strategyNav");
document.querySelector("#version").textContent = `v${chrome.runtime.getManifest().version}`;
keys.forEach(key => { const button = document.createElement("button"); button.textContent = STRATEGIES[key].name; button.addEventListener("click", () => { selected = key; render(); }); nav.append(button); });

async function render() {
  [...nav.children].forEach((button, index) => button.classList.toggle("active", keys[index] === selected));
  document.querySelector("#strategyTitle").textContent = STRATEGIES[selected].name;
  document.querySelector("#strategyExplain").textContent = explanations[selected] || "该策略已加入目录，当前依据自选股日线数据进行本地扫描。";
  const { watchlist = [] } = await chrome.storage.local.get("watchlist");
  const results = document.querySelector("#results"); results.innerHTML = "";
  if (!watchlist.length) { results.innerHTML = '<tr><td colspan="5" class="empty">请先在主弹窗添加自选标的</td></tr>'; updateStats(0, 0, 0, 0); return; }
  updateStats(watchlist.length, 0, 0, 0); results.innerHTML = '<tr><td colspan="5" class="empty">正在读取日线数据...</td></tr>';
  const rows = await Promise.all(watchlist.map(async item => {
    try {
      const { name, candles } = await fetchKlines(item.code);
      const enabled = item.strategies || keys;
      const current = evaluateSignals(candles, enabled).filter(signal => signal.id === selected);
      const markers = signalMarkers(candles, enabled).filter(marker => enabled.includes(selected));
      const recent = markers.at(-1);
      return { code: item.code, name, price: candles.at(-1).close.toFixed(2), current, recent, candles };
    } catch (error) { return { code: item.code, error: error.message }; }
  }));
  results.replaceChildren(...rows.map(row => buildRow(row)));
  const matched = rows.filter(row => row.current?.length).length;
  const buy = rows.reduce((sum, row) => sum + (row.current || []).filter(signal => signal.direction === "BUY").length, 0);
  const sell = rows.reduce((sum, row) => sum + (row.current || []).filter(signal => signal.direction === "SELL").length, 0);
  updateStats(rows.length, matched, buy, sell); document.querySelector("#updated").textContent = `更新于 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
function buildRow(row) { const tr = document.createElement("tr"); if (row.error) { tr.innerHTML = `<td><strong>${row.code}</strong></td><td colspan="4" class="code">${row.error}</td>`; return tr; } const current = row.current.length ? row.current.map(signal => `<span class="signal ${signal.direction === "SELL" ? "sell" : ""}">${signal.direction === "SELL" ? "空" : "多"} ${signal.name}</span>`).join("") : "-"; const recent = row.recent ? `${row.recent.label} · ${row.candles[row.recent.index].date}` : "-"; tr.innerHTML = `<td><strong>${row.name}</strong><br><span class="code">${row.code}</span></td><td>${row.price}</td><td>${current}</td><td>${recent}</td><td>${row.candles.length} 根</td>`; return tr; }
function updateStats(total, matched, buy, sell) { document.querySelector("#total").textContent = total; document.querySelector("#matched").textContent = matched; document.querySelector("#buyCount").textContent = buy; document.querySelector("#sellCount").textContent = sell; }
render();
