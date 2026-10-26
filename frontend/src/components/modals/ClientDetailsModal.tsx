import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import { useLeadStore, Lead } from '../../stores/leadStore';
import { useAuthStore } from '../../stores/authStore';
import { useUserStore } from '../../stores/userStore';
import {
  PaymentEntry,
  PackageTier,
  parsePaymentHistory,
  serializePaymentHistory,
  PAYMENT_LIMIT,
  sumPaymentAmounts,
  capPaymentTotal,
} from '../../utils/payment';
import { useToastStore } from '../../stores/toastStore';

interface ClientDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
}

const ClientDetailsModal: React.FC<ClientDetailsModalProps> = ({ isOpen, onClose, lead }) => {
  const { updateLead } = useLeadStore();
  const { role: rawRole, userId } = useAuthStore();
  const role = (rawRole || '').toLowerCase().trim();
  const { users, fetchUsers } = useUserStore();
  const addToast = useToastStore((s) => s.addToast);

  const [formData, setFormData] = useState({
    fullName: '',
    packageTier: '' as PackageTier,
    gender: '',
    dob: '',
    panCardNumber: '',
    aadharCardNumber: '',
    status: '' as Lead['status'],
  });

  const [paymentHistory, setPaymentHistory] = useState<PaymentEntry[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [dividedPayments, setDividedPayments] = useState<Set<number>>(new Set());
  const [paymentIndexToDelete, setPaymentIndexToDelete] = useState<number | null>(null);
  const packageOptions: PackageTier[] = ['', 'Basic', 'Advanced', 'Premium'];
  const canDeleteSavedPayments = role === 'super_admin' || role === 'financial_manager';
  const canEditClientName = role === 'super_admin' || role === 'financial_manager';
  const canRemoveUnsavedPayment = role === 'super_admin' || role === 'relationship_mgr' || role === 'financial_manager';

  // Get list of active RMs for dropdown
  const relationshipManagers = users.filter(
    u => (u.role === 'relationship_mgr' || u.role === 'financial_manager') && u.status?.toLowerCase() === 'active'
  );

  // Totals toward payment limit (approved + all rows including pending/new)
  const totalApproved = sumPaymentAmounts(paymentHistory, { approvedOnly: true });
  const totalAllPayments = sumPaymentAmounts(paymentHistory);
  const displayApproved = capPaymentTotal(totalApproved);
  const limitReached = totalApproved >= PAYMENT_LIMIT || totalAllPayments >= PAYMENT_LIMIT;
  const remainingLimit = Math.max(PAYMENT_LIMIT - totalAllPayments, 0);

  // Fetch users for RM dropdown
  useEffect(() => {
    fetchUsers();
  }, []);

  // Seed form + history once we get the lead
  useEffect(() => {
    if (lead) {
      const history = parsePaymentHistory(lead.paymentHistory);
      const newestFirst = history.reverse();
      const initialPackage =
        newestFirst.find((entry) => entry.packageTier)?.packageTier || '';

      setFormData({
        fullName: lead.fullName || '',
        packageTier: (initialPackage as PackageTier) || '',
        gender: lead.gender || '',
        dob: lead.dob || '',
        panCardNumber: lead.panCardNumber || '',
        aadharCardNumber: lead.aadharCardNumber || '',
        status: lead.status || '',
      });
      // newest-first in the table
      setPaymentHistory(newestFirst);
      // Set divided state based on existing RM2 values
      const divided = new Set<number>();
      newestFirst.forEach((entry, idx) => {
        if (entry.rm2 && entry.rm2.trim() !== '') {
          divided.add(idx);
        }
      });
      setDividedPayments(divided);
      setIsSaved(false);
    }
  }, [lead]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const calculateAge = (date: string) => {
    if (!date) return '';
    const diff = Date.now() - new Date(date).getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)).toString();
  };

  const handlePaymentChange = (
    index: number,
    field: keyof PaymentEntry,
    value: string | boolean,
  ) => {
    const updated = [...paymentHistory];
    
    // Validate amount field to only allow numeric values
    if (field === 'amount' && typeof value === 'string') {
      // Remove any non-numeric characters except decimal point
      const numericValue = value.replace(/[^0-9.]/g, '');
      // Ensure only one decimal point
      const parts = numericValue.split('.');
      const validValue = parts.length > 2 
        ? parts[0] + '.' + parts.slice(1).join('') 
        : numericValue;
      // Additional validation: ensure it's a valid number format
      if (validValue === '' || /^\d*\.?\d*$/.test(validValue)) {
        const prevAmount = Number(updated[index].amount) || 0;
        const nextAmount = Number(validValue) || 0;
        const othersTotal = sumPaymentAmounts(
          updated.filter((_, i) => i !== index)
        );
        if (othersTotal + nextAmount > PAYMENT_LIMIT && nextAmount > prevAmount) {
          addToast('Completed — payments cannot exceed ₹1,78,000', 'error');
          return;
        }
        (updated[index] as any)[field] = validValue;
      }
    } else {
      (updated[index] as any)[field] = value;
    }
    
    setPaymentHistory(updated);
  };

  const addPaymentRow = (isDivided: boolean = false) => {
    if (limitReached) {
      addToast('Completed — cannot add more payments (₹1,78,000)', 'error');
      return;
    }
    // Auto-populate RM1 with current user if they are an RM
    const currentUserRM = (role === 'relationship_mgr' || role === 'financial_manager') ? userId : '';
    const currentUserRMName = (role === 'relationship_mgr' || role === 'financial_manager') 
      ? users.find(u => u.id === userId)?.displayName || '' 
      : '';
    
    const newPayment = {
      amount: '',
      date: new Date().toISOString(),
      utr: '',
      approved: false,
      assigned_to: lead.assigned_to || '',
      assigned_to_name: lead.assigned_user_name || '',
      rm1: currentUserRM || '',
      rm1_name: currentUserRMName || '',
      rm2: isDivided ? '' : undefined, // Only set rm2 if it's a divided payment
      rm2_name: isDivided ? '' : undefined,
      packageTier: formData.packageTier,
      isNew: true,
    };
    
    setPaymentHistory((prev) => [newPayment, ...prev]);
    
    // If it's a divided payment, add to dividedPayments set
    if (isDivided) {
      setDividedPayments(prev => {
        const shifted = new Set<number>();
        shifted.add(0); // New row is at index 0
        prev.forEach(idx => shifted.add(idx + 1));
        return shifted;
      });
    } else {
      // Shift existing divided payment indices by +1
      setDividedPayments(prev => {
        const shifted = new Set<number>();
        prev.forEach(idx => shifted.add(idx + 1));
        return shifted;
      });
    }
  };

  const canDeletePaymentRow = (entry: PaymentEntry) =>
    entry.isNew ? canRemoveUnsavedPayment : canDeleteSavedPayments;
  const showPaymentDeleteColumn =
    canDeleteSavedPayments || paymentHistory.some((entry) => entry.isNew && canRemoveUnsavedPayment);

  const removePaymentAtIndex = (index: number) => {
    setPaymentHistory((prev) => prev.filter((_, i) => i !== index));
    setDividedPayments((prev) => {
      const next = new Set<number>();
      prev.forEach((idx) => {
        if (idx < index) next.add(idx);
        else if (idx > index) next.add(idx - 1);
      });
      return next;
    });
    setIsSaved(false);
  };

  const handleDeletePaymentClick = (index: number, entry: PaymentEntry) => {
    if (!canDeletePaymentRow(entry)) return;
    if (entry.isNew) {
      removePaymentAtIndex(index);
      return;
    }
    setPaymentIndexToDelete(index);
  };

  const confirmDeletePayment = () => {
    if (paymentIndexToDelete === null) return;
    removePaymentAtIndex(paymentIndexToDelete);
    setPaymentIndexToDelete(null);
  };

  useEffect(() => {
    setPaymentHistory((prev) =>
      prev.map((entry) =>
        entry.isNew ? { ...entry, packageTier: formData.packageTier } : entry
      )
    );
  }, [formData.packageTier]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1) Drop blank new rows  
    // 2) Remove isNew flag  
    // 3) Keep approved=false on those just-added
    const cleaned = paymentHistory
      .filter(entry => !(entry.isNew && entry.amount.trim() === ''))
      .map(entry => {
        const { isNew, ...rest } = entry;
        return {
          ...rest,
          approved: entry.approved && !entry.isNew
        };
      });

    const nextTotal = sumPaymentAmounts(cleaned);
    const existingTotal = sumPaymentAmounts(parsePaymentHistory(lead.paymentHistory));
    if (nextTotal > PAYMENT_LIMIT && nextTotal > existingTotal) {
      addToast('Completed — payments cannot exceed ₹1,78,000', 'error');
      return;
    }

    // 4) oldest-first → serialize → save
    const reversed = [...cleaned].reverse();
    const historyStr = serializePaymentHistory(reversed);

    const nextFullName = canEditClientName
      ? formData.fullName.trim()
      : lead.fullName;

    if (canEditClientName && !nextFullName) {
      return;
    }

    await updateLead(lead.id, {
      ...lead,
      fullName: nextFullName,
      notes: lead.notes,
      gender: formData.gender,
      dob: formData.dob,
      age: calculateAge(formData.dob),
      panCardNumber: formData.panCardNumber,
      aadharCardNumber: formData.aadharCardNumber,
      paymentHistory: historyStr,
      status: role === 'super_admin' && formData.status ? formData.status : lead.status
    });

    // 5) Reflect “saved but unapproved” state immediately
    setPaymentHistory(cleaned.reverse());
    setIsSaved(true);
  };

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title={`Client Details – ${formData.fullName || lead.fullName} (${lead.assigned_user_name || 'Unassigned'} RM)`} size="5xl">
      <form onSubmit={handleSubmit}>
        {/* ————— Client Name ————— */}
        <div className="form-group">
          <label className="form-label flex items-center gap-2">
            Client Name
            {canEditClientName && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-400 font-normal">
                <Pencil size={12} /> Editable
              </span>
            )}
          </label>
          <input
            type="text"
            name="fullName"
            className="form-input"
            value={formData.fullName}
            onChange={handleChange}
            required={canEditClientName}
            readOnly={!canEditClientName}
            placeholder="Enter client name"
          />
        </div>

        {/* ————— Package Selection ————— */}
        <div className="form-group">
          <label className="form-label">Package</label>
          <select
            name="packageTier"
            className="form-input"
            value={formData.packageTier}
            onChange={handleChange}
          >
            <option value="">Select Package</option>
            {packageOptions
              .filter((opt) => opt)
              .map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
          </select>
        </div>

        {/* ————— Personal Info ————— */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="form-group">
            <label className="form-label">Gender</label>
            <select
              name="gender"
              className="form-input"
              value={formData.gender}
              onChange={handleChange}
            >
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Date of Birth (dd/mm/yyyy)</label>
            <input
              type="date"
              name="dob"
              className="form-input"
              value={formData.dob}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="form-group">
            <label className="form-label">PAN Card Number</label>
            <input
              type="text"
              name="panCardNumber"
              className="form-input"
              value={formData.panCardNumber}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Aadhar Card Number</label>
            <input
              type="text"
              name="aadharCardNumber"
              className="form-input"
              value={formData.aadharCardNumber}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* ————— Status/Disposition Change (Super Admin Only) ————— */}
        {role === 'super_admin' && (
          <div className="form-group">
            <label className="form-label">Change Disposition (Status)</label>
            <select
              name="status"
              className="form-input"
              value={formData.status}
              onChange={handleChange}
            >
              <option value="New">New</option>
              <option value="Free Trial">Free Trial</option>
              <option value="Free Trial – Follow Up">Free Trial – Follow Up</option>
              <option value="Follow Up (No Response)">Follow Up (No Response)</option>
              <option value="Promise To Pay">Promise To Pay</option>
              <option value="Paid Client">Paid Client</option>
              <option value="Follow Up">Follow Up</option>
              <option value="Call Back With Presentation">Call Back With Presentation</option>
              <option value="Call Back Without Presentation">Call Back Without Presentation</option>
              <option value="Not Interested">Not Interested</option>
              <option value="Non Trader">Non Trader</option>
              <option value="Less Funds">Less Funds</option>
              <option value="Language Barrier">Language Barrier</option>
              <option value="Disconnected Call">Disconnected Call</option>
              <option value="Switched Off">Switched Off</option>
              <option value="Ringing">Ringing</option>
              <option value="Not Reachable">Not Reachable</option>
              <option value="Out Of Service">Out Of Service</option>
              <option value="Busy">Busy</option>
              <option value="Incoming Calls Not Allowed">Incoming Calls Not Allowed</option>
              <option value="Invalid Number">Invalid Number</option>
              <option value="Loss Client">Loss Client</option>
              <option value="Won">Won</option>
              <option value="Do Not Disturb">Do Not Disturb</option>
              <option value="Summarization Call">Summarization Call</option>
              <option value="Counselling Call">Counselling Call</option>
              <option value="Equity Client">Equity Client</option>
            </select>
            <p className="text-xs text-yellow-400 mt-1">
              ⚠️ Warning: Changing disposition from Paid Client will revert this client back to a lead.
            </p>
          </div>
        )}

        {/* ————— Payment History ————— */}
        <div className="form-group">
          <div className="flex justify-between items-center mb-2">
            <label className="form-label">Payment History</label>
            {(role === 'super_admin' || role === 'relationship_mgr' || role === 'financial_manager') && (
              limitReached ? (
                <span className="text-sm px-3 py-1 rounded bg-red-900/40 text-red-300 border border-red-500/40 font-semibold">
                  Completed
                </span>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => addPaymentRow(false)}
                    className="text-sm px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 transition"
                  >
                    + Add Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => addPaymentRow(true)}
                    className="text-sm px-3 py-1 rounded bg-purple-600 hover:bg-purple-700 transition"
                  >
                    + Add Divided Payment
                  </button>
                </div>
              )
            )}
          </div>

          <div className="mb-2 font-semibold flex flex-wrap items-center gap-3">
            <span>
              Total Approved: ₹{displayApproved.toLocaleString('en-IN')}
              {totalApproved > PAYMENT_LIMIT && (
                <span className="text-xs text-gray-400 font-normal ml-1">
                  (actual ₹{totalApproved.toLocaleString('en-IN')})
                </span>
              )}
            </span>
            <span className={`text-xs font-semibold ${limitReached ? 'text-red-400' : 'text-emerald-400'}`}>
              {limitReached
                ? 'Completed — no more payments can be added'
                : `₹${remainingLimit.toLocaleString('en-IN')} left of ₹${PAYMENT_LIMIT.toLocaleString('en-IN')}`}
            </span>
          </div>
          {limitReached && (
            <p className="mb-2 text-sm text-red-300 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
              Completed (₹{PAYMENT_LIMIT.toLocaleString('en-IN')}). You cannot add any more payments for this client.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-gray-400 border-b border-gray-600">
                <tr>
                  {showPaymentDeleteColumn && (
                    <th className="p-2 min-w-[90px]">Delete</th>
                  )}
                  <th className="p-2 min-w-[120px]">Date</th>
                  <th className="p-2 min-w-[100px]">Amount</th>
                  <th className="p-2 min-w-[150px]">RM1</th>
                  <th className="p-2 min-w-[150px]">RM2</th>
                  <th className="p-2 min-w-[120px]">UTR / Status</th>
                </tr>
              </thead>
            <tbody>
              {paymentHistory.map((entry, i) => (
                <tr key={i} className={`border-b border-gray-700 ${dividedPayments.has(i) ? 'bg-purple-900/10' : 'bg-blue-900/5'}`}>
                  {showPaymentDeleteColumn && (
                    <td className="p-2">
                      {canDeletePaymentRow(entry) && (
                        <button
                          type="button"
                          onClick={() => handleDeletePaymentClick(i, entry)}
                          className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 text-xs font-semibold"
                          title="Delete Payment"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                  <td className="p-2 text-gray-400">
                    <div className="flex items-center gap-2">
                      {(role === 'super_admin' || (entry.isNew && (role === 'relationship_mgr' || role === 'financial_manager'))) ? (
                        <input
                          type="date"
                          className="form-input"
                          value={entry.date ? new Date(entry.date).toISOString().split('T')[0] : ''}
                          onChange={e => {
                            const dateValue = e.target.value;
                            const isoDate = dateValue ? new Date(dateValue).toISOString() : '';
                            handlePaymentChange(i, 'date', isoDate);
                          }}
                        />
                      ) : (
                        <span>{new Date(entry.date).toLocaleDateString('en-GB')}</span>
                      )}
                      {dividedPayments.has(i) ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-purple-600/30 text-purple-300 border border-purple-500/50">
                          Divided
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-600/30 text-blue-300 border border-blue-500/50">
                          Single
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-2">
                    {(role === 'super_admin' || role === 'admin' || role === 'financial_manager' || (entry.isNew && (role === 'relationship_mgr' || role === 'financial_manager'))) ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*\.?[0-9]*"
                        className="form-input"
                        value={entry.amount || ''}
                        onChange={e => handlePaymentChange(i, 'amount', e.target.value)}
                        onKeyPress={(e) => {
                          // Allow only numbers and decimal point
                          if (!/[0-9.]/.test(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        placeholder="0.00"
                      />
                    ) : (
                      <span>{entry.amount || '—'}</span>
                    )}
                  </td>
                  <td className="p-2 min-w-[150px]">
                    {(role === 'super_admin' || role === 'admin' || role === 'financial_manager') ? (
                      <select
                        className="form-input text-sm w-full min-w-[140px]"
                        value={entry.rm1 || ''}
                        onChange={e => {
                          const selectedRM = relationshipManagers.find(rm => rm.id === e.target.value);
                          handlePaymentChange(i, 'rm1', e.target.value);
                          handlePaymentChange(i, 'rm1_name', selectedRM?.displayName || '');
                        }}
                        title={entry.rm1_name || 'Select RM1'}
                      >
                        <option value="">Select RM1</option>
                        {relationshipManagers.map(rm => (
                          <option key={rm.id} value={rm.id}>
                            {rm.displayName}
                          </option>
                        ))}
                      </select>
                    ) : (role === 'relationship_mgr' && entry.rm1 === userId) ? (
                      <span className="text-green-400 whitespace-nowrap" title={entry.rm1_name || '—'}>
                        {entry.rm1_name || '—'}
                      </span>
                    ) : (
                      <span className="text-green-400 whitespace-nowrap" title={entry.rm1_name || '—'}>
                        {entry.rm1_name || '—'}
                      </span>
                    )}
                  </td>
                  <td className="p-2 min-w-[150px]">
                    {dividedPayments.has(i) ? (
                      (role === 'super_admin' || role === 'admin' || role === 'financial_manager') ? (
                        <select
                          className="form-input text-sm w-full min-w-[140px]"
                          value={entry.rm2 || ''}
                          onChange={e => {
                            const selectedRM = relationshipManagers.find(rm => rm.id === e.target.value);
                            handlePaymentChange(i, 'rm2', e.target.value);
                            handlePaymentChange(i, 'rm2_name', selectedRM?.displayName || '');
                          }}
                          title={entry.rm2_name || 'Select RM2'}
                        >
                          <option value="">Select RM2</option>
                          {relationshipManagers.map(rm => (
                            <option key={rm.id} value={rm.id}>
                              {rm.displayName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-green-400 whitespace-nowrap" title={entry.rm2_name || '—'}>
                          {entry.rm2_name || '—'}
                        </span>
                      )
                    ) : (
                      <span className="text-gray-500 text-xs italic">N/A</span>
                    )}
                  </td>
                  <td className="p-2 min-w-[80px]">
                    {(role === 'super_admin' || role === 'financial_manager') ? (
                      <div className="flex flex-col gap-2">
                        <input
                          type="text"
                          className="form-input"
                          value={entry.utr || ''}
                          onChange={e => {
                            const utrValue = e.target.value.trim();
                            handlePaymentChange(i, 'utr', utrValue);
                          }}
                          placeholder="Enter UTR"
                        />
                        <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-gray-500"
                            checked={!!entry.approved}
                            onChange={e => handlePaymentChange(i, 'approved', e.target.checked)}
                          />
                          <span className={`font-semibold ${entry.approved ? 'text-emerald-400' : 'text-yellow-400'}`}>
                            {entry.approved ? 'Approved' : 'Awaiting Approval'}
                          </span>
                        </label>
                      </div>
                    ) : entry.approved ? (
                      <div className="flex flex-col">
                        <span className="text-emerald-400 font-semibold">Approved</span>
                      </div>
                    ) : (
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
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 6v6l4 2" />
                        </svg>
                        Awaiting Approval
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {/* ————— Actions ————— */}
        <div className="flex justify-end space-x-3 mt-6">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {isSaved ? 'Close' : 'Cancel'}
          </button>
          {!isSaved && (
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          )}
        </div>
      </form>
    </Modal>
    <ConfirmModal
      isOpen={paymentIndexToDelete !== null}
      onClose={() => setPaymentIndexToDelete(null)}
      onConfirm={confirmDeletePayment}
      message="Are you sure you want to delete this payment? Click Save afterwards to confirm the change."
    />
    </>
  );
};

export default ClientDetailsModal;
