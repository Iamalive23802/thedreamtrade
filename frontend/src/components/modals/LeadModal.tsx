import { useState, useEffect } from 'react';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import { useLeadStore } from '../../stores/leadStore';
import { useTeamStore } from '../../stores/teamStore';
import { useUserStore } from '../../stores/userStore';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import type { Lead } from '../../stores/leadStore';
import {
  formatLeadNotes,
  parseNoteHistory,
  filterNoteHistoryForViewer,
  type NoteHistoryEntry,
} from '../../utils/notes';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
}

const LeadModal: React.FC<LeadModalProps> = ({ isOpen, onClose, lead }) => {
  const { addLead, updateLead, leads } = useLeadStore();
  const { fetchTeams } = useTeamStore();
  const { users, fetchUsers } = useUserStore();
  const { role, userId, displayName } = useAuthStore();
  const addToast = useToastStore((state) => state.addToast);

  const [showConfirm, setShowConfirm] = useState(false);
  const [noteHistory, setNoteHistory] = useState<NoteHistoryEntry[]>([]);
  const [deematSearchQuery, setDeematSearchQuery] = useState('');
  const [showDeematDropdown, setShowDeematDropdown] = useState(false);
  const [languageSearchQuery, setLanguageSearchQuery] = useState('');
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);

  const languageOptions = [
    'Hindi',
    'Bengali',
    'Marathi',
    'Tamil',
    'Telugu',
    'Gujarati',
    'Kannada',
    'Malayalam',
    'Punjabi',
    'Odia',
    'Urdu',
    'Assamese',
  ];

  const filteredLanguageOptions = languageSearchQuery
    ? languageOptions
        .filter((option) =>
          option.toLowerCase().includes(languageSearchQuery.toLowerCase())
        )
        .sort((a, b) => {
          const aStarts = a.toLowerCase().startsWith(languageSearchQuery.toLowerCase());
          const bStarts = b.toLowerCase().startsWith(languageSearchQuery.toLowerCase());
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return a.localeCompare(b);
        })
    : languageOptions;

  const deematAccountOptions = [
    'Zerodha',
    'Upstox',
    'Groww',
    'Angel One',
    '5paisa',
    'ICICI Direct',
    'HDFC Securities',
    'Kotak Securities',
    'Axis Direct',
    'SBI Securities',
    'Motilal Oswal',
    'Sharekhan',
    'IIFL Securities',
    'Edelweiss',
    'Religare Broking',
    'Ventura Securities',
    'Nirmal Bang',
    'Anand Rathi',
    'SMC Global',
    'Bonanza Portfolio',
    'LKP Securities',
    'Prabhudas Lilladher',
    'Karvy Stock Broking',
    'TradeSmart Online',
    'Alice Blue',
    'Fyers',
    'Paytm Money',
    'Dhan',
    'Shoonya',
    'Samco',
    'Prostocks',
    'BlinkX',
    'mStock',
    'Kotak Neo',
    'Choice Broking',
    'Axis Direct Lite',
    'Wisdom Capital',
    'RMoney',
    'Master Trust',
    'Way2Wealth',
    'BMA Wealth Creators',
    'Achiievers Equities',
    'Astha Trade',
    'TradePlus Online',
    'Aditya Birla Money',
    'Arihant Capital',
    'Trustline Securities',
    'Jainam Broking',
    'Monarch Networth Capital',
    'IDBI Direct',
    'Indiabulls Securities',
    'Narnolia Financial Advisors',
    'JM Financial',
    'Yes Securities',
    'IndusInd Bank',
    'Federal Bank',
    'IDFC FIRST Bank',
    'ICICI Bank 3-in-1',
    'HDFC Bank 3-in-1',
    'Kotak Bank 3-in-1',
    'Axis Bank 3-in-1',
    'SBI Bank 3-in-1',
    'IDBI Capital',
    'Axis Capital',
    'SBI Capital Markets',
    'INDmoney',
    'Kuvera',
    'Smallcase',
    'ET Money',
    'Growpital',
    'Jar',
    'Fi Money',
  ];

  const filteredDeematOptions = deematSearchQuery
    ? deematAccountOptions
        .filter((option) =>
          option.toLowerCase().includes(deematSearchQuery.toLowerCase())
        )
        .sort((a, b) => {
          const aStarts = a.toLowerCase().startsWith(deematSearchQuery.toLowerCase());
          const bStarts = b.toLowerCase().startsWith(deematSearchQuery.toLowerCase());
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return a.localeCompare(b);
        })
    : deematAccountOptions;

  const [formData, setFormData] = useState<Omit<Lead, 'id'>>({
    fullName: '',
    phone: '',
    email: '',
    altNumber: '',
    notes: '',
    deematAccountName: '',
    profession: '',
    stateName: '',
    capital: '',
    segment: '',
    status: 'Free Trial',
    team_id: '',
    assigned_to: '',
    tags: '',
    language: '',
  });

  useEffect(() => {
    fetchTeams();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (lead) {
      setFormData({
        fullName: lead.fullName || '',
        phone: lead.phone || '',
        email: lead.email || '',
        altNumber: lead.altNumber || '',
        notes: lead.notes || '',
        deematAccountName: lead.deematAccountName || '',
        profession: lead.profession || '',
        stateName: lead.stateName || '',
        capital: lead.capital || '',
        segment: lead.segment || '',
        status: lead.status || 'Free Trial',
        team_id: lead.team_id || '',
        assigned_to: lead.assigned_to || '',
        tags: lead.tags || '',
        language: lead.language || '',
      });
      setDeematSearchQuery(lead.deematAccountName || '');
      setLanguageSearchQuery(lead.language || '');
      
      const history = parseNoteHistory(lead.notes || '') as NoteHistoryEntry[];
      const assignedRmName =
        users.find((u) => u.id === lead.assigned_to)?.display_name ||
        lead.assigned_user_name ||
        '';
      const visibleHistory = filterNoteHistoryForViewer(history, {
        role,
        viewerRmName: displayName || '',
        assignedRmName,
      });

      // For existing leads, just populate the saved history without
      // automatically adding a new empty row. Users can add a row
      // manually using the "+ Add Row" button.
      setNoteHistory(visibleHistory.reverse());
    } else {
      setFormData({
        fullName: '',
        phone: '',
        email: '',
        altNumber: '',
        notes: '',
        deematAccountName: '',
        profession: '',
        stateName: '',
        capital: '',
        segment: '',
        status: 'Free Trial',
        team_id: '',
        assigned_to: '',
        tags: '',
        language: '',
      });
      setDeematSearchQuery('');
      setLanguageSearchQuery('');
      // For new leads, start with empty history - user must add rows manually
      setNoteHistory([]);
      
      // Auto-set tag for RMs when adding a new lead
      if ((role === 'relationship_mgr' || role === 'financial_manager')) {
        setFormData(prev => ({ ...prev, tags: 'Added by RM' }));
      }
    }
  }, [lead, users, role, displayName]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleNoteChange = (
    index: number,
    field: 'note' | 'status',
    value: string
  ) => {
    if (role === 'relationship_mgr' && !noteHistory[index].isNew) return;
    const updated = [...noteHistory];
    updated[index][field] = value as any;
    setNoteHistory(updated);
  };

  const addNewRow = () => {
    const now = new Date().toISOString();
    setNoteHistory([
      {
        status: 'Free Trial',
        note: '',
        date: now,
        rmName: displayName || '—',
        isNew: true,
      },
      ...noteHistory,
    ]);
  };

  const submitLead = async (forcedStatus?: string) => {
  // Use existing status from formData if noteHistory is empty or doesn't have status
  // Only use noteHistory status if it exists, otherwise preserve the current lead's status
  const newStatus = noteHistory[0]?.status || formData.status || 'Free Trial';
  
  // Mark all new entries as saved (not new anymore)
  const updatedHistory = noteHistory.map(entry => ({
    ...entry,
    isNew: false // Mark all entries as saved
  }));
  
  // Include entries that have either a note OR a status (to capture status-only changes)
  const notesString = formatLeadNotes(updatedHistory, displayName || '—');

  let finalData = {
    ...formData,
    notes: notesString,
    status: (forcedStatus ?? newStatus) as Lead['status'],
  };

  // Auto-assign to the current user if they're an RM or Financial Manager (only for new leads)
  if (!lead && (role === 'relationship_mgr' || role === 'financial_manager')) {
    console.log('🔍 Auto-assignment check:', { role, userId, lead: !!lead });
    const user = users.find(u => u.id === userId);
    console.log('👤 Found user:', user);
    if (user) {
      finalData = {
        ...finalData,
        team_id: user.team_id || null,
        assigned_to: userId,
      };
      // Ensure "Added by RM" tag is set for new leads by RMs
      if (!finalData.tags || finalData.tags.trim() === '') {
        finalData.tags = 'Added by RM';
      }
      console.log('✅ Auto-assignment applied:', { assigned_to: userId, team_id: user.team_id, finalData });
    } else {
      console.log('❌ User not found for auto-assignment');
    }
  } else {
    console.log('⚠️ Auto-assignment skipped:', { isNewLead: !lead, role, userId });
  }

  console.log("✅ submitLead triggered", formData);
  console.log("Final payload BEFORE cleanup:", JSON.stringify(finalData, null, 2));
  
  // Ensure assigned_to is properly handled - send null instead of empty string, but KEEP valid values
  if (finalData.assigned_to === '' || finalData.assigned_to === undefined) {
    delete finalData.assigned_to; // Remove empty assigned_to, let backend handle it
  } else if (finalData.assigned_to) {
    // Keep valid assigned_to value - ensure it's a string
    finalData.assigned_to = String(finalData.assigned_to).trim();
  }
  if (finalData.team_id === '' || finalData.team_id === undefined) {
    delete finalData.team_id; // Remove empty team_id, let backend handle it
  } else if (finalData.team_id) {
    // Keep valid team_id value - ensure it's a string
    finalData.team_id = String(finalData.team_id).trim();
  }
  
  console.log("Final payload AFTER cleanup:", JSON.stringify(finalData, null, 2));

  if (lead) {
    await updateLead(lead.id, finalData);
  } else {
    await addLead(finalData);
  }

  onClose();

  setTimeout(() => {
    const event = new CustomEvent('refreshLeads');
    window.dispatchEvent(event);
  }, 100);
};

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate phone number is exactly 10 digits
    if (formData.phone) {
      const phoneDigits = formData.phone.replace(/\D/g, '');
      if (phoneDigits.length !== 10) {
        addToast('Phone number must be exactly 10 digits', 'error');
        return;
      }
    }

    if (!lead && formData.phone && leads.some(l => l.phone === formData.phone)) {
      addToast('A lead with this phone number already exists!', 'error');
      return;
    }

    const latestStatus = noteHistory[0]?.status || 'Free Trial';
    if (lead?.status !== 'Won' && lead?.status !== 'Paid Client' && (latestStatus === 'Won' || latestStatus === 'Paid Client')) {
      setShowConfirm(true);
      return;
    }

    await submitLead();
  };

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title={lead ? 'Edit Lead' : 'Add Lead'} size="2xl">
      <form onSubmit={handleSubmit} className="space-y-5 text-sm">
        {/* Contact */}
        <section>
          <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Contact</h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-gray-700/80 bg-gray-900/30 p-4">
            <div className="form-group mb-0 sm:col-span-2">
              <label className="form-label text-gray-500 text-xs uppercase tracking-wide">Full Name</label>
              <input
                type="text"
                name="fullName"
                className="form-input"
                value={formData.fullName}
                onChange={handleChange}
                required
                disabled={role === 'relationship_mgr' && !!lead?.fullName}
              />
            </div>

            <div className="form-group mb-0">
              <label className="form-label text-gray-500 text-xs uppercase tracking-wide">Phone Number</label>
              <input
                type="text"
                name="phone"
                className="form-input"
                value={formData.phone}
                onChange={handleChange}
                disabled={role === 'relationship_mgr' && !!lead?.phone}
              />
            </div>

            <div className="form-group mb-0">
              <label className="form-label text-gray-500 text-xs uppercase tracking-wide">Alternate Number</label>
              <input
                type="text"
                name="altNumber"
                className="form-input"
                value={formData.altNumber}
                onChange={handleChange}
                disabled={role === 'relationship_mgr' && !!lead?.altNumber}
              />
            </div>

            <div className="form-group mb-0 sm:col-span-2">
              <label className="form-label text-gray-500 text-xs uppercase tracking-wide">Email Address</label>
              <input
                type="email"
                name="email"
                className="form-input"
                value={formData.email}
                onChange={handleChange}
                disabled={role === 'relationship_mgr' && !!lead?.email}
              />
            </div>
          </div>
        </section>

        {/* Lead Details */}
        <section>
          <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Lead Details</h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-gray-700/80 bg-gray-900/30 p-4">
            <div className="form-group mb-0 sm:col-span-2">
              <label className="form-label text-gray-500 text-xs uppercase tracking-wide">Deemat Account Name</label>
              <div className="relative">
                <input
                  type="text"
                  className="form-input"
                  value={deematSearchQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDeematSearchQuery(value);
                    setShowDeematDropdown(true);
                    setFormData(prev => ({ ...prev, deematAccountName: value }));
                  }}
                  onFocus={() => setShowDeematDropdown(true)}
                  onBlur={() => {
                    setTimeout(() => setShowDeematDropdown(false), 200);
                  }}
                  placeholder="Type to search (e.g., 'Z' for Zerodha)"
                  disabled={role === 'relationship_mgr' && !!lead?.deematAccountName}
                />
                {showDeematDropdown && filteredDeematOptions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto">
                    {filteredDeematOptions.map((option) => (
                      <div
                        key={option}
                        className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-white"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setDeematSearchQuery(option);
                          setFormData(prev => ({ ...prev, deematAccountName: option }));
                          setShowDeematDropdown(false);
                        }}
                      >
                        {option}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group mb-0">
              <label className="form-label text-gray-500 text-xs uppercase tracking-wide">Profession</label>
              <select
                name="profession"
                className="form-input"
                value={formData.profession}
                onChange={handleChange}
                disabled={role === 'relationship_mgr' && !!lead?.profession}
              >
                <option value="">Select</option>
                <option value="Student">Student</option>
                <option value="Private Sector">Private Sector</option>
                <option value="Business">Business</option>
              </select>
            </div>

            <div className="form-group mb-0">
              <label className="form-label text-gray-500 text-xs uppercase tracking-wide">State</label>
              <select
                name="stateName"
                className="form-input"
                value={formData.stateName}
                onChange={handleChange}
                disabled={role === 'relationship_mgr' && !!lead?.stateName}
              >
                <option value="">Select</option>
                <option value="Andhra Pradesh">Andhra Pradesh</option>
                <option value="Arunachal Pradesh">Arunachal Pradesh</option>
                <option value="Assam">Assam</option>
                <option value="Bihar">Bihar</option>
                <option value="Chhattisgarh">Chhattisgarh</option>
                <option value="Goa">Goa</option>
                <option value="Gujarat">Gujarat</option>
                <option value="Haryana">Haryana</option>
                <option value="Himachal Pradesh">Himachal Pradesh</option>
                <option value="Jharkhand">Jharkhand</option>
                <option value="Karnataka">Karnataka</option>
                <option value="Kerala">Kerala</option>
                <option value="Madhya Pradesh">Madhya Pradesh</option>
                <option value="Maharashtra">Maharashtra</option>
                <option value="Manipur">Manipur</option>
                <option value="Meghalaya">Meghalaya</option>
                <option value="Mizoram">Mizoram</option>
                <option value="Nagaland">Nagaland</option>
                <option value="Odisha">Odisha</option>
                <option value="Punjab">Punjab</option>
                <option value="Rajasthan">Rajasthan</option>
                <option value="Sikkim">Sikkim</option>
                <option value="Tamil Nadu">Tamil Nadu</option>
                <option value="Telangana">Telangana</option>
                <option value="Tripura">Tripura</option>
                <option value="Uttar Pradesh">Uttar Pradesh</option>
                <option value="Uttarakhand">Uttarakhand</option>
                <option value="West Bengal">West Bengal</option>
              </select>
            </div>

            <div className="form-group mb-0">
              <label className="form-label text-gray-500 text-xs uppercase tracking-wide">Capital</label>
              <input
                type="text"
                name="capital"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                className="form-input"
                value={formData.capital}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || /^\d*\.?\d*$/.test(value)) {
                    handleChange(e);
                  }
                }}
                onKeyPress={(e) => {
                  if (!/[0-9.]/.test(e.key)) {
                    e.preventDefault();
                  }
                }}
                disabled={role === 'relationship_mgr' && !!lead?.capital}
                placeholder="0.00"
              />
            </div>

            <div className="form-group mb-0">
              <label className="form-label text-gray-500 text-xs uppercase tracking-wide">Segment</label>
              <input
                type="text"
                name="segment"
                className="form-input"
                value={formData.segment}
                onChange={handleChange}
                disabled={role === 'relationship_mgr' && !!lead?.segment}
              />
            </div>

            <div className="form-group mb-0">
              <label className="form-label text-gray-500 text-xs uppercase tracking-wide">Tags</label>
              <input
                type="text"
                name="tags"
                className="form-input"
                value={formData.tags || ''}
                onChange={handleChange}
                placeholder="e.g., VIP, Hot Lead, Follow Up"
                disabled={!lead && (role === 'relationship_mgr' || role === 'financial_manager')}
              />
            </div>

            <div className="form-group mb-0">
              <label className="form-label text-gray-500 text-xs uppercase tracking-wide">Language</label>
              <div className="relative">
                <input
                  type="text"
                  className="form-input"
                  value={languageSearchQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    setLanguageSearchQuery(value);
                    setShowLanguageDropdown(true);
                    setFormData(prev => ({ ...prev, language: value }));
                  }}
                  onFocus={() => setShowLanguageDropdown(true)}
                  onBlur={() => {
                    setTimeout(() => setShowLanguageDropdown(false), 200);
                  }}
                  placeholder="Type to search (e.g., 'H' for Hindi)"
                  disabled={role === 'relationship_mgr' && !!lead?.language}
                />
                {showLanguageDropdown && filteredLanguageOptions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto">
                    {filteredLanguageOptions.map((option) => (
                      <div
                        key={option}
                        className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-white"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setLanguageSearchQuery(option);
                          setFormData(prev => ({ ...prev, language: option }));
                          setShowLanguageDropdown(false);
                        }}
                      >
                        {option}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Status & Notes */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Status &amp; Notes History</h5>
            <button
              type="button"
              onClick={addNewRow}
              className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 transition"
            >
              + Add Row
            </button>
          </div>
          {noteHistory.length > 0 ? (
            <div className="rounded-lg border border-gray-700/80 overflow-hidden overflow-x-auto">
              <table className="w-full text-xs text-left text-gray-300 min-w-[640px]">
                <thead>
                  <tr className="bg-gray-900/80 text-gray-400 uppercase tracking-wide">
                    <th className="p-2.5 font-medium">Date &amp; Time</th>
                    <th className="p-2.5 font-medium">Status</th>
                    <th className="p-2.5 font-medium">Note</th>
                    <th className="p-2.5 font-medium">RM Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/80">
                  {noteHistory.map((entry, i) => (
                    <tr key={i} className="hover:bg-gray-900/40 align-top">
                      <td className="p-2.5 text-gray-400 whitespace-nowrap">
                        <div>{new Date(entry.date).toLocaleString()}</div>
                        {!entry.isNew ? (
                          <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-900/30 text-green-400 border border-green-700/50">
                            Entry Done
                          </span>
                        ) : (
                          <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-900/30 text-yellow-400 border border-yellow-700/50">
                            Editing
                          </span>
                        )}
                      </td>
                      <td className="p-2.5">
                        <select
                          className="form-input text-xs"
                          value={entry.status}
                          onChange={(e) => handleNoteChange(i, 'status', e.target.value)}
                          disabled={role === 'relationship_mgr' && !entry.isNew}
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
                        </select>
                      </td>
                      <td className="p-2.5">
                        <textarea
                          className="form-input text-xs"
                          rows={2}
                          placeholder="Enter note"
                          value={entry.note}
                          onChange={(e) => handleNoteChange(i, 'note', e.target.value)}
                          disabled={role === 'relationship_mgr' && !entry.isNew}
                        />
                      </td>
                      <td className="p-2.5 text-gray-300 whitespace-nowrap">
                        {entry.rmName && entry.rmName !== '—'
                          ? entry.rmName
                          : entry.isNew
                            ? displayName || '—'
                            : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 rounded-lg border border-gray-700/80 bg-gray-900/30">
              <p>No notes added yet. Click "+ Add Row" to add your first note.</p>
            </div>
          )}
        </section>

        <div className="flex justify-end space-x-3 pt-2 border-t border-gray-700">
          <button
            type="button"
            className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {lead ? 'Update Lead' : 'Add Lead'}
          </button>
        </div>
      </form>
    </Modal>
    {showConfirm && (
  <ConfirmModal
    isOpen={true}
    onClose={() => {
      setShowConfirm(false);
      setNoteHistory((prev) => {
        const updated = [...prev];
        if (updated.length > 0) {
          updated[0].status = lead?.status || 'Free Trial';
        }
        return updated;
      });
    }}
    onConfirm={async () => {
      console.log("🟡 ConfirmModal confirmed"); // ← add this
      setShowConfirm(false);
      const latestStatus = noteHistory[0]?.status || 'Free Trial';
      const clientStatus = (latestStatus === 'Won' || latestStatus === 'Paid Client') ? latestStatus : 'Paid Client';
      await submitLead(clientStatus); // ← force Paid Client or Won status
    }}
    message="Marking this lead as Paid Client will convert it to a client and cannot be undone. Continue?"
  />
)}
    </>
  );
};

export default LeadModal;
