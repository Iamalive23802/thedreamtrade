import { useEffect, useMemo, useState } from 'react';
import type { WhatsAppTemplate } from '../../stores/whatsappStore';

function variableCount(text?: string) {
  if (!text) return 0;
  const matches = text.match(/\{\{\d+\}\}/g);
  return matches ? matches.length : 0;
}

function TemplatePicker({
  open,
  templates,
  sending,
  onClose,
  onSend,
  onRefresh,
}: {
  open: boolean;
  templates: WhatsAppTemplate[];
  sending: boolean;
  onClose: () => void;
  onSend: (payload: {
    name: string;
    language: string;
    components?: unknown[];
    preview?: string;
  }) => Promise<void>;
  onRefresh: () => void;
}) {
  const [selectedName, setSelectedName] = useState('');
  const [language, setLanguage] = useState('');
  const [params, setParams] = useState<string[]>([]);

  const selected = useMemo(
    () =>
      templates.find(
        (t) => t.name === selectedName && (!language || t.language === language)
      ) || templates.find((t) => t.name === selectedName),
    [templates, selectedName, language]
  );

  const bodyComponent = selected?.components?.find(
    (c) => String(c.type).toUpperCase() === 'BODY'
  );
  const headerComponent = selected?.components?.find(
    (c) => String(c.type).toUpperCase() === 'HEADER'
  );
  const bodyVars = variableCount(bodyComponent?.text);
  const headerVars =
    String(headerComponent?.format || '').toUpperCase() === 'TEXT'
      ? variableCount(headerComponent?.text)
      : 0;

  useEffect(() => {
    setParams(Array.from({ length: bodyVars + headerVars }, () => ''));
  }, [selected?.name, selected?.language, bodyVars, headerVars]);

  if (!open) return null;

  const submit = async () => {
    if (!selected) return;
    const components: Array<{ type: string; parameters: Array<{ type: string; text: string }> }> = [];
    let cursor = 0;
    if (headerVars > 0) {
      components.push({
        type: 'header',
        parameters: params.slice(0, headerVars).map((text) => ({ type: 'text', text })),
      });
      cursor = headerVars;
    }
    if (bodyVars > 0) {
      components.push({
        type: 'body',
        parameters: params.slice(cursor, cursor + bodyVars).map((text) => ({ type: 'text', text })),
      });
    }
    await onSend({
      name: selected.name,
      language: selected.language,
      components,
      preview: bodyComponent?.text || selected.name,
    });
    onClose();
  };

  const names = Array.from(new Set(templates.map((t) => t.name)));
  const languages = templates.filter((t) => t.name === selectedName).map((t) => t.language);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Send template</h3>
          <button className="text-gray-400 hover:text-white" onClick={onClose}>Close</button>
        </div>
        <div className="form-group">
          <label className="form-label">Template</label>
          <select
            className="form-input"
            value={selectedName}
            onChange={(e) => {
              setSelectedName(e.target.value);
              const first = templates.find((t) => t.name === e.target.value);
              setLanguage(first?.language || '');
            }}
          >
            <option value="">Select a template</option>
            {names.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        {languages.length > 1 && (
          <div className="form-group">
            <label className="form-label">Language</label>
            <select className="form-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {languages.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
        )}
        {selected && (
          <p className="text-sm text-gray-400 mb-3 whitespace-pre-wrap">
            {bodyComponent?.text || 'No body preview'}
          </p>
        )}
        {params.map((value, index) => (
          <div className="form-group" key={index}>
            <label className="form-label">Variable {index + 1}</label>
            <input
              className="form-input"
              value={value}
              onChange={(e) => {
                const next = [...params];
                next[index] = e.target.value;
                setParams(next);
              }}
            />
          </div>
        ))}
        <div className="flex justify-between items-center mt-4">
          <button className="text-sm text-blue-300" onClick={onRefresh} type="button">Refresh templates</button>
          <button className="btn btn-primary" disabled={!selected || sending} onClick={submit} type="button">
            {sending ? 'Sending…' : 'Send template'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TemplatePicker;
