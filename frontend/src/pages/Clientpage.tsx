import { useEffect, useMemo, useState } from 'react';
import { Info, Pencil, Trash2, Copy } from 'lucide-react';
import moment from 'moment';
import { useLeadStore, Lead } from '../stores/leadStore';
import { useAuthStore } from '../stores/authStore';
import { useTeamStore } from '../stores/teamStore';
import ClientDetailsModal from '../components/modals/ClientDetailsModal';
import Modal from '../components/modals/Modal';
import ConfirmModal from '../components/modals/ConfirmModal';
import ColumnHeaderFilter from '../components/ColumnHeaderFilter';
import { parsePaymentHistory, PaymentEntry } from '../utils/payment';
import { useToastStore } from '../stores/toastStore';
import MetaDateRangePicker, { type DatePreset } from '../components/MetaDateRangePicker';
import PageHeader from '../components/PageHeader';

const filterInputClass =
  'form-input bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1 w-full';

const ClientsPage = () => {
  const { paidClients, fetchPaidClients, deleteLead } = useLeadStore();
  const { role, userId } = useAuthStore();
  const { teams, fetchTeams } = useTeamStore();
  const addToast = useToastStore((state) => state.addToast);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [infoLead, setInfoLead] = useState<Lead | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>('weekly');
  const [customFrom, setCustomFrom] = useState(() =>
    moment().subtract(6, 'days').format('YYYY-MM-DD')
  );
  const [customTo, setCustomTo] = useState(() => moment().format('YYYY-MM-DD'));

  const [clientFilter, setClientFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [amountFilter, setAmountFilter] = useState('');
  const [rmFilter, setRmFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [packageFilter, setPackageFilter] = useState('');
  const [utrFilter, setUtrFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const isSuperAdmin = role === 'super_admin';
  const isTeamLeader = role === 'team_leader';
  const isRM = role === 'relationship_mgr' || role === 'financial_manager';
  const shouldMaskPhone = isRM || isTeamLeader;
  const maskPhoneNumber = (phone?: string) => {
    if (!phone) return '—';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length <= 4) return '*'.repeat(Math.max(digits.length, 1));
    return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
  };

  useEffect(() => {
    fetchPaidClients();
    fetchTeams();
  }, []);

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

  const periodLabel = useMemo(() => {
    const fromLabel = dateRange.from.format('DD MMM YYYY');
    const toLabel = dateRange.to.format('DD MMM YYYY');
    if (datePreset === 'daily') return `Today · ${toLabel}`;
    if (datePreset === 'weekly') return `Last 7 days · ${fromLabel} – ${toLabel}`;
    if (datePreset === 'monthly') return `Last 30 days · ${fromLabel} – ${toLabel}`;
    if (datePreset === 'all') return 'All time · every payment';
    return `Custom · ${fromLabel} – ${toLabel}`;
  }, [datePreset, dateRange]);

  const getRmName = (lead: Lead, payment: PaymentEntry) =>
    payment.rm1_name ||
    payment.assigned_to_name ||
    lead.assigned_user_name ||
    '—';

  const getTeamName = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    return team ? team.name : '—';
  };

  const basePaymentRows = useMemo(() => {
    const rows: {
      key: string;
      lead: Lead;
      payment: PaymentEntry;
      paymentIndex: number;
      rmName: string;
      teamName: string;
    }[] = [];

    paidClients.forEach((lead) => {
      if (lead.status !== 'Paid Client' && lead.status !== 'Won') return;
      if (role === 'relationship_mgr' && lead.assigned_to !== userId) return;

      const history = parsePaymentHistory(lead.paymentHistory);
      history.forEach((payment, paymentIndex) => {
        if (role === 'financial_manager' && payment.approved) return;
        if (datePreset !== 'all') {
          if (
            !payment.date ||
            !moment(payment.date).isBetween(dateRange.from, dateRange.to, 'day', '[]')
          ) {
            return;
          }
        }
        rows.push({
          key: `${lead.id}-${paymentIndex}-${payment.date}-${payment.utr}`,
          lead,
          payment,
          paymentIndex,
          rmName: getRmName(lead, payment),
          teamName: getTeamName(lead.team_id),
        });
      });
    });

    return rows.sort((a, b) => {
      const timeA = new Date(a.payment.date || 0).getTime();
      const timeB = new Date(b.payment.date || 0).getTime();
      return timeB - timeA;
    });
  }, [paidClients, role, userId, dateRange, datePreset, teams]);

  const rmOptions = useMemo(() => {
    const names = new Set<string>();
    basePaymentRows.forEach((row) => {
      if (row.rmName && row.rmName !== '—') names.add(row.rmName);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [basePaymentRows]);

  const teamOptions = useMemo(() => {
    const names = new Set<string>();
    basePaymentRows.forEach((row) => {
      if (row.teamName && row.teamName !== '—') names.add(row.teamName);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [basePaymentRows]);

  const packageOptions = useMemo(() => {
    const pkgs = new Set<string>();
    basePaymentRows.forEach((row) => {
      if (row.payment.packageTier) pkgs.add(row.payment.packageTier);
    });
    return [...pkgs].sort((a, b) => a.localeCompare(b));
  }, [basePaymentRows]);

  const hasColumnFilters = Boolean(
    clientFilter ||
      phoneFilter ||
      amountFilter ||
      rmFilter ||
      teamFilter ||
      packageFilter ||
      utrFilter ||
      statusFilter
  );

  const paymentRows = useMemo(() => {
    const clientQ = clientFilter.trim().toLowerCase();
    const phoneQ = phoneFilter.replace(/\D/g, '');
    const amountQ = amountFilter.trim().replace(/,/g, '');
    const utrQ = utrFilter.trim().toLowerCase();

    return basePaymentRows.filter(({ lead, payment, rmName, teamName }) => {
      if (clientQ && !(lead.fullName || '').toLowerCase().includes(clientQ)) return false;
      if (
        phoneQ &&
        !(lead.phone || '').replace(/\D/g, '').includes(phoneQ)
      ) {
        return false;
      }
      if (amountQ) {
        const amount = String(Number(payment.amount || 0));
        if (!amount.includes(amountQ) && !String(payment.amount || '').includes(amountQ)) {
          return false;
        }
      }
      if (rmFilter && rmName !== rmFilter) return false;
      if (teamFilter && teamName !== teamFilter) return false;
      if (packageFilter && (payment.packageTier || '') !== packageFilter) return false;
      if (utrQ && !(payment.utr || '').toLowerCase().includes(utrQ)) return false;
      if (statusFilter === 'approved' && !payment.approved) return false;
      if (statusFilter === 'pending' && payment.approved) return false;
      return true;
    });
  }, [
    basePaymentRows,
    clientFilter,
    phoneFilter,
    amountFilter,
    rmFilter,
    teamFilter,
    packageFilter,
    utrFilter,
    statusFilter,
  ]);

  const formatDateTime = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  const renderStatus = (payment: PaymentEntry) => {
    if (payment.approved) {
      return <span className="text-emerald-400 font-semibold">Approved</span>;
    }

    return (
      <div className="flex items-center gap-2 text-yellow-400">
        <svg
          className="w-4 h-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" className="opacity-25" />
          <path d="M12 6v6l3 2" />
        </svg>
        Awaiting Approval
      </div>
    );
  };

  const handleDeleteLead = (leadId: string) => {
    setLeadToDelete(leadId);
  };

  const confirmDelete = () => {
    if (leadToDelete) {
      deleteLead(leadToDelete);
      setLeadToDelete(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={role === 'financial_manager' ? 'Payments Awaiting Approval' : 'Payments'}
        description={`${periodLabel} · ${paymentRows.length.toLocaleString('en-IN')} in view`}
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

      {paymentRows.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-sm text-gray-400">
          {hasColumnFilters
            ? 'No payments match the column filters.'
            : role === 'financial_manager'
              ? 'No payments are awaiting approval in this period.'
              : 'No payments found in this period.'}
        </p>
      ) : (
        <div className="table-panel max-h-[80vh] overflow-auto">
          <table className="min-w-full text-sm text-left text-gray-300">
            <thead className="sticky top-0 z-10 bg-shell text-xs uppercase text-gray-400">
              <tr>
                <ColumnHeaderFilter
                  label="Client"
                  value={clientFilter}
                  onClear={() => setClientFilter('')}
                >
                  <input
                    type="text"
                    className={filterInputClass}
                    placeholder="Search client"
                    value={clientFilter}
                    onChange={(e) => setClientFilter(e.target.value)}
                    autoFocus
                  />
                </ColumnHeaderFilter>
                <ColumnHeaderFilter
                  label="Phone"
                  value={phoneFilter}
                  onClear={() => setPhoneFilter('')}
                >
                  <input
                    type="text"
                    className={filterInputClass}
                    placeholder="Search phone"
                    value={phoneFilter}
                    onChange={(e) => setPhoneFilter(e.target.value)}
                    autoFocus
                  />
                </ColumnHeaderFilter>
                <th className="p-3">Date & Time</th>
                <ColumnHeaderFilter
                  label="Amount (₹)"
                  value={amountFilter}
                  onClear={() => setAmountFilter('')}
                >
                  <input
                    type="text"
                    className={filterInputClass}
                    placeholder="e.g. 5000"
                    value={amountFilter}
                    onChange={(e) => setAmountFilter(e.target.value)}
                    autoFocus
                  />
                </ColumnHeaderFilter>
                <ColumnHeaderFilter
                  label="RM"
                  value={rmFilter}
                  onClear={() => setRmFilter('')}
                >
                  <select
                    className={filterInputClass}
                    value={rmFilter}
                    onChange={(e) => setRmFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    {rmOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </ColumnHeaderFilter>
                <ColumnHeaderFilter
                  label="Team"
                  value={teamFilter}
                  onClear={() => setTeamFilter('')}
                >
                  <select
                    className={filterInputClass}
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    {teamOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </ColumnHeaderFilter>
                <ColumnHeaderFilter
                  label="Package"
                  value={packageFilter}
                  onClear={() => setPackageFilter('')}
                >
                  <select
                    className={filterInputClass}
                    value={packageFilter}
                    onChange={(e) => setPackageFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    {packageOptions.map((pkg) => (
                      <option key={pkg} value={pkg}>
                        {pkg}
                      </option>
                    ))}
                  </select>
                </ColumnHeaderFilter>
                <ColumnHeaderFilter
                  label="UTR"
                  value={utrFilter}
                  onClear={() => setUtrFilter('')}
                >
                  <input
                    type="text"
                    className={filterInputClass}
                    placeholder="Search UTR"
                    value={utrFilter}
                    onChange={(e) => setUtrFilter(e.target.value)}
                    autoFocus
                  />
                </ColumnHeaderFilter>
                <ColumnHeaderFilter
                  label="Status"
                  value={statusFilter}
                  onClear={() => setStatusFilter('')}
                >
                  <select
                    className={filterInputClass}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    <option value="approved">Approved</option>
                    <option value="pending">Awaiting Approval</option>
                  </select>
                </ColumnHeaderFilter>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {paymentRows.map(({ key, lead, payment, rmName, teamName }) => {
                const amount = Number(payment.amount || 0);

                return (
                  <tr key={key} className="hover:bg-surface-hover">
                    <td className="p-3 font-medium text-blue-300">{lead.fullName}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <span>
                          {shouldMaskPhone
                            ? maskPhoneNumber(lead.phone)
                            : lead.phone || '—'}
                        </span>
                        {lead.phone && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(lead.phone);
                              addToast('Phone number copied', 'success');
                            }}
                            className="text-gray-400 hover:text-gray-200 flex-shrink-0"
                            title="Copy Phone"
                          >
                            <Copy size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">{formatDateTime(payment.date)}</td>
                    <td className="p-3 font-medium">
                      {amount > 0 ? amount.toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="p-3 text-green-400">{rmName}</td>
                    <td className="p-3">{teamName}</td>
                    <td className="p-3">{payment.packageTier || '—'}</td>
                    <td className="p-3 font-mono text-xs">{payment.utr || '—'}</td>
                    <td className="p-3">{renderStatus(payment)}</td>
                    <td className="p-3 flex gap-2">
                      <button
                        onClick={() => setInfoLead(lead)}
                        className="text-blue-400 hover:text-blue-300"
                        title="View Client Details"
                      >
                        <Info size={16} />
                      </button>
                      <button
                        onClick={() => setEditLead(lead)}
                        className="text-blue-400 hover:text-blue-300"
                        title="Edit Client"
                      >
                        <Pencil size={16} />
                      </button>
                      {isSuperAdmin && (
                        <button
                          onClick={() => handleDeleteLead(lead.id)}
                          className="text-red-400 hover:text-red-300"
                          title="Delete Client"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {infoLead && (
        <Modal isOpen={true} onClose={() => setInfoLead(null)} title="Client Information">
          <div className="space-y-2 text-gray-200">
            <p><strong>Full Name:</strong> {infoLead.fullName}</p>
            <p><strong>Email:</strong> {infoLead.email}</p>
            <p><strong>Phone:</strong> {infoLead.phone || '—'}</p>
            <p><strong>Relationship Manager:</strong> {infoLead.assigned_user_name || '—'}</p>
            <p><strong>Gender:</strong> {infoLead.gender || '—'}</p>
            <p><strong>DOB:</strong> {infoLead.dob || '—'}</p>
            <p><strong>PAN Card No:</strong> {infoLead.panCardNumber || '—'}</p>
            <p><strong>Aadhar Card No:</strong> {infoLead.aadharCardNumber || '—'}</p>
          </div>
        </Modal>
      )}
      {editLead && (
        <ClientDetailsModal
          isOpen={true}
          onClose={() => setEditLead(null)}
          lead={editLead}
        />
      )}
      {leadToDelete && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setLeadToDelete(null)}
          onConfirm={confirmDelete}
          message="Are you sure you want to delete this client? This action cannot be undone."
        />
      )}
    </div>
  );
};

export default ClientsPage;
