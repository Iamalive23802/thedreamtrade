import { useEffect, useState } from 'react';
import Modal from './Modal';
import { useLeadStore, Lead } from '../../stores/leadStore';
import { useAuthStore } from '../../stores/authStore';
import { useUserStore } from '../../stores/userStore';
import {
  PaymentEntry,
  PackageTier,
  parsePaymentHistory,
  serializePaymentHistory,
} from '../../utils/payment';

interface ClientDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
}

const ClientDetailsModal: React.FC<ClientDetailsModalProps> = ({ isOpen, onClose, lead }) => {
  const { updateLead } = useLeadStore();
  const { role } = useAuthStore();
  const { users, fetchUsers } = useUserStore();

  const [formData, setFormData] = useState({
    packageTier: '' as PackageTier,
    gender: '',
    dob: '',
    panCardNumber: '',
    aadharCardNumber: '',
    status: '' as Lead['status'],
  });

  const [paymentHistory, setPaymentHistory] = useState<PaymentEntry[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const packageOptions: PackageTier[] = ['', 'Basic', 'Advanced', 'Premium'];

  // Get list of RMs for dropdown
  const relationshipManagers = users.filter(
    u => u.role === 'relationship_mgr' || u.role === 'financial_manager'
  );

  // Total of approved payments
  const totalApproved = paymentHistory
    .filter(e => e.approved)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

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
        packageTier: (initialPackage as PackageTier) || '',
        gender: lead.gender || '',
        dob: lead.dob || '',
        panCardNumber: lead.panCardNumber || '',
        aadharCardNumber: lead.aadharCardNumber || '',
        status: lead.status || '',
      });
      // newest-first in the table
      setPaymentHistory(newestFirst);
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
        (updated[index] as any)[field] = validValue;
      }
    } else {
      (updated[index] as any)[field] = value;
    }
    
    setPaymentHistory(updated);
  };

  const addPaymentRow = () => {
    setPaymentHistory((prev) => [
      {
        amount: '',
        date: new Date().toISOString(),
        utr: '',
        approved: false,
        assigned_to: lead.assigned_to || '',
        assigned_to_name: lead.assigned_user_name || '',
        packageTier: formData.packageTier,
        isNew: true,
      },
      ...prev,
    ]);
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

    // 4) oldest-first → serialize → save
    const reversed = [...cleaned].reverse();
    const historyStr = serializePaymentHistory(reversed);

    await updateLead(lead.id, {
      ...lead,
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
    <Modal isOpen={isOpen} onClose={onClose} title={`Client Details – ${lead.fullName} (${lead.assigned_user_name || 'Unassigned'} RM)`}>
      <form onSubmit={handleSubmit}>
        {/* ————— Package Selection ————— */}
        <div className="form-group">
          <label className="form-label">Package</label>
          <select
            name="packageTier"
            className="form-input"
            value={formData.packageTier}
            onChange={handleChange}
            disabled={role === 'relationship_mgr' && !!formData.packageTier}
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
        <div className="form-group">
          <label className="form-label">Gender</label>
          <select
            name="gender"
            className="form-input"
            value={formData.gender}
            onChange={handleChange}
            disabled={role === 'relationship_mgr' && !!lead.gender}
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
            disabled={role === 'relationship_mgr' && !!lead.dob}
          />
        </div>

        <div className="form-group">
          <label className="form-label">PAN Card Number</label>
          <input
            type="text"
            name="panCardNumber"
            className="form-input"
            value={formData.panCardNumber}
            onChange={handleChange}
            disabled={role === 'relationship_mgr' && !!lead.panCardNumber}
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
            disabled={role === 'relationship_mgr' && !!lead.aadharCardNumber}
          />
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
            {(role === 'relationship_mgr' || role === 'super_admin') && (
              <button
                type="button"
                onClick={addPaymentRow}
                className="text-sm px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 transition"
              >
                + Add Payment
              </button>
            )}
          </div>

          <div className="mb-2 font-semibold">
            Total Approved: ₹{totalApproved}
          </div>

          <table className="w-full text-sm text-left">
            <thead className="text-gray-400 border-b border-gray-600">
              <tr>
                <th className="p-2">Date</th>
                <th className="p-2">Amount</th>
                <th className="p-2">Relationship Manager</th>
                <th className="p-2">UTR / Status</th>
              </tr>
            </thead>
            <tbody>
              {paymentHistory.map((entry, i) => (
                <tr key={i} className="border-b border-gray-700">
                  <td className="p-2 text-gray-400">
                    {new Date(entry.date).toLocaleDateString('en-GB')}
                  </td>
                  <td className="p-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      className="form-input"
                      value={entry.amount}
                      onChange={e => handlePaymentChange(i, 'amount', e.target.value)}
                      onKeyPress={(e) => {
                        // Allow only numbers and decimal point
                        if (!/[0-9.]/.test(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      disabled={!(entry.isNew && (role === 'relationship_mgr' || role === 'super_admin'))}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="p-2">
                    {entry.isNew && (role === 'relationship_mgr' || role === 'super_admin') ? (
                      <select
                        className="form-input text-sm"
                        value={entry.assigned_to || ''}
                        onChange={e => {
                          const selectedRM = relationshipManagers.find(rm => rm.id === e.target.value);
                          handlePaymentChange(i, 'assigned_to', e.target.value);
                          handlePaymentChange(i, 'assigned_to_name', selectedRM?.displayName || '');
                        }}
                      >
                        <option value="">Select RM</option>
                        {relationshipManagers.map(rm => (
                          <option key={rm.id} value={rm.id}>
                            {rm.displayName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-green-400">{entry.assigned_to_name || '—'}</span>
                    )}
                  </td>
                  <td className="p-2">
                    {entry.approved ? (
                      <div className="flex flex-col">
                        <span className="text-emerald-400 font-semibold">Approved</span>
                        <span className="text-xs text-gray-300">
                          {entry.utr || 'UTR pending'}
                        </span>
                      </div>
                    ) : role === 'financial_manager' || role === 'super_admin' ? (
                      <input
                        type="text"
                        className="form-input"
                        value={entry.utr}
                        onChange={e => handlePaymentChange(i, 'utr', e.target.value)}
                        onBlur={e => {
                          const val = e.target.value.trim();
                          if (val) {
                            handlePaymentChange(i, 'utr', val);
                            handlePaymentChange(i, 'approved', true);
                          }
                        }}
                      />
                    ) : entry.isNew ? (
                      '—'
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
  );
};

export default ClientDetailsModal;
