import { useState, useEffect } from 'react';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import { useLeadStore } from '../../stores/leadStore';
import type { Lead } from '../../stores/leadStore';

interface LeadProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
}

const LeadProgressModal: React.FC<LeadProgressModalProps> = ({ isOpen, onClose, lead }) => {
  const { updateLead } = useLeadStore();

  const [fullName, setFullName] = useState(lead.fullName);
  const [noteHistory, setNoteHistory] = useState<
    { note: string; status: Lead['status']; date: string }[]
  >([]);

  useEffect(() => {
    const history = lead.notes
      ?.split('|||')
      .map((entry) => {
        const parts = entry.split('__');
        return {
          note: parts[0] || '',
          status: (parts[1] || 'New') as Lead['status'],
          date: parts[2] || new Date().toISOString(),
        };
      }) || [];

    setNoteHistory(history.reverse()); // newest at top
    setFullName(lead.fullName);
  }, [lead]);

  const handleNoteChange = (index: number, field: 'note' | 'status', value: string) => {
    const updated = [...noteHistory];
    updated[index][field] = value as any;
    setNoteHistory(updated);
  };

  const addNewRow = () => {
    const now = new Date().toISOString();
    setNoteHistory([
      {
        status: 'New',
        note: '',
        date: now,
      },
      ...noteHistory,
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const reversed = [...noteHistory].reverse(); // restore original order
    const updatedNotes = reversed
      .map((entry) => `${entry.note.trim()}__${entry.status}__${entry.date}`)
      .join('|||');
    const newStatus = noteHistory[0]?.status || 'New';
    if (lead.status !== 'Won' && newStatus === 'Won') {
      setShowConfirm(true);
      setPendingUpdate({ updatedNotes, newStatus });
      return;
    }

    await updateLead(lead.id, {
      ...lead,
      fullName,
      notes: updatedNotes,
      status: newStatus,
    });

    onClose();
  };

  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{ updatedNotes: string; newStatus: Lead['status'] } | null>(null);

  const confirmWon = async () => {
    if (!pendingUpdate) return;
    await updateLead(lead.id, {
      ...lead,
      fullName,
      notes: pendingUpdate.updatedNotes,
      status: pendingUpdate.newStatus,
    });
    setShowConfirm(false);
    setPendingUpdate(null);
    onClose();
  };

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title={`Update Progress - ${lead.fullName}`}>
      <form onSubmit={handleSubmit} className="space-y-4 text-gray-200">
        <div>
          <label className="form-label">Full Name</label>
          <input
            type="text"
            className="form-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div>
          <label className="form-label">Email</label>
          <input type="email" className="form-input" value={lead.email} disabled />
        </div>

        <div>
          <label className="form-label">Phone Number</label>
          <input type="text" className="form-input" value={lead.phone} disabled />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="form-label">Previous Updates</label>
            <button
              type="button"
              onClick={addNewRow}
              className="text-sm px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 transition"
            >
              + Add Row
            </button>
          </div>
          <table className="w-full text-sm text-left">
            <thead className="text-gray-400 border-b border-gray-600">
              <tr>
                <th className="p-2">Date & Time</th>
                <th className="p-2">Status</th>
                <th className="p-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {noteHistory.map((entry, i) => (
                <tr key={i} className="border-b border-gray-700">
                  <td className="p-2 text-gray-400">{new Date(entry.date).toLocaleString()}</td>
                  <td className="p-2">
                    <select
                      className="form-input"
                      value={entry.status}
                      onChange={(e) => handleNoteChange(i, 'status', e.target.value)}
                    >
                      <option value="New">New</option>
                      <option value="Contacted">Contacted</option>
                      <option value="Qualified">Qualified</option>
                      <option value="Proposal">Proposal</option>
                      <option value="Won">Won</option>
                      <option value="Lost">Lost</option>
                    </select>
                  </td>
                  <td className="p-2">
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="Enter note"
                      value={entry.note}
                      onChange={(e) => handleNoteChange(i, 'note', e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-4">
          <button type="submit" className="btn btn-primary">
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
    {showConfirm && (
      <ConfirmModal
        isOpen={true}
        onClose={() => {
          setShowConfirm(false);
          setPendingUpdate(null);
        }}
        onConfirm={confirmWon}
        message="Marking this lead as Won will convert it to a client and cannot be undone. Continue?"
      />
    )}
    </>
  );
};

export default LeadProgressModal;
