import { useState, useEffect } from 'react';
import Modal from './Modal';
import { useUserStore, User } from '../../stores/userStore';
import { useTeamStore } from '../../stores/teamStore';
import { useToastStore } from '../../stores/toastStore';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

const UserModal: React.FC<UserModalProps> = ({ isOpen, onClose, user }) => {
  const { addUser, updateUser, users } = useUserStore();
  const { teams, fetchTeams } = useTeamStore();

  const normalizePhone = (p: string) => (p || '').replace(/\D/g, '').trim();

  const [formData, setFormData] = useState<Omit<User, 'id'> & { password: string }>({
    displayName: '',
    email: '',
    phoneNumber: '',
    password: '',
    role: 'relationship_mgr',
    status: 'Active',
    team_id: '',
  });

  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const addToast = useToastStore((state) => state.addToast);

  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    if (user) {
      setFormData({
        displayName: user.displayName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        password: '',
        role: user.role,
        status: user.status,
        team_id: user.team_id || '',
      });
    } else {
      setFormData({
        displayName: '',
        email: '',
        phoneNumber: '',
        password: '',
        role: 'relationship_mgr',
        status: 'Active',
        team_id: '',
      });
    }
    setConfirmPassword('');
    setErrorMsg('');
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!user && formData.password !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }

    const phoneNorm = normalizePhone(formData.phoneNumber);
    const duplicate = users.some(
      (u) => normalizePhone(u.phoneNumber) === phoneNorm && (!user || u.id !== user.id)
    );
    if (duplicate) {
      setErrorMsg('A user with this phone number already exists');
      return;
    }

    try {
      if (user) {
        await updateUser(user.id, { ...formData, phoneNumber: phoneNorm });
      } else {
        await addUser({ ...formData, phoneNumber: phoneNorm });
      }
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Failed to save user';
      setErrorMsg(msg);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={user ? 'Edit User' : 'Add User'}>
      <form onSubmit={handleSubmit}>
        {errorMsg && (
          <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded mb-4">
            {errorMsg}
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Full Name</label>
          <input
            type="text"
            name="displayName"
            className="form-input"
            value={formData.displayName}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            type="email"
            name="email"
            className="form-input"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Phone</label>
          <input
            type="text"
            name="phoneNumber"
            className="form-input"
            value={formData.phoneNumber}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Role</label>
          <select
            name="role"
            className="form-input"
            value={formData.role}
            onChange={handleChange}
          >
            <option value="super_admin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="team_leader">Team Leader</option>
            <option value="relationship_mgr">Relationship Manager</option>
            <option value="financial_manager">Financial Manager</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Status</label>
          <select
            name="status"
            className="form-input"
            value={formData.status}
            onChange={handleChange}
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {user && (
          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input
              type="text"
              className="form-input bg-gray-700 cursor-not-allowed"
              value="••••••••••••"
              disabled
              readOnly
              placeholder="Password is encrypted"
            />
            <p className="text-xs text-gray-400 mt-1">
              Password is encrypted for security. Leave "New Password" empty to keep current password.
            </p>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">{user ? 'New Password (optional)' : 'Password'}</label>
          <input
            type="password"
            name="password"
            className="form-input"
            value={formData.password}
            onChange={handleChange}
            required={!user}
          />
        </div>

        {!user && (
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              name="confirmPassword"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Team</label>
          <select
            name="team_id"
            className="form-input"
            value={formData.team_id}
            onChange={handleChange}
          >
            <option value="">Select Team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {user ? 'Update User' : 'Add User'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default UserModal;
