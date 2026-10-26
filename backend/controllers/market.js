const fetch = require('node-fetch');

const TICKERS = [
  { label: 'Nifty 50', symbol: '^NSEI' },
  { label: 'Bank Nifty', symbol: '^NSEBANK' },
  { label: 'Sensex', symbol: '^BSESN' },
  { label: 'Fin Nifty', symbol: 'NIFTY_FIN_SERVICE.NS' },
];

/** Short in-memory cache so concurrent clients share one Yahoo pull. */
let cache = { at: 0, data: null };
const CACHE_TTL_MS = 3000;

const latestFromSeries = (result) => {
  const closes = result?.indicators?.quote?.[0]?.close;
  const timestamps = result?.timestamp;
  if (!Array.isArray(closes) || !Array.isArray(timestamps)) return null;

  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const close = closes[i];
    if (close != null && Number.isFinite(close)) {
      return {
        price: close,
        marketTime: timestamps[i] || null,
      };
    }
  }
  return null;
};

const fetchQuote = async ({ label, symbol }) => {
  // 1-minute bars give near real-time last traded price during market hours
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1m&range=1d&includePrePost=true`;

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) return null;

  const fromSeries = latestFromSeries(result);
  const price =
    fromSeries?.price ??
    meta.regularMarketPrice ??
    meta.postMarketPrice ??
    meta.preMarketPrice;

  if (price == null || !Number.isFinite(price)) return null;

  const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const change = price - prev;
  const changePercent = prev ? (change / prev) * 100 : 0;
  const marketTime =
    fromSeries?.marketTime ??
    meta.regularMarketTime ??
    null;

  return {
    label,
    symbol,
    price,
    change,
    changePercent,
    marketTime,
    updatedAt: new Date().toISOString(),
  };
};

const getMarketTickers = async (req, res) => {
  try {
    const now = Date.now();
    if (cache.data && now - cache.at < CACHE_TTL_MS) {
      res.set('Cache-Control', 'no-store');
      return res.json(cache.data);
    }

    const results = await Promise.all(TICKERS.map(fetchQuote));
    const tickers = results.filter(Boolean);

    if (tickers.length === 0) {
      return res.status(502).json({ error: 'No market data available' });
    }

    cache = { at: now, data: tickers };
    res.set('Cache-Control', 'no-store');
    res.json(tickers);
  } catch (err) {
    console.error('Failed to fetch market tickers:', err.message);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
};

module.exports = { getMarketTickers };
