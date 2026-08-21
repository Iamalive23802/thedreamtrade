import { create } from 'zustand';
import axiosInstance from '../utils/axiosConfig';
import { useToastStore } from './toastStore';
import { useAuthStore } from './authStore';

export interface Lead {
  id: string;
  date?: string; 
  fullName: string;
  phone: string;
  email: string;
  altNumber: string;
  notes: string;
  deematAccountName: string;
  profession: string;
  stateName: string;
  capital: string;
  segment: string;
  wonOn?: string;
  gender?: string;
  dob?: string;
  age?: string;
  panCardNumber?: string;
  aadharCardNumber?: string;
  paymentHistory?: string;
  status: 'New' | 'Free Trial' | 'Free Trial – Follow Up' | 'Follow Up (No Response)' | 'Promise To Pay' | 'Paid Client' | 'Follow Up' | 'Call Back With Presentation' | 'Call Back Without Presentation' | 'Not Interested' | 'Non Trader' | 'Less Funds' | 'Language Barrier' | 'Disconnected Call' | 'Switched Off' | 'Ringing' | 'Not Reachable' | 'Out Of Service' | 'Busy' | 'Incoming Calls Not Allowed' | 'Invalid Number' | 'Loss Client' | 'Won' | 'Do Not Disturb' | 'Summarization Call' | 'Counselling Call' | 'Equity Client';
  team_id: string;
  assigned_to?: string;
  assigned_user_name?: string;
  assigned_user_role?: string;
  assignedAt?: string;
  tags?: string;
  language?: string;
  metaLeadId?: string;
  metaFormId?: string;
  metaFormName?: string;
  metaSource?: string;
  ctwaClid?: string;
  metaAdId?: string;
  waId?: string;
}

interface LeadStore {
  leads: Lead[];
  loading: boolean;
  fetchLeads: () => Promise<void>;
  addLead: (lead: Omit<Lead, 'id'>) => Promise<void>;
  updateLead: (id: string, lead: Omit<Lead, 'id'>) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;
  uploadLeads: (file: File) => Promise<void>;
}

export const useLeadStore = create<LeadStore>((set) => ({
  leads: [],
  loading: false,

  fetchLeads: async () => {
    set({ loading: true });
    try {
      const { data } = await axiosInstance.get('/leads');
      const mapped = data.map((lead: any) => ({
        ...lead,
        fullName: lead.full_name,
        altNumber: lead.alt_number,
        deematAccountName: lead.deemat_account_name,
        profession: lead.profession,
        stateName: lead.state_name,
        capital: lead.capital,
        segment: lead.segment,
        wonOn: lead.won_on,
        gender: lead.gender,
        dob: lead.dob,
        age: lead.age,
        panCardNumber: lead.pan_card_number,
        aadharCardNumber: lead.aadhar_card_number,
        paymentHistory: lead.payment_history,
        assigned_user_name: lead.assigned_user_name,
        assigned_user_role: lead.assigned_user_role,
        assignedAt: lead.assigned_at,
        tags: lead.tags || '',
        language: lead.language || '',
        metaLeadId: lead.meta_lead_id || '',
        metaFormId: lead.meta_form_id || '',
        metaFormName: lead.meta_form_name || '',
        metaSource: lead.meta_source || '',
        ctwaClid: lead.ctwa_clid || '',
        metaAdId: lead.meta_ad_id || '',
        waId: lead.wa_id || '',
      }));
      set({ leads: mapped });
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    } finally {
      set({ loading: false });
    }
  },

  addLead: async (lead) => {
    const addToast = useToastStore.getState().addToast;
    try {
      await axiosInstance.post('/leads', lead);
      await useLeadStore.getState().fetchLeads();
      addToast('Lead added successfully', 'success');
    } catch (err) {
      console.error('Failed to add lead:', err);
      addToast('Failed to add lead', 'error');
    }
  },

  updateLead: async (id, lead) => {
    const addToast = useToastStore.getState().addToast;
    try {
      await axiosInstance.put(`/leads/${id}`, lead);
      await useLeadStore.getState().fetchLeads();
      addToast('Lead updated successfully', 'success');
    } catch (err) {
      console.error('Failed to update lead:', err);
      addToast('Failed to update lead', 'error');
    }
  },

  deleteLead: async (id) => {
    const addToast = useToastStore.getState().addToast;
    try {
      await axiosInstance.delete(`/leads/${id}`);
      await useLeadStore.getState().fetchLeads();
      addToast('Lead deleted successfully', 'success');
    } catch (err) {
      console.error('Failed to delete lead:', err);
      addToast('Failed to delete lead', 'error');
    }
  },

  uploadLeads: async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const addToast = useToastStore.getState().addToast;
    try {
      await axiosInstance.post('/leads/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await useLeadStore.getState().fetchLeads();
      addToast('Leads uploaded successfully', 'success');
    } catch (err) {
      console.error('Failed to upload leads:', err);
      addToast('Failed to upload leads', 'error');
    }
  },
}));
