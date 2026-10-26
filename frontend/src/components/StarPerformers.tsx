import { useEffect, useState } from 'react';
import axiosInstance from '../utils/axiosConfig';

type Performer = {
  id: string;
  name: string;
  sales: number;
  rank: number;
};

const RANK_BADGE = ['🥇', '🥈', '🥉', '4', '5'];

const formatSales = (value: number) =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 0 });

function StarPerformers() {
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchPerformers = async () => {
      try {
        const { data } = await axiosInstance.get('/leads/star-performers');
        setPerformers(data.performers || []);
        setError(false);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPerformers();
    const interval = setInterval(fetchPerformers, 60000);
    return () => clearInterval(interval);
  }, []);

  const displayItems =
    performers.length > 0 ? [...performers, ...performers] : [];

  return (
    <section className="mb-4 rounded-lg border border-gray-700 bg-gray-800 overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-700 flex items-center gap-2">
        <span className="text-amber-400">⭐</span>
        <h2 className="text-sm font-semibold text-gray-300">Star Performers</h2>
        <span className="text-[11px] text-gray-500">Top 5 RMs · this month</span>
      </div>

      <div className="overflow-hidden py-2.5">
        {loading && (
          <p className="text-xs text-gray-500 px-4">Loading star performers…</p>
        )}
        {!loading && error && (
          <p className="text-xs text-red-400 px-4">Unable to load star performers. Please refresh.</p>
        )}
        {!loading && !error && performers.length === 0 && (
          <p className="text-xs text-gray-500 px-4">No RM sales recorded this month.</p>
        )}
        {!loading && !error && performers.length > 0 && (
          <div className="ticker-marquee flex w-max">
            {displayItems.map((rm, index) => (
              <div
                key={`${rm.id}-${index}`}
                className="flex items-center gap-2 px-6 text-sm shrink-0 border-r border-gray-700 last:border-r-0"
              >
                <span className="w-6 text-center text-amber-300 font-semibold">
                  {RANK_BADGE[rm.rank - 1] || rm.rank}
                </span>
                <span className="font-semibold text-gray-200">{rm.name}</span>
                <span className="text-amber-300 font-medium">₹{formatSales(rm.sales)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default StarPerformers;
