export const SIGNAL_HISTORY_KEY = "signalHistory:v1";
export const MAX_SIGNAL_HISTORY = 5000;

export function createFirstSignalRecords({ code, name, candles, signals, observedAt = Date.now() }) {
  const candle = candles?.at(-1);
  if (!candle?.date) return [];

  return ["BUY", "SELL"].flatMap(direction => {
    const matched = signals.filter(signal => signal.direction === direction);
    if (!matched.length) return [];
    return [{
      key: `${code}:${candle.date}:${direction}`,
      code,
      name,
      date: candle.date,
      direction,
      price: candle.close,
      observedAt,
      signals: matched.map(({ id, name: strategyName, detail }) => ({ id, name: strategyName, detail }))
    }];
  });
}

export function mergeFirstSignalRecords(existing, incoming, limit = MAX_SIGNAL_HISTORY) {
  const records = Array.isArray(existing) ? existing : [];
  const known = new Set(records.map(record => record.key));
  const added = incoming.filter(record => !known.has(record.key));
  return [...records, ...added]
    .sort((a, b) => b.date.localeCompare(a.date) || b.observedAt - a.observedAt)
    .slice(0, limit);
}
