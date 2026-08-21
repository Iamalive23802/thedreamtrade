import React, { useState } from 'react';
import Modal from './Modal'; // Reuse your base modal
import { useAuthStore } from '../../stores/authStore';
import axiosInstance from '../../utils/axiosConfig'; 

interface AssignLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  availableUsers: { id: string; displayName: string; role: string }[];
  onAssigned?: () => void; 
}

const AssignLeadModal: React.FC<AssignLeadModalProps> = ({
  isOpen,
  onClose,
  leadId,
  availableUsers,
  onAssigned,
}) => {

  const [selectedUser, setSelectedUser] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAssign = async () => {
    if (!selectedUser) {
      setError('Please select a user');
      return;
    }

    setLoading(true);
    setError('');

    console.log('Assigning leadId:', leadId);
    console.log('To user:', selectedUser);

    try {
      await axiosInstance.patch(`/leads/${leadId}/assign`, {
        assigned_to: selectedUser
      });

      if (onAssigned) onAssigned();
      onClose();
    } catch (err) {
      console.error('❌ Assign lead failed:', err);
      setError('Failed to assign lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Assign Lead">
      <div className="form-group">
        <label className="form-label">Assign To</label>
        <select
          className="form-input"
          value={selectedUser}
          onChange={(e) => setSelectedUser(e.target.value)}
        >
          <option value="">Select user</option>
          {availableUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName} ({user.role})
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

      <div className="flex justify-end mt-6 space-x-3">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={handleAssign}
          disabled={loading}
        >
          {loading ? 'Assigning...' : 'Assign Lead'}
        </button>
      </div>
    </Modal>
  );
};

export default AssignLeadModal;
