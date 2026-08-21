import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useUserStore } from '../stores/userStore';
import { useTeamStore } from '../stores/teamStore';
import { Pencil, Trash2, Plus, Ban } from 'lucide-react';
import UserModal from '../components/modals/UserModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import { useToastStore } from '../stores/toastStore';
import type { User } from '../stores/userStore';

function UsersPage() {
  const { role, userId } = useAuthStore();
  const { users, fetchUsers, deleteUser, bulkInactivateUsers } = useUserStore();
  const { teams, fetchTeams } = useTeamStore();
  const addToast = useToastStore((state) => state.addToast);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchTeams();
  }, []);

  const handleAddUser = () => {
    setEditingUser(null);
    setIsModalOpen(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleDeleteUser = (id: string) => {
    setUserToDelete(id);
  };

  const confirmDelete = () => {
    if (userToDelete) {
      deleteUser(userToDelete);
      setUserToDelete(null);
    }
  };

  const confirmBulkInactivate = async () => {
    const activeUserIds = filteredUsers
      .filter((user) => user.status === 'Active' && user.role !== 'super_admin')
      .map((user) => user.id);

    if (activeUserIds.length === 0) {
      addToast('No eligible active users to inactivate.', 'info');
      setShowBulkConfirm(false);
      return;
    }

    try {
      await bulkInactivateUsers(activeUserIds);
      addToast(`${activeUserIds.length} users marked as inactive`, 'success');
    } catch (err) {
      console.error('Bulk inactivation failed:', err);
      addToast('Failed to inactivate users', 'error');
    } finally {
      setShowBulkConfirm(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    if (role === 'super_admin') return true;
    if (role === 'admin') return user.role !== 'super_admin';

    if (role === 'team_leader') {
      const currentUser = users.find((u) => u.id === userId);
      return (
        user.role !== 'super_admin' &&
        user.role !== 'admin' &&
        user.team_id === currentUser?.team_id
      );
    }

    return false;
  });

  const getRoleBadge = (userRole: string) => {
    switch (userRole) {
      case 'super_admin':
        return 'bg-blue-500/20 text-blue-400';
      case 'admin':
        return 'bg-purple-500/20 text-purple-400';
      case 'team_leader':
        return 'bg-green-500/20 text-green-400';
      case 'relationship_mgr':
      case 'financial_manager':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getTeamName = (teamId: string | undefined) => {
    if (!teamId) return 'No Team';
    const team = teams.find(t => t.id === teamId);
    return team ? team.name : 'Unknown Team';
  };



  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">👥 All Users</h1>

        {(role === 'super_admin' || role === 'admin') && (
          <div className="flex gap-3">
            <button
              className="btn btn-primary flex items-center"
              onClick={handleAddUser}
            >
              <Plus className="mr-2" size={18} />
              Add User
            </button>
            <button
              className="btn btn-danger flex items-center"
              onClick={() => setShowBulkConfirm(true)}
            >
              <Ban className="mr-2" size={18} />
              Inactivate All
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto max-h-[80vh] border border-gray-700 rounded-lg">
        <table className="min-w-full text-sm text-left text-gray-300">
          <thead className="bg-gray-700 uppercase text-xs text-gray-400 sticky top-0">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Role</th>
              <th className="p-3">Team</th>
              <th className="p-3">Status</th>
              {(role === 'super_admin' || role === 'admin') && (
                <th className="p-3">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700 bg-gray-800">
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td className="p-3">{user.displayName}</td>
                <td className="p-3">{user.email}</td>
                <td className="p-3">{user.phoneNumber}</td>

                <td className="p-3">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${getRoleBadge(user.role)}`}
                  >
                    {user.role.replace('_', ' ')}
                  </span>
                </td>
                <td className="p-3">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      user.team_id 
                        ? 'bg-blue-600/20 text-blue-400'
                        : 'bg-gray-600/20 text-gray-400'
                    }`}
                  >
                    {getTeamName(user.team_id)}
                  </span>
                </td>
                <td className="p-3">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      user.status === 'Active'
                        ? 'bg-green-600/20 text-green-400'
                        : 'bg-red-600/20 text-red-400'
                    }`}
                  >
                    {user.status}
                  </span>
                </td>
                {(role === 'super_admin' || role === 'admin') && (
                  <td className="p-3 flex gap-2">
                    <button
                      onClick={() => handleEditUser(user)}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <UserModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          user={editingUser}
        />
      )}

      {userToDelete && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setUserToDelete(null)}
          onConfirm={confirmDelete}
          message="Are you sure you want to delete this user?"
        />
      )}

      {showBulkConfirm && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setShowBulkConfirm(false)}
          onConfirm={confirmBulkInactivate}
          message="Are you sure you want to mark all non-super-admin users as inactive?"
        />
      )}
    </div>
  );
}

export default UsersPage;
