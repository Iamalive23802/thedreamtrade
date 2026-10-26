const { isNotConnectedStatus } = require('./leadStatusRules');

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

const isLeadStatus = (value) => LEAD_STATUSES.has(value);

const sanitizeRmName = (name) => (name || '').replace(/__/g, ' ').trim() || '—';

/**
 * When a lead is reassigned, stamp legacy note rows (without RM name)
 * with the previous RM so history stays accurate for the new assignee.
 */
const backfillLegacyRmNames = (notes, previousRmName) => {
  if (!notes || !previousRmName) return notes || '';

  const rm = sanitizeRmName(previousRmName);
  if (rm === '—') return notes;

  return notes
    .split('||')
    .filter((entry) => entry.trim() !== '')
    .map((entry) => {
      const parts = entry.split('__');

      if (parts.length >= 4 && isLeadStatus(parts[0])) {
        return entry;
      }

      if (parts.length >= 3 && isLeadStatus(parts[0])) {
        return `${parts[0]}__${parts[1]}__${parts[2]}__${rm}`;
      }

      if (parts.length >= 3) {
        return `${parts[1]}__${parts[0]}__${parts[2]}__${rm}`;
      }

      return entry;
    })
    .join('||');
};

const splitNoteEntries = (notes) => {
  if (!notes || !String(notes).trim()) return [];
  return String(notes)
    .split('||')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const parseNoteEntryStatus = (entry) => {
  const parts = entry.split('__');
  if (parts.length >= 3 && isLeadStatus(parts[0])) return parts[0];
  if (parts.length >= 3 && isLeadStatus(parts[1])) return parts[1];
  return null;
};

const parseNoteEntryTimestamp = (entry) => {
  const parts = entry.split('__');
  if (parts.length >= 3 && isLeadStatus(parts[0])) return parts[2];
  if (parts.length >= 3) return parts[2];
  return null;
};

/**
 * Count note rows with a Not Connected status added during the current assignment.
 * Each NC note row counts (Option A), including repeated statuses like Ringing.
 */
const countNcNotesSinceAssignment = (notes, assignmentStartedAt) => {
  const startMs = assignmentStartedAt
    ? new Date(assignmentStartedAt).getTime()
    : null;

  let count = 0;
  for (const entry of splitNoteEntries(notes)) {
    const status = parseNoteEntryStatus(entry);
    if (!status || !isNotConnectedStatus(status)) continue;

    if (startMs != null && !Number.isNaN(startMs)) {
      const ts = parseNoteEntryTimestamp(entry);
      if (ts) {
        const entryMs = new Date(ts).getTime();
        if (!Number.isNaN(entryMs) && entryMs < startMs) continue;
      }
    }

    count += 1;
  }
  return count;
};

const parseNoteEntryRmName = (entry) => {
  const parts = String(entry || '').split('__');
  if (parts.length >= 4 && isLeadStatus(parts[0]) && parts[3]?.trim()) {
    return sanitizeRmName(parts[3]);
  }
  return '—';
};

const rmNamesMatch = (a, b) =>
  sanitizeRmName(a).toLowerCase() === sanitizeRmName(b).toLowerCase();

/**
 * Previous-RM note rows are visible only to super_admin.
 * Other roles see unnamed/system rows plus rows for the current assignee
 * (and any rows stamped with the viewer's own name).
 */
const isNoteVisibleToViewer = (entry, { role, viewerRmName, assignedRmName } = {}) => {
  if (role === 'super_admin') return true;

  const rm = parseNoteEntryRmName(entry);
  if (!rm || rm === '—') return true;

  if (assignedRmName && rmNamesMatch(rm, assignedRmName)) return true;
  if (viewerRmName && rmNamesMatch(rm, viewerRmName)) return true;
  return false;
};

const filterNotesForViewer = (notes, opts = {}) => {
  if (!notes) return '';
  if (opts.role === 'super_admin') return notes;

  return splitNoteEntries(notes)
    .filter((entry) => isNoteVisibleToViewer(entry, opts))
    .join('||');
};

/**
 * Prevent non-super_admins from wiping prior-RM history when they save
 * a filtered notes payload from the UI.
 */
const mergeNotesPreservingHidden = (existingNotes, submittedNotes, opts = {}) => {
  if (opts.role === 'super_admin') {
    return submittedNotes !== undefined && submittedNotes !== null
      ? submittedNotes
      : existingNotes || '';
  }
  if (submittedNotes === undefined || submittedNotes === null) {
    return existingNotes || '';
  }

  const hidden = splitNoteEntries(existingNotes).filter(
    (entry) => !isNoteVisibleToViewer(entry, opts)
  );
  const submitted = splitNoteEntries(submittedNotes);
  return [...hidden, ...submitted].join('||');
};

module.exports = {
  backfillLegacyRmNames,
  sanitizeRmName,
  splitNoteEntries,
  parseNoteEntryStatus,
  parseNoteEntryRmName,
  countNcNotesSinceAssignment,
  isNoteVisibleToViewer,
  filterNotesForViewer,
  mergeNotesPreservingHidden,
};
