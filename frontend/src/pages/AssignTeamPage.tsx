import { useState, useEffect } from 'react';
import { useUserStore } from '../stores/userStore';
import { useTeamStore } from '../stores/teamStore';

function AssignTeamPage() {
  const { users, updateUser, fetchUsers, loading } = useUserStore();
  const { teams } = useTeamStore();
  const [selectedTeam, setSelectedTeam] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    (async () => {
      try {
        await fetchUsers();
      } catch (err) {
        console.error('Failed to fetch users:', err);
      }
    })();
  }, []);

  const handleAssignTeam = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user && selectedTeam) {
      updateUser(userId, {
        displayName: user.displayName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        password: user.password || '',
        role: user.role,
        status: user.status,
        team_id: selectedTeam,
      });
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const filteredUsers = users.filter(user =>
    user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Assign Team</h1>
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="team-select" className="form-label">Select Team</label>
              <select
                id="team-select"
                className="form-input"
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
              >
                <option value="">Select a team</option>
                {teams.map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="search" className="form-label">Search Users</label>
              <input
                id="search"
                type="text"
                className="form-input"
                placeholder="Search by name or email"
                value={searchTerm}
                onChange={handleSearch}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="table-container">
          {loading ? (
            <div className="text-center text-gray-400 p-6">Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center text-gray-400 p-6">No users found.</div>
          ) : (
            <table className="data-table">
              <thead className="bg-gray-700">
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Current Team</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredUsers.map((user) => {
                  const userTeam = teams.find(team => team.id === user.team_id);
                  return (
                    <tr key={user.id}>
                      <td>{user.displayName}</td>
                      <td>{user.email}</td>
                      <td>{user.role}</td>
                      <td>{userTeam ? userTeam.name : 'None'}</td>
                      <td>
                        <button
                          disabled={!selectedTeam}
                          onClick={() => handleAssignTeam(user.id)}
                          className="btn btn-primary py-1 px-3 text-sm"
                        >
                          Assign Team
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default AssignTeamPage;
