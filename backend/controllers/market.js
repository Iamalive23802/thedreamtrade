const fetch = require('node-fetch');

const TICKERS = [
  { label: 'Nifty 50', symbol: '^NSEI' },
  { label: 'Bank Nifty', symbol: '^NSEBANK' },
  { label: 'Sensex', symbol: '^BSESN' },
  { label: 'Fin Nifty', symbol: 'NIFTY_FIN_SERVICE.NS' },
];

const fetchQuote = async ({ label, symbol }) => {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DreamTradeCRM/1.0)' },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || meta.regularMarketPrice == null) return null;

  const price = meta.regularMarketPrice;
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const change = price - prev;
  const changePercent = prev ? (change / prev) * 100 : 0;

  return {
    label,
    price,
    change,
    changePercent,
  };
};

const getMarketTickers = async (req, res) => {
  try {
    const results = await Promise.all(TICKERS.map(fetchQuote));
    const tickers = results.filter(Boolean);

    if (tickers.length === 0) {
      return res.status(502).json({ error: 'No market data available' });
    }

    res.json(tickers);
  } catch (err) {
    console.error('Failed to fetch market tickers:', err.message);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
};

module.exports = { getMarketTickers };
