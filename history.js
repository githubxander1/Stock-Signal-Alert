import { SIGNAL_HISTORY_KEY } from "./signal-history.js";

const rowsEl = document.querySelector("#rows");
let records = [];
document.querySelector("#direction").addEventListener("change", render);
document.querySelector("#query").addEventListener("input", render);
document.querySelector("#export").addEventListener("click", exportCsv);
document.querySelector("#clear").addEventListener("click", clearHistory);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SIGNAL_HISTORY_KEY]) { records = changes[SIGNAL_HISTORY_KEY].newValue || []; render(); }
});
await load();

async function load() {
  const stored = await chrome.storage.local.get(SIGNAL_HISTORY_KEY);
  records = stored[SIGNAL_HISTORY_KEY] || [];
  render();
}

function filteredRecords() {
  const direction = document.querySelector("#direction").value;
  const query = document.querySelector("#query").value.trim().toLowerCase();
  return records.filter(record => (!direction || record.direction === direction)
    && (!query || `${record.name} ${record.code}`.toLowerCase().includes(query)));
}

function render() {
  const visible = filteredRecords();
  document.querySelector("#count").textContent = `${visible.length} 条记录（最多保留 5000 条）`;
  if (!visible.length) {
    rowsEl.innerHTML = `<tr><td colspan="7" class="empty">${records.length ? "没有符合条件的记录" : "暂无记录；后台检查到当日信号后会自动保存"}</td></tr>`;
    return;
  }
  rowsEl.replaceChildren(...visible.map(record => {
    const row = document.createElement("tr");
    const strategies = record.signals.map(signal => signal.name).join("、");
    const details = record.signals.map(signal => `${signal.name}：${signal.detail}`).join("；");
    const values = [record.date, new Date(record.observedAt).toLocaleTimeString(), `${record.name} (${record.code})`, record.direction === "BUY" ? "多头" : "空头", strategies, Number(record.price).toFixed(2), details];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 3) cell.className = `direction${record.direction === "SELL" ? " sell" : ""}`;
      if (index === 1) cell.classList.add("muted");
      row.append(cell);
    });
    return row;
  }));
}

function exportCsv() {
  const escape = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [["交易日", "首次记录时间", "代码", "名称", "方向", "策略", "价格", "信号详情"], ...filteredRecords().map(record => [record.date, new Date(record.observedAt).toISOString(), record.code, record.name, record.direction, record.signals.map(signal => signal.name).join("、"), record.price, record.signals.map(signal => `${signal.name}: ${signal.detail}`).join("; ")])];
  const blob = new Blob([`\uFEFF${lines.map(line => line.map(escape).join(",")).join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "stock-signal-first-events.csv"; anchor.click();
  URL.revokeObjectURL(url);
}

async function clearHistory() {
  if (!records.length || !confirm(`确定清空 ${records.length} 条信号记录？此操作无法撤销。`)) return;
  records = [];
  await chrome.storage.local.set({ [SIGNAL_HISTORY_KEY]: records });
  render();
}
