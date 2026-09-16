import { fetchIntraday, fetchKlines } from "./data.js";
import { signalMarkers } from "./strategies.js";

const params = new URLSearchParams(location.search);
const code = params.get("code") || "000333";
const canvas = document.querySelector("#chart");
const tooltip = document.querySelector("#tooltip");
let view = "day";
let chartData = [];
let markers = [];
document.querySelector("#version").textContent = `v${chrome.runtime.getManifest().version}`;
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => { view = button.dataset.view; document.querySelectorAll("[data-view]").forEach(item => item.classList.toggle("active", item === button)); load(); }));
document.querySelector("#refresh").addEventListener("click", load);
canvas.addEventListener("mousemove", showTooltip);
canvas.addEventListener("mouseleave", () => { tooltip.style.display = "none"; draw(); });
window.addEventListener("resize", draw);

async function load() {
  document.querySelector("#status").textContent = "加载中...";
  try {
    if (view === "intraday") { const result = await fetchIntraday(code); document.querySelector("#title").textContent = `${result.name} ${code} · 分时`; chartData = result.points; markers = []; }
    else { const result = await fetchKlines(code, view === "month" ? "103" : "101"); document.querySelector("#title").textContent = `${result.name} ${code} · ${view === "month" ? "月K" : "日K"}`; chartData = result.candles; markers = view === "day" ? signalMarkers(result.candles) : []; }
    document.querySelector("#status").textContent = `${chartData.length} 个数据点 · 鼠标悬浮查看详情`; draw();
  } catch (error) { document.querySelector("#status").textContent = error.message; chartData = []; draw(); }
}

function draw() {
  const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1; canvas.width = Math.max(1, rect.width * ratio); canvas.height = Math.max(1, rect.height * ratio); const ctx = canvas.getContext("2d"); ctx.scale(ratio, ratio); const width = rect.width; const height = rect.height; ctx.clearRect(0, 0, width, height); if (!chartData.length) return;
  const data = chartData.slice(-120); const values = data.map(item => view === "intraday" ? item.price : item.close); const min = Math.min(...values); const max = Math.max(...values); const left = 48; const right = width - 18; const top = 18; const bottom = height - 42; const xAt = index => left + (index / Math.max(1, data.length - 1)) * (right - left); const yAt = value => bottom - ((value - min) / (max - min || 1)) * (bottom - top);
  ctx.strokeStyle = "#eaecf0"; ctx.fillStyle = "#667085"; ctx.font = "11px Microsoft YaHei"; for (let row = 0; row < 5; row += 1) { const y = top + row * (bottom - top) / 4; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); ctx.fillText((max - row * (max - min) / 4).toFixed(2), 5, y + 4); }
  ctx.strokeStyle = "#1677ff"; ctx.lineWidth = 1.5; ctx.beginPath(); data.forEach((item, index) => { const x = xAt(index); const y = yAt(view === "intraday" ? item.price : item.close); index ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  if (view !== "intraday") { data.forEach((item, index) => { const x = xAt(index); const yOpen = yAt(item.open); const yClose = yAt(item.close); ctx.strokeStyle = item.close >= item.open ? "#12b76a" : "#f04438"; ctx.beginPath(); ctx.moveTo(x, yAt(item.low)); ctx.lineTo(x, yAt(item.high)); ctx.stroke(); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, yOpen); ctx.lineTo(x, yClose); ctx.stroke(); ctx.lineWidth = 1.5; }); markers.filter(marker => marker.index >= chartData.length - data.length).forEach(marker => { const x = xAt(marker.index - (chartData.length - data.length)); const y = yAt(chartData[marker.index].close) + (marker.direction === "BUY" ? 12 : -12); ctx.fillStyle = marker.direction === "BUY" ? "#12b76a" : "#f04438"; ctx.beginPath(); ctx.arc(x, Math.max(top, Math.min(bottom, y)), 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = "8px Microsoft YaHei"; ctx.textAlign = "center"; ctx.fillText(marker.label, x, Math.max(top + 3, Math.min(bottom + 3, y + 3))); ctx.textAlign = "left"; }); }
  ctx.fillStyle = "#667085"; const step = Math.max(1, Math.floor(data.length / 6)); data.forEach((item, index) => { if (index % step === 0) ctx.fillText((item.date || item.time).slice(0, 10), xAt(index) - 18, height - 16); });
}
function showTooltip(event) { if (!chartData.length) return; const rect = canvas.getBoundingClientRect(); const data = chartData.slice(-120); const index = Math.round(((event.clientX - rect.left - 48) / Math.max(1, rect.width - 66)) * (data.length - 1)); if (index < 0 || index >= data.length) return; const globalIndex = chartData.length - data.length + index; const item = data[index]; const point = view === "intraday" ? `时间：${item.time}<br>价格：${item.price.toFixed(2)}<br>均价：${item.average.toFixed(2)}<br>成交量：${item.volume}` : `日期：${item.date}<br>开：${item.open.toFixed(2)}　收：${item.close.toFixed(2)}<br>高：${item.high.toFixed(2)}　低：${item.low.toFixed(2)}<br>成交量：${item.volume}`; const daySignals = markers.filter(marker => marker.index === globalIndex); const signalText = daySignals.length ? `<br><b>信号：</b>${daySignals.map(marker => `${marker.label} · ${marker.strategyName}`).join("<br>")}` : ""; tooltip.innerHTML = point + signalText; tooltip.style.display = "block"; tooltip.style.left = `${Math.min(rect.width - 220, Math.max(8, event.clientX - rect.left + 12))}px`; tooltip.style.top = `${Math.max(8, event.clientY - 95)}px`; draw(); const ctx = canvas.getContext("2d"); const x = 48 + index / Math.max(1, data.length - 1) * (rect.width - 66); ctx.strokeStyle = "#98a2b3"; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, rect.height - 42); ctx.stroke(); ctx.setLineDash([]); }
load();
