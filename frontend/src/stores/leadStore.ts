import { create } from 'zustand';
import axiosInstance from '../utils/axiosConfig';
import { useToastStore } from './toastStore';

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
  customerId?: number | string | null;
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

const mapLead = (lead: any): Lead => ({
  ...lead,
  fullName: lead.full_name ?? lead.fullName,
  altNumber: lead.alt_number ?? lead.altNumber,
  deematAccountName: lead.deemat_account_name ?? lead.deematAccountName,
  profession: lead.profession,
  stateName: lead.state_name ?? lead.stateName,
  capital: lead.capital,
  segment: lead.segment,
  wonOn: lead.won_on ?? lead.wonOn,
  gender: lead.gender,
  dob: lead.dob,
  age: lead.age,
  panCardNumber: lead.pan_card_number ?? lead.panCardNumber,
  aadharCardNumber: lead.aadhar_card_number ?? lead.aadharCardNumber,
  paymentHistory: lead.payment_history ?? lead.paymentHistory,
  customerId: lead.customer_id ?? lead.customerId ?? null,
  notes: lead.notes || '',
  assigned_user_name: lead.assigned_user_name,
  assigned_user_role: lead.assigned_user_role,
  assignedAt: lead.assigned_at ?? lead.assignedAt,
  tags: lead.tags || '',
  language: lead.language || '',
  metaLeadId: lead.meta_lead_id || lead.metaLeadId || '',
  metaFormId: lead.meta_form_id || lead.metaFormId || '',
  metaFormName: lead.meta_form_name || lead.metaFormName || '',
  metaSource: lead.meta_source || lead.metaSource || '',
  ctwaClid: lead.ctwa_clid || lead.ctwaClid || '',
  metaAdId: lead.meta_ad_id || lead.metaAdId || '',
  waId: lead.wa_id || lead.waId || '',
  status: lead.status,
  team_id: lead.team_id,
  assigned_to: lead.assigned_to,
  phone: lead.phone,
  email: lead.email,
  id: lead.id,
  date: lead.date,
});

interface LeadStore {
  leads: Lead[];
  paidClients: Lead[];
  loading: boolean;
  paidClientsLoading: boolean;
  fetchLeads: () => Promise<void>;
  fetchPaidClients: () => Promise<void>;
  addLead: (lead: Omit<Lead, 'id'>) => Promise<void>;
  updateLead: (id: string, lead: Omit<Lead, 'id'>) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;
  uploadLeads: (file: File) => Promise<void>;
}

export const useLeadStore = create<LeadStore>((set, get) => ({
  leads: [],
  paidClients: [],
  loading: false,
  paidClientsLoading: false,

  fetchLeads: async () => {
    set({ loading: true });
    try {
      const { data } = await axiosInstance.get('/leads');
      set({ leads: data.map(mapLead) });
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    } finally {
      set({ loading: false });
    }
  },

  fetchPaidClients: async () => {
    set({ paidClientsLoading: true });
    try {
      const { data } = await axiosInstance.get('/leads/paid-clients');
      set({ paidClients: data.map(mapLead) });
    } catch (err) {
      console.error('Failed to fetch paid clients:', err);
    } finally {
      set({ paidClientsLoading: false });
    }
  },

  addLead: async (lead) => {
    const addToast = useToastStore.getState().addToast;
    try {
      await axiosInstance.post('/leads', lead);
      await get().fetchLeads();
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
      await Promise.all([get().fetchLeads(), get().fetchPaidClients()]);
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
      await Promise.all([get().fetchLeads(), get().fetchPaidClients()]);
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
      await get().fetchLeads();
      addToast('Leads uploaded successfully', 'success');
    } catch (err) {
      console.error('Failed to upload leads:', err);
      addToast('Failed to upload leads', 'error');
    }
  },
}));
