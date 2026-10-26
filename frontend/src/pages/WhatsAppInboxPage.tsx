import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCheck, ChevronLeft, MessageCircle, Paperclip, Search, Send } from 'lucide-react';
import moment from 'moment';
import { useWhatsAppStore } from '../stores/whatsappStore';
import { useToastStore } from '../stores/toastStore';
import WhatsAppMedia from '../components/whatsapp/WhatsAppMedia';
import TemplatePicker from '../components/whatsapp/TemplatePicker';

function formatSession(expiresAt: string | null | undefined, open: boolean) {
  if (!open || !expiresAt) return 'Use a template to message';
  const remaining = moment(expiresAt).diff(moment());
  if (remaining <= 0) return 'Use a template to message';
  const duration = moment.duration(remaining);
  return `Session open ${Math.floor(duration.asHours())}h ${duration.minutes()}m`;
}

function statusTicks(status: string) {
  if (status === 'failed') return <span className="text-red-400 text-xs">Failed</span>;
  if (status === 'read') return <CheckCheck size={14} className="text-blue-400" />;
  if (status === 'delivered') return <CheckCheck size={14} className="text-gray-300" />;
  return <Check size={14} className="text-gray-400" />;
}

function WhatsAppInboxPage() {
  const {
    conversations, selectedId, conversation, messages, templates, loading, sending, error,
    fetchConversations, selectConversation, refreshSelected, sendText, sendMedia, sendTemplate, fetchTemplates,
  } = useWhatsAppStore();
  const addToast = useToastStore((state) => state.addToast);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [templateOpen, setTemplateOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shouldStick = useRef(true);

  useEffect(() => {
    fetchConversations();
    fetchTemplates();
    const timer = setInterval(() => {
      fetchConversations(query || undefined);
      refreshSelected();
    }, 3000);
    return () => clearInterval(timer);
  }, [fetchConversations, fetchTemplates, refreshSelected, query]);

  useEffect(() => {
    if (!shouldStick.current) return;
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, selectedId]);

  const sessionLabel = useMemo(
    () => formatSession(conversation?.session_expires_at, !!conversation?.session_open),
    [conversation?.session_expires_at, conversation?.session_open]
  );

  const submitText = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    try {
      await sendText(body);
      setDraft('');
      shouldStick.current = true;
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to send', 'error');
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await sendMedia(file, draft.trim() || undefined);
      setDraft('');
      shouldStick.current = true;
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to send media', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="flex h-full bg-canvas text-white">
      <aside className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-line md:w-80`}>
        <div className="p-4 border-b border-line">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <MessageCircle size={18} />
            WhatsApp
          </h2>
          <div className="relative mt-3">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
            <input
              className="form-input pl-8"
              placeholder="Search chats"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                fetchConversations(e.target.value);
              }}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="p-4 text-sm text-gray-500">No chats yet. New WhatsApp messages will appear here.</p>
          )}
          {conversations.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                shouldStick.current = true;
                selectConversation(item.id);
              }}
              className={`w-full border-b border-line px-4 py-3 text-left transition-colors hover:bg-surface ${
                selectedId === item.id ? 'bg-surface' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{item.contact_name || item.phone || item.wa_id}</span>
                <span className="text-xs text-gray-500 shrink-0">
                  {item.last_message_at ? moment(item.last_message_at).fromNow() : ''}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <p className="text-xs text-gray-400 truncate">{item.last_message_preview || 'No messages'}</p>
                {item.unread_count > 0 && (
                  <span className="bg-blue-500 text-white text-xs rounded-full min-w-[1.25rem] h-5 px-1 flex items-center justify-center">
                    {item.unread_count}
                  </span>
                )}
              </div>
              {item.ctwa_clid && (
                <span className="inline-block mt-1 text-[10px] uppercase tracking-wide text-green-400">CTWA</span>
              )}
            </button>
          ))}
        </div>
      </aside>

      <section className={`${selectedId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {!conversation ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">Select a conversation</div>
        ) : (
          <>
            <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-3 md:px-5">
              <button
                type="button"
                className="icon-btn shrink-0 md:hidden"
                aria-label="Back to chats"
                onClick={() => selectConversation(null)}
              >
                <ChevronLeft size={18} />
              </button>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold truncate">
                  {conversation.contact_name || conversation.phone || conversation.wa_id}
                </h3>
                <p className="text-xs text-gray-400">
                  {conversation.phone || conversation.wa_id}
                  {conversation.lead_id && (
                    <>
                      {' · '}
                      <Link className="text-blue-300 hover:underline" to={`/leads?leadId=${conversation.lead_id}`}>
                        Open lead{conversation.lead_status ? ` (${conversation.lead_status})` : ''}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <span className={`text-xs shrink-0 ${conversation.session_open ? 'text-green-400' : 'text-amber-400'}`}>
                {sessionLabel}
              </span>
            </header>
            <div
              ref={threadRef}
              onScroll={() => {
                const el = threadRef.current;
                if (!el) return;
                shouldStick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              className="flex-1 overflow-y-auto p-4 space-y-3"
            >
              {loading && messages.length === 0 && <p className="text-sm text-gray-500">Loading messages…</p>}
              {messages.map((message) => {
                const mine = message.direction === 'outbound';
                return (
                  <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 ${mine ? 'bg-primary' : 'bg-surface'}`}>
                      {['image', 'audio', 'video', 'document', 'sticker'].includes(message.type) && (
                        <WhatsAppMedia message={message} />
                      )}
                      {message.body && <p className="text-sm whitespace-pre-wrap break-words mt-1">{message.body}</p>}
                      {message.type === 'template' && !message.body && (
                        <p className="text-sm italic">Template: {message.template_name}</p>
                      )}
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[10px] text-gray-300">{moment(message.wa_timestamp).format('HH:mm')}</span>
                        {mine && statusTicks(message.status)}
                      </div>
                      {message.status === 'failed' && message.error_message && (
                        <p className="text-[11px] text-red-200 mt-1">{message.error_message}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {error && <div className="px-4 py-2 text-sm text-red-300 border-t border-line">{error}</div>}
            <footer className="p-3 border-t border-line">
              <div className="flex items-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setTemplateOpen(true)}>
                  Template
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  aria-label="Attach file"
                  disabled={!conversation.session_open || sending}
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip size={16} />
                </button>
                <textarea
                  className="form-input resize-none min-h-[44px] max-h-32"
                  rows={2}
                  placeholder={conversation.session_open ? 'Type a message' : 'Session closed — send a template'}
                  value={draft}
                  disabled={!conversation.session_open}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitText();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!conversation.session_open || sending || !draft.trim()}
                  onClick={submitText}
                >
                  <Send size={16} />
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ogg,.mp3,.m4a"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </footer>
          </>
        )}
      </section>
      <TemplatePicker
        open={templateOpen}
        templates={templates}
        sending={sending}
        onClose={() => setTemplateOpen(false)}
        onRefresh={() => fetchTemplates(true)}
        onSend={async (payload) => {
          try {
            await sendTemplate(payload);
            shouldStick.current = true;
          } catch (err: any) {
            addToast(err.response?.data?.message || 'Failed to send template', 'error');
            throw err;
          }
        }}
      />
    </div>
  );
}

export default WhatsAppInboxPage;
