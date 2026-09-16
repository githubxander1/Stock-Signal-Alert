export const STRATEGIES = {
  moreChelue: { name: "多策略重叠", direction: "BUY" },
  cycleLow: { name: "热门周期新低", direction: "BUY" },
  flushLongShort: { name: "同花顺多空", direction: "BOTH" },
  macdCross: { name: "MACD 金叉/死叉", direction: "BOTH" },
  rsiOversold: { name: "RSI 超买/超卖", direction: "BOTH" },
  kdjRebound: { name: "KDJ 低位反弹", direction: "BUY" },
  OoeToThree: { name: "一阳穿三线", direction: "BUY" },
  lianZhang: { name: "连板", direction: "BUY" },
  lianZhangTWO: { name: "连板-2连板", direction: "BUY" },
  determineWhether: { name: "高低差", direction: "BUY" },
  maBull: { name: "均线多头", direction: "BUY" },
  moreThanAverageSprout: { name: "均线多头-萌芽期", direction: "BUY" },
  moreThanAverageJianchang: { name: "均线多头-建仓完毕", direction: "BUY" },
  chanYangNotBroken: { name: "单阳不破", direction: "BUY" },
  cyclicHighBreak: { name: "周期高位突破", direction: "BUY" },
  promoteTheDip: { name: "金针探底", direction: "BUY" },
  risingThreeMethods: { name: "上升三法", direction: "BUY" },
  newBottom: { name: "新股抄底", direction: "BUY" },
  TP: { name: "停牌", direction: "INFO" },
  DT: { name: "跌停", direction: "SELL" },
  ZT: { name: "涨停", direction: "BUY" },
  promoteTheDipSelection: { name: "金针探底-精选", direction: "BUY" },
  moreThanAverageJianchangSelection: { name: "均线多头-建仓完毕-精选", direction: "BUY" },
  Online20days: { name: "均线多头-踩20日线-精选", direction: "BUY" },
  newStockNewHeight: { name: "新股冲高", direction: "BUY" },
  thePriceToBookRatioIsLessThan2: { name: "市净率小于2", direction: "BUY" },
  LowHorizontalVolume: { name: "低位横盘放量", direction: "BUY" }
};

const round = (value, digits = 2) => Number(value.toFixed(digits));
const ema = (values, period) => {
  const result = [];
  const multiplier = 2 / (period + 1);
  values.forEach((value, index) => result.push(index === 0 ? value : value * multiplier + result[index - 1] * (1 - multiplier)));
  return result;
};
const sma = (values, period, index) => index < period - 1 ? null : values.slice(index - period + 1, index + 1).reduce((total, value) => total + value, 0) / period;

function buildMacd(closes) {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const dif = fast.map((value, index) => value - slow[index]);
  const dea = ema(dif, 9);
  return { dif, dea, histogram: dif.map((value, index) => (value - dea[index]) * 2) };
}

function buildRsi(closes, period = 14) {
  return closes.map((close, index) => {
    if (index < period) return null;
    let gains = 0;
    let losses = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      const delta = closes[cursor] - closes[cursor - 1];
      if (delta >= 0) gains += delta; else losses -= delta;
    }
    if (!losses) return 100;
    return 100 - 100 / (1 + gains / losses);
  });
}

function buildKdj(candles, period = 9) {
  let k = 50;
  let d = 50;
  return candles.map((candle, index) => {
    if (index < period - 1) return { k: 50, d: 50, j: 50 };
    const sample = candles.slice(index - period + 1, index + 1);
    const high = Math.max(...sample.map(item => item.high));
    const low = Math.min(...sample.map(item => item.low));
    const rsv = high === low ? 50 : ((candle.close - low) / (high - low)) * 100;
    k = (2 * k + rsv) / 3;
    d = (2 * d + k) / 3;
    return { k, d, j: 3 * k - 2 * d };
  });
}

function buildFlushLongShort(candles) {
  const fast = candles.map((candle, index) => {
    const sample = candles.slice(Math.max(0, index - 20), index + 1);
    const high = Math.max(...sample.map(item => item.high));
    const low = Math.min(...sample.map(item => item.low));
    return high === low ? 50 : 100 - 90 * ((high - candle.close) / (high - low));
  });
  const raw = candles.map((candle, index) => {
    const sample = candles.slice(Math.max(0, index - 5), index + 1);
    const high = Math.max(...sample.map(item => item.high));
    const low = Math.min(...sample.map(item => item.low));
    return high === low ? 50 : 100 * ((high - candle.close) / (high - low));
  });
  // Match the original parameterization: VAR3(6) -> MA(34) -> 100 - value.
  const slow = raw.map((_value, index) => index < 33 ? null : 100 - raw.slice(index - 33, index + 1).reduce((sum, value) => sum + value, 0) / 34);
  return { fast, slow };
}

const crossUp = (left, right, index) => index > 0 && left[index - 1] < right[index - 1] && left[index] >= right[index];
const crossDown = (left, right, index) => index > 0 && left[index - 1] > right[index - 1] && left[index] <= right[index];
const pct = (now, before) => before ? ((now - before) / before) * 100 : 0;
const tail = (values, count) => values.slice(Math.max(0, values.length - count));

export function evaluateSignals(candles, enabledIds = Object.keys(STRATEGIES)) {
  if (!Array.isArray(candles) || candles.length < 35) return [];
  const closes = candles.map(item => item.close);
  const index = candles.length - 1;
  const previous = index - 1;
  const macd = buildMacd(closes);
  const rsi = buildRsi(closes);
  const kdj = buildKdj(candles);
  const ma5 = sma(closes, 5, index);
  const ma10 = sma(closes, 10, index);
  const ma20 = sma(closes, 20, index);
  const signals = [];
  const push = (id, active, detail, direction = STRATEGIES[id].direction) => {
    if (active && enabledIds.includes(id)) signals.push({ id, name: STRATEGIES[id].name, direction, detail });
  };

  const dk = buildFlushLongShort(candles);
  push("flushLongShort", crossUp(dk.fast, dk.slow, index), `多点：D 上穿，当前值 ${round(dk.fast[index])}`, "BUY");
  push("flushLongShort", crossDown(dk.fast, dk.slow, index), `空点：K 下穿，当前值 ${round(dk.fast[index])}`, "SELL");
  push("macdCross", crossUp(macd.dif, macd.dea, index), `DIF ${round(macd.dif[index], 3)} 上穿 DEA ${round(macd.dea[index], 3)}`, "BUY");
  push("macdCross", crossDown(macd.dif, macd.dea, index), `DIF ${round(macd.dif[index], 3)} 下穿 DEA ${round(macd.dea[index], 3)}`, "SELL");
  push("rsiOversold", rsi[index] < 20, `RSI14 ${round(rsi[index])}，超卖做多`, "BUY");
  push("rsiOversold", rsi[index] > 80, `RSI14 ${round(rsi[index])}，超买做空`, "SELL");
  push("kdjRebound", kdj[previous].j < 20 && kdj[index].j >= 20 && kdj[index].k > kdj[index].d, `J 值回升至 ${round(kdj[index].j)}`);
  push("maBull", ma5 && ma10 && ma20 && ma5 > ma10 && ma10 > ma20 && closes[index] > ma5, `MA5 ${round(ma5)} > MA10 ${round(ma10)} > MA20 ${round(ma20)}`);
  push("OoeToThree", ma5 && ma10 && ma20 && candles[index].close > candles[index].open && candles[index].open < Math.min(ma5, ma10, ma20) && candles[index].close > Math.max(ma5, ma10, ma20), "阳线实体穿越 MA5 / MA10 / MA20");
  addAdditionalSignals(signals, candles, enabledIds, { closes, index, ma5, ma10, ma20, kdj, macd, rsi });
  return signals;
}

function addAdditionalSignals(signals, candles, enabledIds, context) {
  const { closes, index, ma5, ma10, ma20, kdj, macd, rsi } = context;
  const last = candles[index];
  const push = (id, active, detail, direction = STRATEGIES[id].direction) => { if (active && enabledIds.includes(id)) signals.push({ id, name: STRATEGIES[id].name, direction, detail }); };
  const ma30 = sma(closes, 30, index);
  const ma60 = sma(closes, 60, index);
  const low22 = Math.min(...tail(candles, 22).map(item => item.low));
  const high40 = Math.max(...candles.slice(Math.max(0, index - 40), index).map(item => item.high));
  const redBefore = candles.slice(Math.max(0, index - 3), index).every(item => item.close < item.open);
  const body = Math.abs(last.close - last.open);
  const lowerShadow = Math.min(last.open, last.close) - last.low;
  const rise = candles.slice(Math.max(0, index - 15), index + 1).some(item => pct(item.close, item.open) > 6);
  const recentRange = tail(candles, 20);
  const rangePct = pct(Math.max(...recentRange.map(item => item.high)), Math.min(...recentRange.map(item => item.low)));
  const currentSignals = signals.length;
  push("moreChelue", currentSignals >= 2, `当前有 ${currentSignals} 个策略同时触发`);
  push("cycleLow", last.close <= low22 * 1.03 && last.close < closes[Math.max(0, index - 5)], "22 日周期接近新低");
  let streak = 0; for (let cursor = index; cursor > 0 && pct(candles[cursor].close, candles[cursor - 1].close) >= 9.5; cursor -= 1) streak += 1;
  push("lianZhang", streak >= 1, `${streak} 连板`);
  push("lianZhangTWO", streak >= 2, `${streak} 连板`);
  push("determineWhether", rangePct >= 12, `20 日高低波动 ${round(rangePct)}%`);
  push("moreThanAverageSprout", ma5 && ma10 && ma20 && ma30 && ma60 && ma5 > ma10 && ma10 > ma20 && ma20 > ma30 && ma30 > ma60 && (closes[index - 1] < (sma(closes, 5, index - 1) || 0) || closes[index - 1] < (sma(closes, 10, index - 1) || 0)), "均线多头进入萌芽期");
  push("moreThanAverageJianchang", ma5 && ma10 && ma20 && ma60 && ma5 > ma10 && ma10 > ma20 && ma20 > ma60 && last.close < ma20, "多头排列回踩 MA20");
  push("chanYangNotBroken", rise && last.close > last.open && last.low > Math.min(...tail(candles, 15).map(item => item.low)), "前期大阳线后未跌破");
  push("cyclicHighBreak", last.close > high40, "突破 40 日高点");
  push("promoteTheDip", lowerShadow > body * 1.5 && pct(last.close, last.low) > 5, "长下影线探底回升");
  push("risingThreeMethods", redBefore && last.close > last.open && last.close > candles[Math.max(0, index - 3)].close, "上升三法形态");
  push("newBottom", last.close <= Math.min(...tail(candles, 60).map(item => item.low)) * 1.05, "接近 60 日低点");
  push("DT", pct(last.close, candles[index - 1].close) <= -9.5, "日线跌幅达到跌停附近", "SELL");
  push("ZT", pct(last.close, candles[index - 1].close) >= 9.5, "日线涨幅达到涨停附近", "BUY");
  push("promoteTheDipSelection", lowerShadow > body * 2 && pct(last.close, last.low) > 7 && last.close > last.open, "精选长下影探底");
  push("moreThanAverageJianchangSelection", ma5 && ma10 && ma20 && ma60 && ma5 > ma10 && ma10 > ma20 && ma20 > ma60 && last.close < ma20 && last.close > ma60, "精选多头回踩 MA20");
  push("Online20days", ma20 && Math.abs(pct(last.close, ma20)) <= 2 && last.close > ma60, "收盘贴近 MA20");
  push("newStockNewHeight", last.close >= Math.max(...tail(candles, 60).map(item => item.high)) * 0.98, "接近 60 日新高");
  push("LowHorizontalVolume", rangePct < 15 && last.volume > (candles[index - 1].volume + candles[index - 2].volume) / 2 * 1.3, "低位横盘后放量");
  // TP and PB require current trading-state and fundamental APIs; they stay visible in the catalog but do not guess.
  void kdj; void macd; void rsi;
}

export function signalMarkers(candles, enabledIds = Object.keys(STRATEGIES)) {
  if (!Array.isArray(candles) || candles.length < 35) return [];
  const markers = [];
  const closes = candles.map(item => item.close);
  const macd = buildMacd(closes);
  const dk = buildFlushLongShort(candles);
  const rsi = buildRsi(closes);
  const add = (id, index, direction, label) => markers.push({ index, direction, label, strategyId: id, strategyName: STRATEGIES[id].name });
  candles.forEach((_candle, index) => {
    if (enabledIds.includes("flushLongShort") && crossUp(dk.fast, dk.slow, index)) add("flushLongShort", index, "BUY", "多");
    if (enabledIds.includes("flushLongShort") && crossDown(dk.fast, dk.slow, index)) add("flushLongShort", index, "SELL", "空");
    if (enabledIds.includes("macdCross") && crossUp(macd.dif, macd.dea, index)) add("macdCross", index, "BUY", "多");
    if (enabledIds.includes("macdCross") && crossDown(macd.dif, macd.dea, index)) add("macdCross", index, "SELL", "空");
    if (enabledIds.includes("rsiOversold") && rsi[index] < 20) add("rsiOversold", index, "BUY", "多");
    if (enabledIds.includes("rsiOversold") && rsi[index] > 80) add("rsiOversold", index, "SELL", "空");
  });
  return markers;
}
