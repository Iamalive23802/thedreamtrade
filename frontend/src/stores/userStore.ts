import { create } from 'zustand';
import axiosInstance from '../utils/axiosConfig';
import { useToastStore } from './toastStore';

export interface User {
  id: string;
  displayName: string;
  email: string;
  phoneNumber: string;
  password?: string;
  role:
    | 'super_admin'
    | 'admin'
    | 'team_leader'
    | 'relationship_mgr'
    | 'financial_manager';
  status: 'Active' | 'Inactive';
  team_id?: string;
}

interface UserStore {
  users: User[];
  loading: boolean;
  fetchUsers: () => Promise<void>;
  addUser: (user: Omit<User, 'id'>) => Promise<void>;
  updateUser: (id: string, user: Omit<User, 'id'>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  bulkInactivateUsers: (userIds: string[]) => Promise<void>; // ✅ new
}

export const useUserStore = create<UserStore>((set) => ({
  users: [],
  loading: false,

  fetchUsers: async () => {
    set({ loading: true });
    try {
      const { data } = await axiosInstance.get('/users');
      const mapped = data.map((user: any) => ({
        ...user,
        displayName: user.display_name,
        phoneNumber: user.phone_number,
        password: user.password, // Include password field
      }));
      set({ users: mapped });
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      set({ loading: false });
    }
  },

  addUser: async (user) => {
    const addToast = useToastStore.getState().addToast;
    try {
      await axiosInstance.post('/users', user);
      await useUserStore.getState().fetchUsers();
      addToast('User added successfully', 'success');
    } catch (err: any) {
      console.error('Failed to add user:', err);
      const msg = err?.response?.data?.error || 'Failed to add user';
      addToast(msg, 'error');
      throw new Error(msg);
    }
  },

  updateUser: async (id, user) => {
    const addToast = useToastStore.getState().addToast;
    try {
      const payload: any = { ...user };
      if (!payload.password) {
        delete payload.password; // avoid clearing password when unchanged
      }
      await axiosInstance.put(`/users/${id}`, payload);
      await useUserStore.getState().fetchUsers();
      addToast('User updated successfully', 'success');
    } catch (err: any) {
      console.error('Failed to update user:', err);
      const msg = err?.response?.data?.error || 'Failed to update user';
      addToast(msg, 'error');
      throw new Error(msg);
    }
  },

  deleteUser: async (id) => {
    const addToast = useToastStore.getState().addToast;
    try {
      await axiosInstance.delete(`/users/${id}`);
      await useUserStore.getState().fetchUsers();
      addToast('User deleted successfully', 'success');
    } catch (err) {
      console.error('Failed to delete user:', err);
      addToast('Failed to delete user', 'error');
    }
  },

  bulkInactivateUsers: async (userIds) => {
    const addToast = useToastStore.getState().addToast;
    try {
      await axiosInstance.put('/users/bulk-inactivate', { userIds });
      await useUserStore.getState().fetchUsers();
      addToast('All selected users marked as inactive', 'success');
    } catch (err) {
      console.error('Failed to inactivate users:', err);
      addToast('Failed to inactivate users', 'error');
    }
  },
}));
