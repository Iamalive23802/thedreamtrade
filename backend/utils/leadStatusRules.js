/**
 * Centralized lead-status rules for automatic reassignment.
 * The 24h window restarts each time a lead is assigned to a new RM.
 */

const EXCLUDED_FROM_NOT_CONNECTED = Object.freeze([
  'Call Back With Presentation',
  'Call Back Without Presentation',
  'Equity trader',
  'Follow Up',
  'Follow Up (No Response)',
  'Follow Up-No Response',
  'Free Trial',
  'Free Trial – Follow Up',
  'Less Funds',
  'Loss Client',
  'Low Capital',
  'No Capital',
  'No DMAT',
  'Non Trader',
  'Not Interested',
  'Paid Client',
  'Promise To Pay',
  'Won',
]);

const EXCLUDED_FROM_NOT_CONNECTED_SET = new Set(EXCLUDED_FROM_NOT_CONNECTED);

const REASSIGN_REASONS = Object.freeze({
  FOURTH_NOT_CONNECTED_UPDATE: 'FOURTH_NOT_CONNECTED_UPDATE',
  TWENTY_FOUR_HOUR_NOT_CONNECTED: 'TWENTY_FOUR_HOUR_NOT_CONNECTED',
  MANUAL: 'MANUAL',
  INITIAL: 'INITIAL',
  UPLOAD: 'UPLOAD',
  NO_ELIGIBLE_RM: 'NO_ELIGIBLE_RM',
});

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const NC_REASSIGN_THRESHOLD = 4;

/**
 * Not Connected = every status EXCEPT the excluded set above.
 * Unknown/empty statuses are treated as Not Connected so they do not
 * silently bypass automation; excluded list remains the single source of truth.
 */
const isNotConnectedStatus = (status) => {
  if (status == null) return true;
  const normalized = String(status).trim();
  if (!normalized) return true;
  return !EXCLUDED_FROM_NOT_CONNECTED_SET.has(normalized);
};

const isWithinFirstAssignmentWindow = (firstAssignedAt, now = new Date()) => {
  if (!firstAssignedAt) return false;
  const start = new Date(firstAssignedAt).getTime();
  if (Number.isNaN(start)) return false;
  return now.getTime() < start + TWENTY_FOUR_HOURS_MS;
};

const hasReachedTwentyFourHourDeadline = (firstAssignedAt, now = new Date()) => {
  if (!firstAssignedAt) return false;
  const start = new Date(firstAssignedAt).getTime();
  if (Number.isNaN(start)) return false;
  return now.getTime() >= start + TWENTY_FOUR_HOURS_MS;
};

module.exports = {
  EXCLUDED_FROM_NOT_CONNECTED,
  EXCLUDED_FROM_NOT_CONNECTED_SET,
  REASSIGN_REASONS,
  TWENTY_FOUR_HOURS_MS,
  NC_REASSIGN_THRESHOLD,
  isNotConnectedStatus,
  isWithinFirstAssignmentWindow,
  hasReachedTwentyFourHourDeadline,
};
