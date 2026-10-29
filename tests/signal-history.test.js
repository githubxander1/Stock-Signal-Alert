import test from "node:test";
import assert from "node:assert/strict";
import { createFirstSignalRecords, mergeFirstSignalRecords } from "../signal-history.js";

const candles = [{ date: "2026-10-29", close: 12.34 }];

test("creates one record per stock, trading day, and direction", () => {
  const records = createFirstSignalRecords({
    code: "600000",
    name: "浦发银行",
    candles,
    observedAt: 1000,
    signals: [
      { id: "macdCross", name: "MACD", direction: "BUY", detail: "金叉" },
      { id: "flushLongShort", name: "多空", direction: "BUY", detail: "上穿" },
      { id: "rsiOversold", name: "RSI", direction: "SELL", detail: "超买" },
      { id: "info", name: "信息", direction: "INFO", detail: "不记方向信号" }
    ]
  });

  assert.equal(records.length, 2);
  assert.equal(records[0].key, "600000:2026-10-29:BUY");
  assert.equal(records[0].signals.length, 2);
  assert.equal(records[1].direction, "SELL");
});

test("keeps the first same-day record and accepts a new date or opposite direction", () => {
  const first = createFirstSignalRecords({ code: "600000", name: "浦发银行", candles, observedAt: 1000, signals: [{ id: "a", name: "A", direction: "BUY", detail: "first" }] });
  const laterSameDirection = createFirstSignalRecords({ code: "600000", name: "浦发银行", candles, observedAt: 2000, signals: [{ id: "b", name: "B", direction: "BUY", detail: "later" }] });
  const oppositeDirection = createFirstSignalRecords({ code: "600000", name: "浦发银行", candles, observedAt: 3000, signals: [{ id: "c", name: "C", direction: "SELL", detail: "sell" }] });
  const nextDay = createFirstSignalRecords({ code: "600000", name: "浦发银行", candles: [{ date: "2026-10-30", close: 12 }], observedAt: 4000, signals: [{ id: "d", name: "D", direction: "BUY", detail: "next day" }] });
  const merged = mergeFirstSignalRecords(first, [...laterSameDirection, ...oppositeDirection, ...nextDay]);

  assert.equal(merged.length, 3);
  assert.equal(merged.find(record => record.key === first[0].key).signals[0].detail, "first");
  assert.deepEqual(merged.map(record => record.key), ["600000:2026-10-30:BUY", "600000:2026-10-29:SELL", "600000:2026-10-29:BUY"]);
});

test("bounds stored history to the configured limit", () => {
  const old = Array.from({ length: 5 }, (_, index) => ({ key: String(index), date: `2026-10-0${index + 1}`, observedAt: index }));
  assert.deepEqual(mergeFirstSignalRecords(old, [], 3).map(record => record.key), ["4", "3", "2"]);
});
