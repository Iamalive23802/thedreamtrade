import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Megaphone,
  TrendingUp,
  Target,
  AlertTriangle,
  Users,
  IndianRupee,
  FlaskConical,
  Flame,
  Ban,
} from 'lucide-react';
import moment from 'moment';
import { useAuthStore } from '../stores/authStore';
import { useUserStore } from '../stores/userStore';
import { useLeadStore } from '../stores/leadStore';
import { useTeamStore } from '../stores/teamStore';
import { parsePaymentHistory } from '../utils/payment';
import MetaDateRangePicker, { type DatePreset } from '../components/MetaDateRangePicker';
import PageHeader from '../components/PageHeader';

const PAID = new Set(['Paid Client', 'Won']);
const FREE_TRIAL = new Set(['Free Trial', 'Free Trial – Follow Up']);
const HOT = new Set([
  'Promise To Pay',
  'Call Back With Presentation',
  'Follow Up',
  'Counselling Call',
  'Summarization Call',
]);
const CONTACT_ISSUE = new Set([
  'Ringing',
  'Busy',
  'Switched Off',
  'Disconnected Call',
  'Call Disconnected',
  'Not Reachable',
  'Out Of Service',
  'Incoming Calls Not Allowed',
  'Not Connected',
  'No Response',
  'Follow Up-No Response',
  'Follow Up (No Response)',
]);
const BAD_TRAFFIC = new Set(['Invalid Number', 'Wrong No']);
const WRONG_AUDIENCE = new Set(['Non Trader', 'Language Barrier']);
const LOW_INTENT = new Set(['Not Interested', 'Do Not disturb']);
const LOW_CAPABILITY = new Set(['No Capital', 'Less Funds', 'Low Capital', 'No DMAT', 'Loss Client']);

function normalizeChannel(source?: string): string {
  const raw = (source || '').trim();
  if (!raw) return 'Unknown';
  const s = raw.toLowerCase();
  if (
    s.includes('facebook') ||
    s.includes('faceook') ||
    s.startsWith('fb-') ||
    s === 'meta' ||
    s.includes('mh - facebook') ||
    s.includes('mh-facebook')
  ) {
    return 'Facebook';
  }
  if (s.includes('interakt')) return 'Interakt';
  if (s.includes('groww')) return 'Groww';
  if (s.includes('angel')) return 'Angel One';
  if (s.includes('zerodha')) return 'Zerodha';
  if (s === 'web' || s.includes('website')) return 'Web';
  return raw;
}

function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

const Dashboard = () => {
  const { role, userId } = useAuthStore();
  const { users } = useUserStore();
  const { leads } = useLeadStore();
  const { teams } = useTeamStore();
  const [datePreset, setDatePreset] = useState<DatePreset>('weekly');
  const [customFrom, setCustomFrom] = useState(() =>
    moment().subtract(6, 'days').format('YYYY-MM-DD')
  );
  const [customTo, setCustomTo] = useState(() => moment().format('YYYY-MM-DD'));

  useEffect(() => {
    useUserStore.getState().fetchUsers();
    useLeadStore.getState().fetchLeads();
    useTeamStore.getState().fetchTeams();
  }, []);

  const currentUser = users.find((u) => u.id === userId);
  const teamId = currentUser?.team_id;
  const isOpsLeader = role === 'super_admin' || role === 'admin' || role === 'team_leader';

  const dateRange = useMemo(() => {
    const today = moment().endOf('day');
    if (datePreset === 'daily') {
      return { from: moment().startOf('day'), to: today };
    }
    if (datePreset === 'weekly') {
      return { from: moment().subtract(6, 'days').startOf('day'), to: today };
    }
    if (datePreset === 'monthly') {
      return { from: moment().subtract(29, 'days').startOf('day'), to: today };
    }
    if (datePreset === 'all') {
      return { from: moment('2000-01-01').startOf('day'), to: today };
    }
    const from = moment(customFrom || undefined).startOf('day');
    const to = moment(customTo || undefined).endOf('day');
    if (!from.isValid() || !to.isValid()) {
      return { from: moment().subtract(6, 'days').startOf('day'), to: today };
    }
    return from.isAfter(to)
      ? { from: to.clone().startOf('day'), to: from.clone().endOf('day') }
      : { from, to };
  }, [datePreset, customFrom, customTo]);

  const scopedLeads = useMemo(() => {
    if (role === 'team_leader') return leads.filter((l) => l.team_id === teamId);
    if (role === 'relationship_mgr' || role === 'financial_manager') {
      return leads.filter((l) => l.assigned_to === userId);
    }
    return leads;
  }, [leads, role, teamId, userId]);

  const periodLeads = useMemo(() => {
    return scopedLeads.filter(
      (l) =>
        l.date &&
        moment(l.date).isBetween(dateRange.from, dateRange.to, 'day', '[]')
    );
  }, [scopedLeads, dateRange]);

  const metrics = useMemo(() => {
    const total = periodLeads.length;
    const paid = periodLeads.filter((l) => PAID.has(l.status)).length;
    const freeTrials = periodLeads.filter((l) => FREE_TRIAL.has(l.status)).length;
    const hot = periodLeads.filter((l) => HOT.has(l.status)).length;
    const contactIssues = periodLeads.filter((l) => CONTACT_ISSUE.has(l.status)).length;
    const badTraffic = periodLeads.filter((l) => BAD_TRAFFIC.has(l.status)).length;
    const wrongAudience = periodLeads.filter((l) => WRONG_AUDIENCE.has(l.status)).length;
    const lowIntent = periodLeads.filter((l) => LOW_INTENT.has(l.status)).length;
    const lowCapability = periodLeads.filter((l) => LOW_CAPABILITY.has(l.status)).length;
    const fresh = periodLeads.filter((l) => l.status === 'New').length;
    const worked = total - fresh;
    const sales = periodLeads.reduce((sum, lead) => {
      if (!PAID.has(lead.status) || !lead.paymentHistory) return sum;
      return (
        sum +
        parsePaymentHistory(lead.paymentHistory).reduce(
          (s, ph) => s + (ph.approved ? parseFloat(ph.amount || '0') : 0),
          0
        )
      );
    }, 0);

    return {
      total,
      paid,
      freeTrials,
      hot,
      contactIssues,
      badTraffic,
      wrongAudience,
      lowIntent,
      lowCapability,
      fresh,
      worked,
      sales,
      ftRate: pct(freeTrials, total),
      paidRate: pct(paid, total),
      wasteRate: pct(badTraffic + wrongAudience + lowIntent + lowCapability, total),
      contactIssueRate: pct(contactIssues, total),
    };
  }, [periodLeads]);

  const funnel = useMemo(() => {
    const stages = [
      { key: 'leads', label: 'Leads in', count: metrics.total, hint: 'All acquired' },
      {
        key: 'reachable',
        label: 'Reachable',
        count: metrics.total - metrics.contactIssues - metrics.badTraffic,
        hint: 'Excl. unreachable + invalid',
      },
      {
        key: 'ft',
        label: 'Free Trial',
        count: metrics.freeTrials,
        hint: 'Qualified interest',
      },
      { key: 'hot', label: 'Hot pipeline', count: metrics.hot, hint: 'PTP / Follow-up / CB+' },
      { key: 'paid', label: 'Paid clients', count: metrics.paid, hint: 'Converted' },
    ];
    const max = Math.max(...stages.map((s) => s.count), 1);
    return stages.map((s) => ({ ...s, width: Math.max(6, Math.round((s.count / max) * 100)) }));
  }, [metrics]);

  const channels = useMemo(() => {
    const map = new Map<
      string,
      { leads: number; ft: number; paid: number; hot: number; waste: number; contact: number }
    >();
    for (const lead of periodLeads) {
      const channel = normalizeChannel(lead.source);
      const row = map.get(channel) || { leads: 0, ft: 0, paid: 0, hot: 0, waste: 0, contact: 0 };
      row.leads += 1;
      if (FREE_TRIAL.has(lead.status)) row.ft += 1;
      if (PAID.has(lead.status)) row.paid += 1;
      if (HOT.has(lead.status)) row.hot += 1;
      if (
        BAD_TRAFFIC.has(lead.status) ||
        WRONG_AUDIENCE.has(lead.status) ||
        LOW_INTENT.has(lead.status) ||
        LOW_CAPABILITY.has(lead.status)
      ) {
        row.waste += 1;
      }
      if (CONTACT_ISSUE.has(lead.status)) row.contact += 1;
      map.set(channel, row);
    }
    return Array.from(map.entries())
      .map(([name, row]) => ({
        name,
        ...row,
        ftRate: pct(row.ft, row.leads),
        paidRate: pct(row.paid, row.leads),
        wasteRate: pct(row.waste, row.leads),
      }))
      .sort((a, b) => b.leads - a.leads);
  }, [periodLeads]);

  const qualityBreakdown = useMemo(
    () => [
      {
        label: 'Invalid / Wrong number',
        count: metrics.badTraffic,
        rate: pct(metrics.badTraffic, metrics.total),
        action: 'Tighten form validation & exclude low-quality placements',
        tone: 'rose',
      },
      {
        label: 'Wrong audience (Non trader / Language)',
        count: metrics.wrongAudience,
        rate: pct(metrics.wrongAudience, metrics.total),
        action: 'Sharpen interest targeting & language geo',
        tone: 'amber',
      },
      {
        label: 'Low intent (Not interested)',
        count: metrics.lowIntent,
        rate: pct(metrics.lowIntent, metrics.total),
        action: 'Test offer angle & creative promise',
        tone: 'orange',
      },
      {
        label: 'Low capability (Capital / DMAT)',
        count: metrics.lowCapability,
        rate: pct(metrics.lowCapability, metrics.total),
        action: 'Raise income / capital filters in ads',
        tone: 'yellow',
      },
      {
        label: 'Contact issues',
        count: metrics.contactIssues,
        rate: metrics.contactIssueRate,
        action: 'Check lead freshness & call windows',
        tone: 'slate',
      },
    ],
    [metrics]
  );

  const weeklyTrend = useMemo(() => {
    const weeks: { label: string; leads: number; ft: number; paid: number }[] = [];
    for (let i = 7; i >= 0; i -= 1) {
      const start = moment().subtract(i, 'weeks').startOf('isoWeek');
      const end = start.clone().endOf('isoWeek');
      const inWeek = scopedLeads.filter(
        (l) => l.date && moment(l.date).isBetween(start, end, 'day', '[]')
      );
      weeks.push({
        label: start.format('DD MMM'),
        leads: inWeek.length,
        ft: inWeek.filter((l) => FREE_TRIAL.has(l.status)).length,
        paid: inWeek.filter((l) => PAID.has(l.status)).length,
      });
    }
    return weeks;
  }, [scopedLeads]);

  const maxWeekLeads = Math.max(...weeklyTrend.map((w) => w.leads), 1);

  const rmSales = useMemo(() => {
    return users
      .filter(
        (u) =>
          (u.role === 'relationship_mgr' || u.role === 'financial_manager') &&
          (role !== 'team_leader' || u.team_id === teamId) &&
          u.status?.toLowerCase() === 'active'
      )
      .map((rm) => {
        const sales = periodLeads
          .filter((l) => PAID.has(l.status))
          .reduce((sum, lead) => {
            if (!lead.paymentHistory) return sum;
            const payments = parsePaymentHistory(lead.paymentHistory).filter((ph) => ph.approved);
            payments.forEach((ph) => {
              const amount = parseFloat(ph.amount || '0');
              if (ph.rm1 && ph.rm2) {
                if (ph.rm1 === rm.id || ph.rm2 === rm.id) sum += amount / 2;
              } else if (ph.rm1 && ph.rm1 === rm.id) sum += amount;
              else if (ph.rm2 && ph.rm2 === rm.id) sum += amount;
              else if (ph.assigned_to && ph.assigned_to === rm.id) sum += amount;
            });
            return sum;
          }, 0);
        const ft = periodLeads.filter(
          (l) => FREE_TRIAL.has(l.status) && l.assigned_to === rm.id
        ).length;
        return { name: rm.displayName, sales, ft };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [users, periodLeads, role, teamId]);

  const topTeams = useMemo(() => {
    const rows = teams.map((team) => {
      const clients = periodLeads.filter(
        (l) => l.team_id === team.id && PAID.has(l.status)
      ).length;
      return { name: team.name, clients };
    });
    const maxClients = Math.max(...rows.map((t) => t.clients), 1);
    return rows
      .sort((a, b) => b.clients - a.clients)
      .slice(0, 5)
      .map((t) => ({ ...t, percent: Math.round((t.clients / maxClients) * 100) }));
  }, [teams, periodLeads]);

  const periodLabel = useMemo(() => {
    const fromLabel = dateRange.from.format('DD MMM YYYY');
    const toLabel = dateRange.to.format('DD MMM YYYY');
    if (datePreset === 'daily') return `Today · ${toLabel}`;
    if (datePreset === 'weekly') return `Last 7 days · ${fromLabel} – ${toLabel}`;
    if (datePreset === 'monthly') return `Last 30 days · ${fromLabel} – ${toLabel}`;
    if (datePreset === 'all') return 'All time';
    return `Custom · ${fromLabel} – ${toLabel}`;
  }, [datePreset, dateRange]);

  return (
    <div>
      <PageHeader
        eyebrow="Growth intelligence"
        title="Ads & Lead Performance"
        description={periodLabel}
        actions={
          <MetaDateRangePicker
            preset={datePreset}
            from={customFrom}
            to={customTo}
            onChange={({ preset, from, to }) => {
              setDatePreset(preset);
              setCustomFrom(from);
              setCustomTo(to);
            }}
          />
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
        <KpiCard
          title="Leads acquired"
          value={metrics.total.toLocaleString('en-IN')}
          sub={periodLabel}
          icon={<Users size={18} />}
          accent="emerald"
        />
        <KpiCard
          title="Free trial rate"
          value={`${metrics.ftRate}%`}
          sub={`${metrics.freeTrials.toLocaleString('en-IN')} free trials`}
          icon={<FlaskConical size={18} />}
          accent="sky"
        />
        <KpiCard
          title="Paid conversion"
          value={`${metrics.paidRate}%`}
          sub={`${metrics.paid.toLocaleString('en-IN')} paid · ${formatInr(metrics.sales)}`}
          icon={<IndianRupee size={18} />}
          accent="amber"
        />
        <KpiCard
          title="Hot pipeline"
          value={metrics.hot.toLocaleString('en-IN')}
          sub="PTP / CB+ / Follow-up"
          icon={<Flame size={18} />}
          accent="orange"
        />
        <KpiCard
          title="Ad waste signal"
          value={`${metrics.wasteRate}%`}
          sub="Bad traffic + wrong audience + low intent"
          icon={<Ban size={18} />}
          accent="rose"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        {/* Funnel */}
        <section className="xl:col-span-1 bg-surface/80 border border-line rounded-xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <Target size={18} className="text-emerald-400" />
            <h2 className="font-semibold">Conversion funnel</h2>
          </div>
          <div className="space-y-4">
            {funnel.map((stage, idx) => (
              <div key={stage.key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300">
                    {idx + 1}. {stage.label}
                  </span>
                  <span className="font-semibold">{stage.count.toLocaleString('en-IN')}</span>
                </div>
                <div className="h-2.5 bg-shell rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${stage.width}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">{stage.hint}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-line grid grid-cols-2 gap-3 text-xs">
            <Link to="/leads?status=Free Trial" className="text-sky-400 hover:underline">
              Open free trials →
            </Link>
            <Link to="/leads?status=Paid Client" className="text-amber-400 hover:underline text-right">
              Open paid clients →
            </Link>
          </div>
        </section>

        {/* Channel table */}
        <section className="xl:col-span-2 bg-surface/80 border border-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Megaphone size={18} className="text-sky-400" />
              <h2 className="font-semibold">Channel performance</h2>
            </div>
            <span className="text-xs text-gray-500">Source → CRM outcome</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-line">
                  <th className="pb-3 pr-3">Channel</th>
                  <th className="pb-3 pr-3">Leads</th>
                  <th className="pb-3 pr-3">FT %</th>
                  <th className="pb-3 pr-3">Paid %</th>
                  <th className="pb-3 pr-3">Hot</th>
                  <th className="pb-3">Waste %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/80">
                {channels.slice(0, 8).map((ch) => (
                  <tr key={ch.name} className="hover:bg-surface-hover">
                    <td className="py-3 pr-3 font-medium">{ch.name}</td>
                    <td className="py-3 pr-3">{ch.leads.toLocaleString('en-IN')}</td>
                    <td className="py-3 pr-3 text-sky-300">{ch.ftRate}%</td>
                    <td className="py-3 pr-3 text-amber-300">{ch.paidRate}%</td>
                    <td className="py-3 pr-3">{ch.hot}</td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          ch.wasteRate >= 30
                            ? 'bg-rose-500/15 text-rose-300'
                            : ch.wasteRate >= 20
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                        }`}
                      >
                        {ch.wasteRate}%
                      </span>
                    </td>
                  </tr>
                ))}
                {channels.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No leads in this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="bg-surface/80 border border-line rounded-xl p-5 mb-8">
        <div className="flex items-center gap-2 mb-5">
          <AlertTriangle size={18} className="text-rose-400" />
          <h2 className="font-semibold">Lead quality leaks</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {qualityBreakdown.map((q) => (
            <div key={q.label} className="rounded-xl bg-shell/60 border border-line/70 px-3 py-3">
              <div className="flex justify-between text-sm mb-1 gap-2">
                <span className="text-gray-300">{q.label}</span>
                <span className="shrink-0">
                  {q.count.toLocaleString('en-IN')} · {q.rate}%
                </span>
              </div>
              <div className="h-2 bg-shell rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full ${
                    q.tone === 'rose'
                      ? 'bg-rose-500'
                      : q.tone === 'amber'
                        ? 'bg-amber-500'
                        : q.tone === 'orange'
                          ? 'bg-orange-500'
                          : q.tone === 'yellow'
                            ? 'bg-yellow-500'
                            : 'bg-slate-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, q.rate * 2))}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500">{q.action}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Weekly trend */}
      <section className="bg-surface/80 border border-line rounded-xl p-5 mb-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-teal-400" />
            <h2 className="font-semibold">Weekly acquisition trend</h2>
          </div>
          <p className="text-xs text-gray-500">Last 8 weeks · leads / free trials / paid</p>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 items-end min-h-[160px]">
          {weeklyTrend.map((w) => (
            <div key={w.label} className="flex flex-col items-center gap-2">
              <div className="w-full flex flex-col justify-end items-center gap-1 h-32">
                <span className="text-[10px] text-amber-300">{w.paid || ''}</span>
                <div
                  className="w-full max-w-[36px] rounded-t bg-emerald-500/80"
                  style={{ height: `${Math.max(4, (w.leads / maxWeekLeads) * 100)}%` }}
                  title={`${w.leads} leads`}
                />
              </div>
              <div className="text-center">
                <p className="text-[11px] text-gray-300">{w.label}</p>
                <p className="text-[10px] text-gray-500">{w.leads} · FT {w.ft}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Ops section retained */}
      {isOpsLeader && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="bg-surface/80 border border-line rounded-xl p-5">
            <h2 className="font-semibold mb-4">Top teams (paid)</h2>
            <div className="space-y-4">
              {topTeams.map((team) => (
                <div key={team.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{team.name}</span>
                    <span className="text-gray-400">{team.clients} clients</span>
                  </div>
                  <div className="w-full bg-shell h-2 rounded-full overflow-hidden">
                    <div
                      className="h-2 bg-sky-500 rounded-full"
                      style={{ width: `${team.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-surface/80 border border-line rounded-xl p-5">
            <h2 className="font-semibold mb-4">RM sales ({periodLabel})</h2>
            <ul className="space-y-3 max-h-56 overflow-y-auto text-sm">
              {rmSales.slice(0, 12).map((rm) => (
                <li key={rm.name} className="flex justify-between gap-3">
                  <span className="truncate">{rm.name}</span>
                  <span className="text-amber-300 shrink-0">{formatInr(rm.sales)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-surface/80 border border-line rounded-xl p-5">
            <h2 className="font-semibold mb-4">RM free trials ({periodLabel})</h2>
            <ul className="space-y-3 max-h-56 overflow-y-auto text-sm">
              {[...rmSales]
                .sort((a, b) => b.ft - a.ft)
                .slice(0, 12)
                .map((rm) => (
                  <li key={rm.name} className="flex justify-between gap-3">
                    <span className="truncate">{rm.name}</span>
                    <span className="text-sky-300 shrink-0">{rm.ft}</span>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
};

function KpiCard({
  title,
  value,
  sub,
  icon,
  accent,
}: {
  title: string;
  value: string;
  sub: string;
  icon: ReactNode;
  accent: 'emerald' | 'sky' | 'amber' | 'orange' | 'rose';
}) {
  const accents = {
    emerald: 'border-emerald-500/30 text-emerald-300',
    sky: 'border-sky-500/30 text-sky-300',
    amber: 'border-amber-500/30 text-amber-300',
    orange: 'border-orange-500/30 text-orange-300',
    rose: 'border-rose-500/30 text-rose-300',
  };
  return (
    <div className={`rounded-xl bg-surface/80 border ${accents[accent]} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wide text-gray-400">{title}</p>
        <span className="opacity-80">{icon}</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  );
}

export default Dashboard;
