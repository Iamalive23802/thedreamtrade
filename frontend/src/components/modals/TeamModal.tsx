import { useState, useEffect } from 'react';
import Modal from './Modal';
import { useTeamStore } from '../../stores/teamStore';

interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: any | null;
}

const TeamModal: React.FC<TeamModalProps> = ({ isOpen, onClose, team }) => {
  const { addTeam, updateTeam } = useTeamStore();

  const [formData, setFormData] = useState({
    name: '',
  });

  useEffect(() => {
    if (team) {
      setFormData({
        name: team.name || '',
      });
    } else {
      setFormData({
        name: '',
      });
    }
  }, [team]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) return;

    if (team) {
      await updateTeam(team.id, formData); // ✅ Edit mode
    } else {
      await addTeam(formData); // ✅ Add mode
    }

    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={team ? 'Edit Team' : 'Add Team'}>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Team Name</label>
          <input
            type="text"
            name="name"
            className="form-input"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {team ? 'Update Team' : 'Add Team'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default TeamModal;
