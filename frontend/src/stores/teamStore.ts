import { create } from 'zustand';
import axiosInstance from '../utils/axiosConfig';
import { useToastStore } from './toastStore'; 

export interface Team {
  id: string;
  name: string;
}

interface TeamStore {
  teams: Team[];
  loading: boolean;
  fetchTeams: () => Promise<void>;
  addTeam: (team: Omit<Team, 'id'>) => Promise<void>;
  updateTeam: (id: string, team: Omit<Team, 'id'>) => Promise<void>;
  deleteTeam: (id: string) => Promise<void>;
}

export const useTeamStore = create<TeamStore>((set) => ({
  teams: [],
  loading: false,

  fetchTeams: async () => {
    set({ loading: true });
    try {
      const { data } = await axiosInstance.get('/teams');
      set({ teams: data });
    } catch (err) {
      console.error('Failed to fetch teams:', err);
    } finally {
      set({ loading: false });
    }
  },

  addTeam: async (team) => {
    const addToast = useToastStore.getState().addToast;
    try {
      await axiosInstance.post('/teams', team);
      await useTeamStore.getState().fetchTeams();
      addToast('Team added successfully', 'success');
    } catch (err) {
      console.error('Failed to add team:', err);
      addToast('Failed to add team', 'error');
    }
  },

  updateTeam: async (id, team) => {
    const addToast = useToastStore.getState().addToast;
    try {
      await axiosInstance.put(`/teams/${id}`, team);
      await useTeamStore.getState().fetchTeams();
      addToast('Team updated successfully', 'success');
    } catch (err) {
      console.error('Failed to update team:', err);
      addToast('Failed to update team', 'error');
    }
  },

  deleteTeam: async (id) => {
    const addToast = useToastStore.getState().addToast;
    try {
      await axiosInstance.delete(`/teams/${id}`);
      await useTeamStore.getState().fetchTeams();
      addToast('Team deleted successfully', 'success');
    } catch (err) {
      console.error('Failed to delete team:', err);
      addToast('Failed to delete team', 'error');
    }
  },
}));
