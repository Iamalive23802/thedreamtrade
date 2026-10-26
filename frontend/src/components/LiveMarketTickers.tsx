import { useEffect, useRef, useState } from 'react';
import axiosInstance from '../utils/axiosConfig';

type Ticker = {
  label: string;
  price: number;
  change: number;
  changePercent: number;
  marketTime?: number | null;
  updatedAt?: string;
};

const POLL_MS = 5000;

const formatPrice = (value: number) =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function LiveMarketTickers() {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  useEffect(() => {
    const fetchTickers = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const { data } = await axiosInstance.get('/market/tickers', {
          headers: { 'Cache-Control': 'no-cache' },
          params: { _t: Date.now() },
        });
        setTickers(data);
        setLastUpdated(new Date());
        setError(false);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
        inFlight.current = false;
      }
    };

    fetchTickers();
    const poll = setInterval(fetchTickers, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  const displayItems = tickers.length > 0 ? [...tickers, ...tickers] : [];
  const secondsAgo = lastUpdated
    ? Math.max(0, Math.floor((now - lastUpdated.getTime()) / 1000))
    : null;

  return (
    <section className="mb-4 rounded-lg border border-gray-700 bg-gray-800 overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <h2 className="text-sm font-semibold text-gray-300">Live Market Tickers</h2>
        </div>
        {secondsAgo != null && !error && (
          <span className="text-[11px] text-gray-500">
            Updated {secondsAgo === 0 ? 'just now' : `${secondsAgo}s ago`}
          </span>
        )}
      </div>

      <div className="overflow-hidden py-2.5">
        {loading && (
          <p className="text-xs text-gray-500 px-4">Loading market data…</p>
        )}
        {!loading && error && tickers.length === 0 && (
          <p className="text-xs text-red-400 px-4">Unable to load market data. Please refresh.</p>
        )}
        {!loading && tickers.length > 0 && (
          <div className="ticker-marquee flex w-max">
            {displayItems.map((ticker, index) => {
              const isUp = ticker.change >= 0;
              return (
                <div
                  key={`${ticker.label}-${index}`}
                  className="flex items-center gap-2 px-6 text-sm shrink-0 border-r border-gray-700 last:border-r-0"
                >
                  <span className="font-semibold text-gray-200">{ticker.label}</span>
                  <span className="text-white font-medium tabular-nums">{formatPrice(ticker.price)}</span>
                  <span className={`tabular-nums ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isUp ? '+' : ''}
                    {ticker.change.toFixed(2)} ({isUp ? '+' : ''}
                    {ticker.changePercent.toFixed(2)}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default LiveMarketTickers;
