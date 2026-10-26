import { useState, useEffect } from 'react';
import { Trash2, Plus, Pencil } from 'lucide-react';
import { useTeamStore } from '../stores/teamStore';
import { useUserStore } from '../stores/userStore';
import TeamModal from '../components/modals/TeamModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import PageHeader from '../components/PageHeader';

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
    <div>
      <PageHeader
        title="Teams"
        description={`${teams.length.toLocaleString('en-IN')} teams`}
        actions={
          <button type="button" className="btn btn-primary" onClick={handleAddTeam}>
            <Plus size={16} />
            Add Team
          </button>
        }
      />

      <div className="table-panel">
        <div className="table-container max-h-[80vh] overflow-y-auto">
          <table className="data-table">
            <thead className="sticky top-0 bg-shell">
              <tr>
                <th>Team Name</th>
                <th>Users</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-10 text-center text-sm text-gray-400">
                    No teams yet.
                  </td>
                </tr>
              )}
              {teams.map((team) => {
                const userCount = users.filter((u) => u.team_id === team.id).length;
                return (
                  <tr key={team.id}>
                    <td>{team.name}</td>
                    <td>{userCount}</td>
                    <td>
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          aria-label={`Edit ${team.name}`}
                          onClick={() => handleEditTeam(team)}
                          className="icon-btn text-sky-300"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${team.name}`}
                          onClick={() => handleDeleteTeam(team.id)}
                          className="icon-btn icon-btn-danger"
                        >
                          <Trash2 size={16} />
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
