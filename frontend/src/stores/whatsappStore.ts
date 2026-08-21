import { create } from 'zustand';
import axiosInstance from '../utils/axiosConfig';

export interface WhatsAppConversation {
  id: string;
  wa_id: string;
  phone: string | null;
  lead_id: string | null;
  contact_name: string | null;
  last_message_at: string | null;
  last_customer_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  session_open: boolean;
  session_expires_at: string | null;
  lead_full_name?: string | null;
  lead_status?: string | null;
  ctwa_clid?: string | null;
}

export interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  wamid: string | null;
  direction: 'inbound' | 'outbound';
  type: string;
  body: string | null;
  graph_media_id: string | null;
  local_filename: string | null;
  mime_type: string | null;
  filename: string | null;
  status: string;
  error_message: string | null;
  template_name: string | null;
  template_language: string | null;
  wa_timestamp: string;
  created_at: string;
}

export interface WhatsAppTemplate {
  id?: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  components?: Array<{
    type: string;
    format?: string;
    text?: string;
    buttons?: Array<{ type: string; text?: string }>;
  }>;
}

interface WhatsAppState {
  conversations: WhatsAppConversation[];
  selectedId: string | null;
  conversation: WhatsAppConversation | null;
  messages: WhatsAppMessage[];
  templates: WhatsAppTemplate[];
  loading: boolean;
  sending: boolean;
  error: string | null;
  fetchConversations: (q?: string) => Promise<void>;
  selectConversation: (id: string | null) => Promise<void>;
  refreshSelected: () => Promise<void>;
  sendText: (body: string) => Promise<void>;
  sendMedia: (file: File, caption?: string) => Promise<void>;
  sendTemplate: (payload: {
    name: string;
    language: string;
    components?: unknown[];
    preview?: string;
  }) => Promise<void>;
  fetchTemplates: (force?: boolean) => Promise<void>;
}

export const useWhatsAppStore = create<WhatsAppState>((set, get) => ({
  conversations: [],
  selectedId: null,
  conversation: null,
  messages: [],
  templates: [],
  loading: false,
  sending: false,
  error: null,

  fetchConversations: async (q) => {
    try {
      const { data } = await axiosInstance.get('/whatsapp/conversations', {
        params: q ? { q } : undefined,
      });
      const conversations = data.conversations || [];
      const { selectedId, conversation } = get();
      const updatedSelected = selectedId
        ? conversations.find((c: WhatsAppConversation) => c.id === selectedId)
        : null;
      set({
        conversations,
        conversation: updatedSelected
          ? { ...conversation, ...updatedSelected }
          : conversation,
      });
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to load conversations' });
    }
  },

  selectConversation: async (id) => {
    set({ selectedId: id, error: null });
    if (!id) {
      set({ conversation: null, messages: [] });
      return;
    }
    set({ loading: true });
    try {
      const { data } = await axiosInstance.get(`/whatsapp/conversations/${id}/messages`);
      set({
        conversation: data.conversation,
        messages: data.messages || [],
        loading: false,
      });
      await get().fetchConversations();
    } catch (err: any) {
      set({
        loading: false,
        error: err.response?.data?.message || 'Failed to load messages',
      });
    }
  },

  refreshSelected: async () => {
    const { selectedId } = get();
    if (!selectedId) return;
    try {
      const { data } = await axiosInstance.get(
        `/whatsapp/conversations/${selectedId}/messages`
      );
      set({
        conversation: data.conversation,
        messages: data.messages || [],
      });
    } catch (err) {
      console.error('Failed to refresh WhatsApp thread', err);
    }
  },

  sendText: async (body) => {
    const { selectedId } = get();
    if (!selectedId) return;
    set({ sending: true, error: null });
    try {
      const { data } = await axiosInstance.post(
        `/whatsapp/conversations/${selectedId}/messages`,
        { body }
      );
      set((state) => ({
        sending: false,
        messages: [...state.messages, data.message],
        conversation: data.conversation || state.conversation,
      }));
      await get().fetchConversations();
    } catch (err: any) {
      set({
        sending: false,
        error: err.response?.data?.message || 'Failed to send message',
      });
      throw err;
    }
  },

  sendMedia: async (file, caption) => {
    const { selectedId } = get();
    if (!selectedId) return;
    set({ sending: true, error: null });
    try {
      const form = new FormData();
      form.append('file', file);
      if (caption) form.append('caption', caption);
      const { data } = await axiosInstance.post(
        `/whatsapp/conversations/${selectedId}/media`,
        form
      );
      set((state) => ({
        sending: false,
        messages: [...state.messages, data.message],
        conversation: data.conversation || state.conversation,
      }));
      await get().fetchConversations();
    } catch (err: any) {
      set({
        sending: false,
        error: err.response?.data?.message || 'Failed to send media',
      });
      throw err;
    }
  },

  sendTemplate: async (payload) => {
    const { selectedId } = get();
    if (!selectedId) return;
    set({ sending: true, error: null });
    try {
      const { data } = await axiosInstance.post(
        `/whatsapp/conversations/${selectedId}/template`,
        payload
      );
      set((state) => ({
        sending: false,
        messages: [...state.messages, data.message],
        conversation: data.conversation || state.conversation,
      }));
      await get().fetchConversations();
    } catch (err: any) {
      set({
        sending: false,
        error: err.response?.data?.message || 'Failed to send template',
      });
      throw err;
    }
  },

  fetchTemplates: async (force) => {
    try {
      const { data } = await axiosInstance.get('/whatsapp/templates', {
        params: force ? { refresh: 1 } : undefined,
      });
      set({ templates: data.templates || [] });
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to load templates' });
    }
  },
}));
