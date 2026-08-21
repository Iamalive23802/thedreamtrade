import { create } from 'zustand';
import axiosInstance from '../utils/axiosConfig';
import { isNetworkRestrictedError } from '../utils/networkAccess';

type Role = 'super_admin' | 'admin' | 'team_leader' | 'relationship_mgr' | 'financial_manager' | '';

interface AuthState {
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  role: Role;
  userId: string;
  displayName: string;
  token: string;
  login: (email: string, password: string) => Promise<number>;
  logout: () => void;
  checkAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: sessionStorage.getItem('isAuthenticated') === 'true',
  role: (sessionStorage.getItem('role')?.toLowerCase() as Role) || '',
  userId: sessionStorage.getItem('userId') || '',
  displayName: sessionStorage.getItem('displayName') || '',
  token: sessionStorage.getItem('token') || '',
  loading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const res = await axiosInstance.post('/auth/login', { email, password });
      const { user, token, newLeadsCount } = res.data;

      // ✅ Block login if user is inactive
      if (user.status?.toLowerCase() !== 'active') {
        set({
          loading: false,
          error: 'User is inactive. Please contact the administrator.'
        });
        return;
      }

      sessionStorage.setItem('isAuthenticated', 'true');
      sessionStorage.setItem('role', user.role);
      sessionStorage.setItem('userId', user.id);
      sessionStorage.setItem('displayName', user.displayName);
      sessionStorage.setItem('token', token);
      // Always store newLeadsCount (even if 0) for login notification
      sessionStorage.setItem('newLeadsCount', (newLeadsCount || 0).toString());

      set({
        isAuthenticated: true,
        role: user.role,
        userId: user.id,
        displayName: user.displayName,
        token,
        loading: false,
        error: null
      });

      // Return newLeadsCount for notification
      return newLeadsCount || 0;
    } catch (err: any) {
      if (isNetworkRestrictedError(err)) {
        window.location.href = '/office-only';
        return 0;
      }

      set({
        loading: false,
        error: err.response?.data?.message || 'Login failed'
      });
      throw err;
    }
  },

  logout: () => {
    sessionStorage.clear();
    set({
      isAuthenticated: false,
      role: '',
      userId: '',
      displayName: '',
      token: '',
      loading: false,
      error: null
    });
  },

  checkAuth: () => {
    const isAuthenticated = sessionStorage.getItem('isAuthenticated') === 'true';
    const role = (sessionStorage.getItem('role')?.toLowerCase() as Role) || '';
    const userId = sessionStorage.getItem('userId') || '';
    const displayName = sessionStorage.getItem('displayName') || '';
    const token = sessionStorage.getItem('token') || '';

    set({
      isAuthenticated,
      role,
      userId,
      displayName,
      token
    });
  }
}));
