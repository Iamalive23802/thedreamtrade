import { useEffect, useMemo, useState } from 'react';
import { Info, Pencil, Trash2, Copy } from 'lucide-react';
import { useLeadStore, Lead } from '../stores/leadStore';
import { useAuthStore } from '../stores/authStore';
import { useTeamStore } from '../stores/teamStore';
import ClientDetailsModal from '../components/modals/ClientDetailsModal';
import Modal from '../components/modals/Modal';
import ConfirmModal from '../components/modals/ConfirmModal';
import { parsePaymentHistory } from '../utils/payment';
import { useToastStore } from '../stores/toastStore';

const ClientsPage = () => {
  const { leads, fetchLeads, deleteLead } = useLeadStore();
  const { role, userId } = useAuthStore();
  const { teams, fetchTeams } = useTeamStore();
  const addToast = useToastStore((state) => state.addToast);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [infoLead, setInfoLead] = useState<Lead | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);

  const isAdmin = role === 'admin';
  const isSuperAdmin = role === 'super_admin';
  const isTeamLeader = role === 'team_leader';
  const isRM = role === 'relationship_mgr' || role === 'financial_manager';
  const shouldMaskPhone = isRM || isTeamLeader;

  useEffect(() => {
    fetchLeads();
    fetchTeams();
  }, []);

  const wonLeads = leads.filter((lead) => {
    if (lead.status !== 'Won' && lead.status !== 'Paid Client') return false;
    if (role === 'relationship_mgr') {
      return lead.assigned_to === userId;
    }
    if (role === 'financial_manager') {
      const payments = parsePaymentHistory(lead.paymentHistory);
      return payments.some((p) => !p.approved);
    }
    return true;
  });

  const paymentRows = useMemo(() => {
    return wonLeads.flatMap((lead) => {
      const history = parsePaymentHistory(lead.paymentHistory)
        .slice()
        .reverse(); // newest first

      if (history.length === 0) {
        return [
          {
            key: `${lead.id}-empty`,
            lead,
            payment: null,
          },
        ];
      }

      return history.map((entry, idx) => ({
        key: `${lead.id}-${idx}`,
        lead,
        payment: entry,
      }));
    });
  }, [wonLeads]);

  const getWonDate = (lead: Lead) => {
    if (lead.wonOn) return lead.wonOn;
    if (!lead.notes) return '';
    const entries = lead.notes.split('|||').map((e) => e.split('__'));
    for (let i = entries.length - 1; i >= 0; i--) {
      if ((entries[i][1] === 'Won' || entries[i][1] === 'Paid Client') && entries[i][2]) return entries[i][2];
    }
    return '';
  };

  const getTeamName = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    return team ? team.name : '—';
  };

  const renderStatus = (entry: ReturnType<typeof parsePaymentHistory>[number] | null) => {
    if (!entry) {
      return <span className="text-gray-400">No payments yet</span>;
    }

    if (entry.approved) {
      return (
        <div className="flex flex-col">
          <span className="text-emerald-400 font-semibold">Approved</span>
          <span className="text-xs text-gray-300">
            {entry.utr ? `UTR: ${entry.utr}` : 'UTR pending'}
          </span>
        </div>
      );
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
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-3xl font-bold text-white mb-6">
        {role === 'financial_manager'
          ? '🎉 Clients Awaiting Approval'
          : '🎉 Clients (Won Leads)'}
      </h1>

      {paymentRows.length === 0 ? (
        <p className="text-gray-400">
          {role === 'financial_manager'
            ? 'No payments are awaiting approval.'
            : 'No leads have been marked as "Won" yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto bg-gray-800 rounded-lg border border-gray-700 max-h-[80vh]">
          <table className="min-w-full text-sm text-left text-gray-300">
            <thead className="bg-gray-700 text-xs uppercase text-gray-400 sticky top-0">
              <tr>
                <th className="p-3">Client</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Date</th>
                <th className="p-3">Amount (₹)</th>
                <th className="p-3">RM</th>
                <th className="p-3">Team</th>
                <th className="p-3">Package</th>
                <th className="p-3">UTR / Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {paymentRows.map(({ key, lead, payment }) => (
                <tr key={key} className="hover:bg-gray-700">
                  <td className="p-3 font-medium text-blue-300">{lead.fullName}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <span>
                        {shouldMaskPhone
                          ? lead.phone
                            ? `${lead.phone.slice(0, 2)}******`
                            : '—'
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
                  <td className="p-3">
                    {getWonDate(lead)
                      ? new Date(getWonDate(lead)).toLocaleDateString('en-GB')
                      : '—'}
                  </td>
                  <td className="p-3">
                    {payment ? Number(payment.amount || 0).toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="p-3 text-green-400">
                    {payment?.assigned_to_name || lead.assigned_user_name || '—'}
                  </td>
                  <td className="p-3">{getTeamName(lead.team_id)}</td>
                  <td className="p-3">{payment?.packageTier || '—'}</td>
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
              ))}
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
