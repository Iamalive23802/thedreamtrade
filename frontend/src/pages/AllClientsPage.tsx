import { useEffect, useMemo, useState } from 'react';
import { Info, Pencil, Copy, Trash2 } from 'lucide-react';
import moment from 'moment';
import { useLeadStore, type Lead } from '../stores/leadStore';
import { useAuthStore } from '../stores/authStore';
import ClientDetailsModal from '../components/modals/ClientDetailsModal';
import Modal from '../components/modals/Modal';
import ConfirmModal from '../components/modals/ConfirmModal';
import ColumnHeaderFilter from '../components/ColumnHeaderFilter';
import { parsePaymentHistory, PAYMENT_LIMIT, capPaymentTotal } from '../utils/payment';
import { useToastStore } from '../stores/toastStore';
import MetaDateRangePicker, { type DatePreset } from '../components/MetaDateRangePicker';
import PageHeader from '../components/PageHeader';

const CLIENT_STATUSES = new Set(['Paid Client', 'Won']);

const filterInputClass =
  'form-input bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1 w-full';

const AllClientsPage = () => {
  const { paidClients, fetchPaidClients, deleteLead } = useLeadStore();
  const { role, userId } = useAuthStore();
  const addToast = useToastStore((state) => state.addToast);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [infoLead, setInfoLead] = useState<Lead | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>('weekly');
  const [customFrom, setCustomFrom] = useState(() =>
    moment().subtract(6, 'days').format('YYYY-MM-DD')
  );
  const [customTo, setCustomTo] = useState(() => moment().format('YYYY-MM-DD'));

  const [customerIdFilter, setCustomerIdFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [rmFilter, setRmFilter] = useState('');

  const isAdmin = role === 'admin';
  const isSuperAdmin = role === 'super_admin';
  const isRM = role === 'relationship_mgr' || role === 'financial_manager';
  const isTeamLeader = role === 'team_leader';
  const shouldMaskPhone = isRM || isTeamLeader;
  const maskPhoneNumber = (phone?: string) => {
    if (!phone) return '—';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length <= 4) return '*'.repeat(Math.max(digits.length, 1));
    return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
  };

  useEffect(() => {
    fetchPaidClients();
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

  const baseClientRows = useMemo(() => {
    return paidClients
      .filter((lead) => {
        if (!CLIENT_STATUSES.has(lead.status)) return false;
        if (role === 'relationship_mgr') {
          return lead.assigned_to === userId;
        }
        return true;
      })
      .map((lead) => {
        const history = parsePaymentHistory(lead.paymentHistory);
        const paymentsInRange = history.filter(
          (entry) =>
            entry.date &&
            moment(entry.date).isBetween(dateRange.from, dateRange.to, 'day', '[]')
        );
        const totalPaid = history.reduce(
          (sum, entry) => sum + (entry.approved ? Number(entry.amount || 0) : 0),
          0
        );
        const periodPaid = paymentsInRange.reduce(
          (sum, entry) => sum + (entry.approved ? Number(entry.amount || 0) : 0),
          0
        );
        const displayTotalPaid = capPaymentTotal(totalPaid);
        const remaining = Math.max(PAYMENT_LIMIT - totalPaid, 0);
        // Bar fills as payments come in (used %), capped at 100% once limit hit
        const limitUsedPercent = Math.min(
          100,
          Math.max(0, (displayTotalPaid / PAYMENT_LIMIT) * 100)
        );
        const latestPaymentDate = history.reduce((latest, entry) => {
          if (!entry.date) return latest;
          const t = new Date(entry.date).getTime();
          return Number.isNaN(t) ? latest : Math.max(latest, t);
        }, 0);
        return {
          lead,
          totalPaid,
          displayTotalPaid,
          periodPaid,
          remaining,
          limitUsedPercent,
          latestPaymentDate,
        };
      })
      .sort((a, b) => {
        // Prefer full ID string (DT26270507); fallback to trailing sequence
        const cidKey = (v: string | number | null | undefined) => {
          if (v == null || v === '') return '';
          return String(v);
        };
        const cidSeq = (v: string | number | null | undefined) => {
          if (v == null || v === '') return -1;
          const m = String(v).match(/(\d{4})$/);
          return m ? Number(m[1]) : -1;
        };
        const keyA = cidKey(a.lead.customerId);
        const keyB = cidKey(b.lead.customerId);
        if (keyA !== keyB) return keyB.localeCompare(keyA);
        const idA = cidSeq(a.lead.customerId);
        const idB = cidSeq(b.lead.customerId);
        if (idB !== idA) return idB - idA;
        if (b.latestPaymentDate !== a.latestPaymentDate) {
          return b.latestPaymentDate - a.latestPaymentDate;
        }
        return (a.lead.fullName || '').localeCompare(b.lead.fullName || '');
      });
  }, [paidClients, role, userId, dateRange]);

  const rmOptions = useMemo(() => {
    const names = new Set<string>();
    baseClientRows.forEach(({ lead }) => {
      if (lead.assigned_user_name) names.add(lead.assigned_user_name);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [baseClientRows]);

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    baseClientRows.forEach(({ lead }) => {
      (lead.tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((t) => tags.add(t));
    });
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [baseClientRows]);

  const hasColumnFilters = Boolean(
    customerIdFilter || clientFilter || phoneFilter || tagFilter || rmFilter
  );

  const clientRows = useMemo(() => {
    const cidQ = customerIdFilter.trim().toLowerCase().replace(/^#/, '');
    const clientQ = clientFilter.trim().toLowerCase();
    const phoneQ = phoneFilter.replace(/\D/g, '');
    const tagQ = tagFilter.trim().toLowerCase();

    return baseClientRows.filter(({ lead }) => {
      if (
        cidQ &&
        !(lead.customerId != null && String(lead.customerId).toLowerCase().includes(cidQ))
      ) {
        return false;
      }
      if (clientQ && !(lead.fullName || '').toLowerCase().includes(clientQ)) return false;
      if (
        phoneQ &&
        !(lead.phone || '').replace(/\D/g, '').includes(phoneQ)
      ) {
        return false;
      }
      if (tagQ) {
        const leadTags = (lead.tags || '')
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);
        if (!leadTags.some((t) => t === tagQ || t.includes(tagQ))) return false;
      }
      if (rmFilter && (lead.assigned_user_name || '') !== rmFilter) return false;
      return true;
    });
  }, [baseClientRows, customerIdFilter, clientFilter, phoneFilter, tagFilter, rmFilter]);

  const handleDeleteLead = (leadId: string) => {
    setLeadToDelete(leadId);
  };

  const confirmDelete = () => {
    if (leadToDelete) {
      deleteLead(leadToDelete);
      setLeadToDelete(null);
    }
  };

  const barColor = (percentUsed: number) => {
    if (percentUsed >= 80) return 'bg-red-500';
    if (percentUsed >= 50) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        description={
          <>
            Period paid for {periodLabel} · {clientRows.length.toLocaleString('en-IN')} clients
            {' · '}Payment limit per client: ₹{PAYMENT_LIMIT.toLocaleString('en-IN')}
          </>
        }
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

      {clientRows.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-sm text-gray-400">
          {hasColumnFilters
            ? 'No clients match the column filters.'
            : 'No paid clients found.'}
        </p>
      ) : (
        <div className="table-panel max-h-[80vh] overflow-auto">
          <table className="min-w-full text-sm text-left text-gray-300">
            <thead className="sticky top-0 z-10 bg-shell text-xs uppercase text-gray-400">
              <tr>
                <ColumnHeaderFilter
                  label="Customer ID"
                  value={customerIdFilter}
                  onClear={() => setCustomerIdFilter('')}
                >
                  <input
                    type="text"
                    className={filterInputClass}
                    placeholder="e.g. DT26270507"
                    value={customerIdFilter}
                    onChange={(e) => setCustomerIdFilter(e.target.value)}
                    autoFocus
                  />
                </ColumnHeaderFilter>
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
                <ColumnHeaderFilter
                  label="Lead Tag"
                  value={tagFilter}
                  onClear={() => setTagFilter('')}
                >
                  <select
                    className={filterInputClass}
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    {tagOptions.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </ColumnHeaderFilter>
                <ColumnHeaderFilter
                  label="Relationship Manager"
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
                <th className="p-3">Period Paid (₹)</th>
                <th className="p-3">Total Paid (₹)</th>
                <th className="p-3 min-w-[220px]">Limit Left</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {clientRows.map(({ lead, totalPaid, displayTotalPaid, periodPaid, remaining, limitUsedPercent }) => (
                <tr key={lead.id} className="hover:bg-surface-hover">
                  <td className="p-3 font-semibold text-amber-300">
                    {lead.customerId != null && lead.customerId !== ''
                      ? String(lead.customerId)
                      : '—'}
                  </td>
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
                          className="text-gray-400 hover:text-gray-200 flex-shrink-0 ml-1"
                          title="Copy Phone"
                          type="button"
                        >
                          <Copy size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    {lead.tags && lead.tags.trim() !== '' ? (
                      lead.tags.split(',').map((tag, index) => (
                        <span
                          key={`${lead.id}-tag-${index}`}
                          className="inline-block px-2 py-0.5 text-xs rounded-full bg-violet-500/15 text-violet-300 mr-1 mb-1"
                        >
                          {tag.trim()}
                        </span>
                      ))
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-3 text-green-400">{lead.assigned_user_name || '—'}</td>
                  <td className="p-3 font-medium text-amber-300">
                    {periodPaid > 0 ? periodPaid.toLocaleString('en-IN') : '0'}
                  </td>
                  <td className="p-3 font-medium">
                    {displayTotalPaid > 0 ? displayTotalPaid.toLocaleString('en-IN') : '0'}
                    {totalPaid > PAYMENT_LIMIT && (
                      <span className="block text-[10px] text-red-400 font-normal">Completed</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>
                          {remaining <= 0
                            ? 'Completed'
                            : `₹${remaining.toLocaleString('en-IN')} left`}
                        </span>
                        <span className="font-semibold text-gray-200">
                          {limitUsedPercent.toFixed(1)}% filled
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-gray-900 rounded-full overflow-hidden border border-gray-600">
                        <div
                          className={`h-full rounded-full transition-all ${barColor(limitUsedPercent)}`}
                          style={{ width: `${limitUsedPercent}%` }}
                          title={`₹${displayTotalPaid.toLocaleString('en-IN')} of ₹${PAYMENT_LIMIT.toLocaleString('en-IN')} used (${limitUsedPercent.toFixed(1)}%)`}
                        />
                      </div>
                    </div>
                  </td>
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
                    {(isAdmin || isSuperAdmin) && (
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
              ))}
            </tbody>
          </table>
        </div>
      )}
      {infoLead && (
        <Modal isOpen={true} onClose={() => setInfoLead(null)} title="Client Information">
          <div className="space-y-2 text-gray-200">
            <p>
              <strong>Customer ID:</strong>{' '}
              {infoLead.customerId != null && infoLead.customerId !== ''
                ? String(infoLead.customerId)
                : '—'}
            </p>
            <p><strong>Full Name:</strong> {infoLead.fullName}</p>
            <p><strong>Email:</strong> {infoLead.email}</p>
            <p><strong>Phone:</strong> {infoLead.phone || '—'}</p>
            <p><strong>Lead Tag:</strong> {infoLead.tags?.trim() || '—'}</p>
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

export default AllClientsPage;
