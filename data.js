export function normalizeCode(input) {
  const code = String(input || "").trim().replace(/[^0-9]/g, "");
  if (!/^(0|3|6|8)\d{5}$/.test(code)) throw new Error("请输入 6 位 A 股代码");
  return code;
}

export function normalizeBondCode(input) {
  const code = String(input || "").trim().replace(/[^0-9]/g, "");
  if (!/^(11|12|13)\d{4}$/.test(code)) throw new Error("请输入 6 位转债代码，如 123001");
  return code;
}

export function secId(code) {
  return /^(5|6|9)/.test(code) ? `1.${code}` : `0.${code}`;
}

const CACHE_PREFIX = "stock-signal-cache:v1:";
const cacheKey = (kind, code, period = "") => `${CACHE_PREFIX}${kind}:${code}:${period}`;

async function readCache(key) {
  const stored = await chrome.storage.local.get(key);
  return stored[key] || null;
}

async function writeCache(key, value) {
  await chrome.storage.local.set({ [key]: { ...value, cachedAt: Date.now() } });
}

export async function searchSymbols(query) {
  const keyword = String(query || "").trim().toLowerCase();
  if (!keyword) return [];
  const key = cacheKey("search", keyword);
  try {
    const response = await fetch(`https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(keyword)}&t=all`);
    if (!response.ok) throw new Error("股票搜索请求失败，请稍后重试");
    const body = await response.text();
    const match = body.match(/v_hint="([^"]*)"/);
    const result = !match || match[1] === "N" ? [] : match[1].split("^").map(hint => hint.split("~"))
      .filter(parts => parts.length >= 3 && /^\d{6}$/.test(parts[1]))
      .map(parts => ({ code: parts[1], name: decodeEscapedUnicode(parts[2]) })).slice(0, 8);
    await writeCache(key, { result });
    return result;
  } catch (error) {
    const cached = await readCache(key);
    if (cached?.result) return cached.result;
    throw error;
  }
}

function decodeEscapedUnicode(value) {
  return value.replace(/\\u([0-9a-f]{4})/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}

export async function fetchKlines(code, period = "101") {
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  url.search = new URLSearchParams({ secid: secId(code), klt: period, fqt: "1", beg: "0", end: "20500101", lmt: period === "103" ? "120" : "180", fields1: "f1,f2,f3,f4,f5,f6", fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61" });
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("primary source unavailable");
    const payload = await response.json();
    if (!payload.data?.klines?.length) throw new Error("no primary data");
    const result = { name: payload.data.name || code, candles: payload.data.klines.map(parseCandle), source: "eastmoney", stale: false, cachedAt: Date.now() };
    await writeCache(cacheKey("klines", code, period), result);
    return result;
  } catch (_error) {
    try {
      const result = await fetchTencentKlines(code, period);
      await writeCache(cacheKey("klines", code, period), result);
      return result;
    } catch (fallbackError) {
      const cached = await readCache(cacheKey("klines", code, period));
      if (cached?.candles?.length) return { ...cached, stale: true, source: "local-cache" };
      throw fallbackError;
    }
  }
}

function parseCandle(line) { const [date, open, close, high, low, volume] = line.split(","); return { date, open: Number(open), close: Number(close), high: Number(high), low: Number(low), volume: Number(volume) }; }

async function fetchTencentKlines(code, period) {
  const market = /^(6|5|9)/.test(code) ? "sh" : "sz";
  const type = period === "103" ? "month" : "day";
  const url = `https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get?_var=kline_data&param=${market}${code},${type},,,${period === "103" ? 120 : 180},bfq`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`行情请求失败 (${response.status})`);
  const text = await response.text();
  const payload = JSON.parse(text.slice(text.indexOf("=") + 1));
  const quote = payload.data?.[`${market}${code}`];
  const lines = quote?.[type] || [];
  if (!lines.length) throw new Error("未找到该标的的 K 线数据");
  return { name: quote.qt?.[`${market}${code}`]?.[1] || code, candles: lines.map(line => ({ date: line[0], open: Number(line[1]), close: Number(line[2]), high: Number(line[3]), low: Number(line[4]), volume: Number(line[5]) })), source: "tencent", stale: false, cachedAt: Date.now() };
}

export async function fetchIntraday(code) {
  const market = /^(6|5|9)/.test(code) ? "sh" : "sz";
  const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${market}${code}`;
  const key = cacheKey("intraday", code, new Date().toISOString().slice(0, 10));
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`分时请求失败 (${response.status})`);
    const payload = await response.json();
    const quote = payload.data?.[`${market}${code}`];
    const lines = quote?.data?.data || [];
    if (!lines.length) throw new Error("暂无分时数据");
    const result = { name: code, points: lines.map(line => { const [time, price, volume, amount] = line.split(" "); return { time, price: Number(price), average: Number(amount) / Math.max(1, Number(volume) * 100), volume: Number(volume), amount: Number(amount) }; }), source: "tencent", stale: false, cachedAt: Date.now() };
    await writeCache(key, result);
    return result;
  } catch (error) {
    const cached = await readCache(key);
    if (cached?.points?.length) return { ...cached, stale: true, source: "local-cache" };
    throw error;
  }
}

export async function fetchBondQuote(code) {
  const market = /^(11|12)/.test(code) ? "sh" : "sz";
  const key = cacheKey("bond", code);
  try {
    const response = await fetch(`https://qt.gtimg.cn/q=${market}${code}`);
    if (!response.ok) throw new Error(`转债行情请求失败 (${response.status})`);
    const body = new TextDecoder("gbk").decode(await response.arrayBuffer());
    const match = body.match(/v_[^=]+="([\s\S]*?)"/);
    if (!match || match[1] === "1") throw new Error("未找到该转债");
    const fields = match[1].split("~");
    if (fields.length < 6) throw new Error("转债行情数据不完整");
    const result = { code: fields[2] || code, name: decodeEscapedUnicode(fields[1]) || code, price: Number(fields[3]), previous: Number(fields[4]), change: Number(fields[32] || 0), volume: Number(fields[6] || 0), time: fields[30] || "", source: "tencent", stale: false, cachedAt: Date.now() };
    await writeCache(key, result);
    return result;
  } catch (error) {
    const cached = await readCache(key);
    if (cached?.price) return { ...cached, stale: true, source: "local-cache" };
    throw error;
  }
}
