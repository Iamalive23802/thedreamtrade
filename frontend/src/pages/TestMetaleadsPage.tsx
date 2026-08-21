import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, FlaskConical } from 'lucide-react';
import { useLeadStore } from '../stores/leadStore';

const FORM_NAME_FALLBACK: Record<string, string> = {
  '1039451381794500': 'MH - JULY 17 - FORM',
};

function parseMetaNotes(notes: string = '') {
  const leadIdMatch = notes.match(/Lead ID:\s*([^\s|]+)/i);
  const formNameMatch = notes.match(/Form Name:\s*([^|]+)/i);
  const formIdMatch = notes.match(/Form:\s*([^\s|]+)/i);
  const sourceMatch = notes.match(/Source:\s*([^|]+)/i);
  const ctwaMatch = notes.match(/CTWA CLID:\s*([^\s|]+)/i);
  const adMatch = notes.match(/Ad:\s*([^\s|]+)/i);
  const formId = formIdMatch?.[1]?.trim() || '';
  const formName =
    formNameMatch?.[1]?.trim() ||
    (formId ? FORM_NAME_FALLBACK[formId] : '') ||
    '';

  return {
    metaLeadId: leadIdMatch?.[1]?.trim() || '',
    formId,
    formName: formName || formId || '',
    source:
      sourceMatch?.[1]?.trim() ||
      (notes.toLowerCase().includes('messenger') ? 'Messenger' : '') ||
      (notes.toLowerCase().includes('ctwa') || notes.toLowerCase().includes('click-to-whatsapp')
        ? 'CTWA'
        : ''),
    ctwaClid: ctwaMatch?.[1]?.trim() || '',
    adId: adMatch?.[1]?.trim() || '',
  };
}

function TestMetaleadsPage() {
  const { leads, loading, fetchLeads } = useLeadStore();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const load = async () => {
    await fetchLeads();
    setLastRefreshed(new Date());
  };

  useEffect(() => {
    load();
  }, []);

  const metaLeads = useMemo(() => {
    return leads
      .filter((lead) => {
        const tags = (lead.tags || '').toLowerCase();
        const notes = (lead.notes || '').toLowerCase();
        const source = (lead.metaSource || '').toLowerCase();
        return (
          !!lead.metaLeadId ||
          !!lead.ctwaClid ||
          !!lead.metaSource ||
          source.includes('ctwa') ||
          tags.includes('facebook') ||
          tags.includes('messenger') ||
          tags.includes('ctwa') ||
          tags.includes('whatsapp') ||
          notes.includes('facebook lead ads') ||
          notes.includes('facebook messenger lead') ||
          notes.includes('click-to-whatsapp') ||
          notes.includes('ctwa clid:') ||
          notes.includes('lead id:')
        );
      })
      .map((lead) => {
        const fromNotes = parseMetaNotes(lead.notes || '');
        const formId = lead.metaFormId || fromNotes.formId || '';
        const formName =
          lead.metaFormName ||
          fromNotes.formName ||
          FORM_NAME_FALLBACK[formId] ||
          formId ||
          '';
        return {
          ...lead,
          metaLeadId: lead.metaLeadId || fromNotes.metaLeadId || '',
          ctwaClid: lead.ctwaClid || fromNotes.ctwaClid || '',
          metaAdId: lead.metaAdId || fromNotes.adId || '',
          formId,
          formName,
          source: lead.metaSource || fromNotes.source || 'Instant Form',
        };
      })
      .sort((a, b) => {
        const aTime = a.date ? new Date(a.date).getTime() : 0;
        const bTime = b.date ? new Date(b.date).getTime() : 0;
        return bTime - aTime;
      });
  }, [leads]);

  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical size={22} />
            TestMetaleads
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Facebook Instant Form, Messenger, and CTWA (Click-to-WhatsApp) leads
          </p>
        </div>
        <button
          className="btn btn-primary flex items-center"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw size={18} className={`mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {lastRefreshed && (
        <p className="text-sm text-gray-500 mb-4">
          Last refreshed: {lastRefreshed.toLocaleString()}
        </p>
      )}

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="table-container max-h-[70vh] overflow-y-auto">
          <table className="data-table">
            <thead className="bg-gray-900 sticky top-0">
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Source</th>
                <th>Meta Lead ID</th>
                <th>CTWA Click ID</th>
                <th>Form / Ad</th>
                <th>Status</th>
                <th>Tags</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {loading && metaLeads.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center text-gray-400 py-8">
                    Loading…
                  </td>
                </tr>
              ) : metaLeads.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center text-gray-400 py-8">
                    No Meta / Facebook / CTWA leads yet.
                  </td>
                </tr>
              ) : (
                metaLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td>{lead.date ? new Date(lead.date).toLocaleString() : '—'}</td>
                    <td>{lead.fullName || '—'}</td>
                    <td>{lead.phone || '—'}</td>
                    <td>{lead.email || '—'}</td>
                    <td>{lead.source || '—'}</td>
                    <td className="font-mono text-xs">{lead.metaLeadId || '—'}</td>
                    <td
                      className="font-mono text-xs max-w-[140px] truncate"
                      title={lead.ctwaClid || undefined}
                    >
                      {lead.ctwaClid ? `${lead.ctwaClid.slice(0, 12)}…` : '—'}
                    </td>
                    <td
                      title={
                        lead.formId
                          ? `Form ID: ${lead.formId}`
                          : lead.metaAdId
                            ? `Ad ID: ${lead.metaAdId}`
                            : undefined
                      }
                    >
                      {lead.formName || lead.metaAdId || '—'}
                    </td>
                    <td>{lead.status || '—'}</td>
                    <td>{lead.tags || '—'}</td>
                    <td className="max-w-xs truncate" title={lead.notes}>
                      {lead.notes || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-sm text-gray-500 mt-3">{metaLeads.length} Meta lead(s)</p>
    </div>
  );
}

export default TestMetaleadsPage;
