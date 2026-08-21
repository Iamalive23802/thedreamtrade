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

module.exports = {
  backfillLegacyRmNames,
  sanitizeRmName,
};
