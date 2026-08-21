import { useState, useEffect } from 'react';
import { Trash2, Plus, Pencil } from 'lucide-react';
import { useTeamStore } from '../stores/teamStore';
import { useUserStore } from '../stores/userStore';
import TeamModal from '../components/modals/TeamModal';
import ConfirmModal from '../components/modals/ConfirmModal';

function TeamsPage() {
  const { teams, fetchTeams, deleteTeam } = useTeamStore();
  const { users, fetchUsers } = useUserStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [teamToDelete, setTeamToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchTeams();
    fetchUsers(); 
  }, []);

  const handleAddTeam = () => {
    setEditingTeam(null);
    setIsModalOpen(true);
  };

  const handleEditTeam = (team: any) => {
    setEditingTeam(team);
    setIsModalOpen(true);
  };

  const handleDeleteTeam = (teamId: string) => {
    setTeamToDelete(teamId);
  };

  const confirmDelete = () => {
    if (teamToDelete) {
      deleteTeam(teamToDelete);
      setTeamToDelete(null);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTeam(null);
  };

  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">All Teams</h1>
        <button
          className="btn btn-primary flex items-center"
          onClick={handleAddTeam}
        >
          <Plus size={18} className="mr-1" />
          Add Team
        </button>
      </div>

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="table-container max-h-[80vh] overflow-y-auto">
          <table className="data-table">
            <thead className="bg-gray-700 sticky top-0">
              <tr>
                <th>Team Name</th>
                <th>Users</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {teams.map((team) => {
                const userCount = users.filter((u) => u.team_id === team.id).length;
                return (
                  <tr key={team.id}>
                    <td>{team.name}</td>
                    <td>{userCount}</td>
                    <td>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditTeam(team)}
                          className="p-1 text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteTeam(team.id)}
                          className="p-1 text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <TeamModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          team={editingTeam}
        />
      )}
      {teamToDelete && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setTeamToDelete(null)}
          onConfirm={confirmDelete}
          message="Are you sure you want to delete this team?"
        />
      )}
    </div>
  );
}

export default TeamsPage;
