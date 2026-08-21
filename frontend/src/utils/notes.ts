export type NoteEntry = {
  status: string;
  note: string;
  timestamp: string;
  rmName: string;
};

const LEAD_STATUSES = new Set([
  'Busy',
  'Call Back With Presentation',
  'Call Back Without Presentation',
  'Call Disconnected',
  'Counselling Call',
  'Disconnected Call',
  'Do Not disturb',
  'Equity trader',
  'Follow Up',
  'Follow Up-No Response',
  'Free Trial',
  'Free Trial – Follow Up',
  'Incoming Calls Not Allowed',
  'Invalid Number',
  'Language Barrier',
  'Less Funds',
  'Loss Client',
  'Low Capital',
  'No Capital',
  'No DMAT',
  'No Response',
  'Non Trader',
  'Not Connected',
  'Not Interested',
  'Not Reachable',
  'Out Of Service',
  'Paid Client',
  'Promise To Pay',
  'Ringing',
  'Summarization Call',
  'Switched Off',
  'Wrong No',
  'Free Trial – Follow Up',
  'Follow Up (No Response)',
  'Do Not Disturb',
  'Equity Client',
  'New',
  'Won',
  'Contacted',
  'Qualified',
  'Proposal',
  'Lost',
]);

const isLeadStatus = (value: string) => LEAD_STATUSES.has(value);

const stripAutoMetaNote = (note: string) => {
  if (/click-to-whatsapp|source:\s*ctwa/i.test(note)) return '';
  if (/whatsapp inbound lead|source:\s*whatsapp/i.test(note)) return '';
  return note;
};

const sanitizeRmName = (name: string) => name.replace(/__/g, ' ').trim() || '—';

const rmFromParts = (parts: string[]) => {
  if (parts.length >= 4 && parts[3]?.trim()) {
    return sanitizeRmName(parts[3]);
  }
  return '—';
};

export const parseLeadNotes = (notes: string): NoteEntry[] => {
  if (!notes) return [];

  return notes
    .split('||')
    .filter((entry) => entry.trim() !== '')
    .reverse()
    .map((entry) => {
      const parts = entry.split('__');

      if (parts.length >= 4 && isLeadStatus(parts[0])) {
        return {
          status: parts[0] || '—',
          note: parts[1] || '—',
          timestamp: parts[2] || '—',
          rmName: rmFromParts(parts),
        };
      }

      if (parts.length >= 3 && isLeadStatus(parts[0])) {
        return {
          status: parts[0] || '—',
          note: parts[1] || '—',
          timestamp: parts[2] || '—',
          rmName: '—',
        };
      }

      if (parts.length >= 3) {
        return {
          status: parts[1] || '—',
          note: parts[0] || '—',
          timestamp: parts[2] || '—',
          rmName: '—',
        };
      }

      return {
        status: '—',
        note: parts[0] || '—',
        timestamp: '—',
        rmName: '—',
      };
    });
};

export type NoteHistoryEntry = {
  note: string;
  status: string;
  date: string;
  rmName?: string;
  isNew?: boolean;
};

export const parseNoteHistory = (notes: string): NoteHistoryEntry[] => {
  if (!notes) return [];

  return notes
    .split('||')
    .filter((entry) => entry.trim() !== '')
    .map((entry) => {
      const parts = entry.split('__');

      if (parts.length >= 4 && isLeadStatus(parts[0])) {
        return {
          status: parts[0],
          note: stripAutoMetaNote(parts[1] || ''),
          date: parts[2] || new Date().toISOString(),
          rmName: rmFromParts(parts),
          isNew: false,
        };
      }

      if (parts.length >= 3 && isLeadStatus(parts[0])) {
        return {
          status: parts[0],
          note: stripAutoMetaNote(parts[1] || ''),
          date: parts[2] || new Date().toISOString(),
          rmName: '—',
          isNew: false,
        };
      }

      if (parts.length >= 3) {
        return {
          status: parts[1] || 'New',
          note: stripAutoMetaNote(parts[0] || ''),
          date: parts[2] || new Date().toISOString(),
          rmName: '—',
          isNew: false,
        };
      }

      return {
        status: 'New',
        note: stripAutoMetaNote(parts[0] || ''),
        date: new Date().toISOString(),
        rmName: '—',
        isNew: false,
      };
    });
};

export const formatLeadNotes = (
  entries: NoteHistoryEntry[],
  defaultRmName: string
): string => {
  const sanitized = entries.filter((entry) => entry.note.trim() !== '' || entry.status);
  const reversed = [...sanitized].reverse();
  const rmDefault = sanitizeRmName(defaultRmName);

  return reversed
    .map((entry) => {
      const existingRm =
        entry.rmName && entry.rmName.trim() && entry.rmName !== '—'
          ? sanitizeRmName(entry.rmName)
          : '';
      const rm = existingRm || (entry.isNew ? rmDefault : '—');
      return `${entry.status}__${entry.note.trim()}__${entry.date}__${rm}`;
    })
    .join('||');
};
