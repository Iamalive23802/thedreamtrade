const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isNotConnectedStatus,
  isWithinFirstAssignmentWindow,
  hasReachedTwentyFourHourDeadline,
  EXCLUDED_FROM_NOT_CONNECTED,
  REASSIGN_REASONS,
  NC_REASSIGN_THRESHOLD,
  TWENTY_FOUR_HOURS_MS,
} = require('../utils/leadStatusRules');

const {
  pickRandomEligibleRm,
  fetchPreviousRmIds,
} = require('../utils/autoReassign');

const { countNcNotesSinceAssignment } = require('../utils/notesHelper');

describe('isNotConnectedStatus', () => {
  it('returns false for all centrally excluded statuses', () => {
    for (const status of EXCLUDED_FROM_NOT_CONNECTED) {
      assert.equal(isNotConnectedStatus(status), false, status);
    }
  });

  it('returns true for explicit Not Connected statuses from the product list', () => {
    const nc = [
      'Busy',
      'Call Disconnected',
      'Counselling Call',
      'Disconnected Call',
      'Do Not disturb',
      'Incoming Calls Not Allowed',
      'Invalid Number',
      'Language Barrier',
      'No Response',
      'Not Connected',
      'Not Reachable',
      'Out Of Service',
      'Ringing',
      'Summarization Call',
      'Switched Off',
      'Wrong No',
    ];
    for (const status of nc) {
      assert.equal(isNotConnectedStatus(status), true, status);
    }
  });

  it('counts each NC note row, including repeated Ringing (Option A)', () => {
    const assignedAt = '2026-08-28T11:34:04.920Z';
    const notes = [
      'Ringing__a__2026-08-28T11:34:22.805Z__test vedant',
      'Ringing__b__2026-08-28T11:34:36.098Z__test vedant',
      'Ringing__c__2026-08-28T11:34:52.011Z__test vedant',
      'Ringing__d__2026-08-28T11:35:02.849Z__test vedant',
    ].join('||');
    assert.equal(countNcNotesSinceAssignment(notes, assignedAt), 4);
  });

  it('does not count NC notes from before the current assignment', () => {
    const assignedAt = '2026-08-28T12:00:00.000Z';
    const notes = [
      'Ringing__old__2026-08-28T11:00:00.000Z__prev rm',
      'Ringing__new__2026-08-28T12:05:00.000Z__test vedant',
    ].join('||');
    assert.equal(countNcNotesSinceAssignment(notes, assignedAt), 1);
  });

  it('does not count excluded statuses in note rows', () => {
    const assignedAt = '2026-08-28T11:00:00.000Z';
    const notes = [
      'Follow Up__call later__2026-08-28T11:10:00.000Z__rm',
      'Ringing__no answer__2026-08-28T11:20:00.000Z__rm',
    ].join('||');
    assert.equal(countNcNotesSinceAssignment(notes, assignedAt), 1);
  });

  it('treats New as Not Connected for auto-reassignment counting', () => {
    assert.equal(isNotConnectedStatus('New'), true);
  });

  it('does not count newly connected statuses in note rows', () => {
    const assignedAt = '2026-08-28T11:00:00.000Z';
    const notes = [
      'Less Funds__low budget__2026-08-28T11:10:00.000Z__rm',
      'Paid Client__converted__2026-08-28T11:20:00.000Z__rm',
      'Ringing__no answer__2026-08-28T11:30:00.000Z__rm',
    ].join('||');
    assert.equal(countNcNotesSinceAssignment(notes, assignedAt), 1);
  });

  it('does not increment conceptually for excluded statuses (Test 3 mapping)', () => {
    const sequence = [
      ['Ringing', true],
      ['Follow Up', false],
      ['Busy', true],
      ['Equity trader', false],
      ['Wrong No', true],
      ['Not Reachable', true],
    ];
    let ncCount = 0;
    let prev = 'New';
    for (const [status, counts] of sequence) {
      if (isNotConnectedStatus(status) && status !== prev) ncCount += 1;
      assert.equal(isNotConnectedStatus(status), counts, status);
      prev = status;
    }
    assert.equal(ncCount, 4);
  });
});

describe('24h window helpers', () => {
  it('does not start from lead_created_at — requires first_assigned_at', () => {
    assert.equal(isWithinFirstAssignmentWindow(null), false);
    assert.equal(hasReachedTwentyFourHourDeadline(null), false);
  });

  it('uses first_assigned_at, not an earlier created time', () => {
    const createdAt = new Date('2026-08-25T08:00:00Z');
    const firstAssignedAt = new Date('2026-08-25T10:00:00Z');
    const almost24h = new Date(firstAssignedAt.getTime() + TWENTY_FOUR_HOURS_MS - 1000);
    const atDeadline = new Date(firstAssignedAt.getTime() + TWENTY_FOUR_HOURS_MS);

    assert.equal(isWithinFirstAssignmentWindow(firstAssignedAt, almost24h), true);
    assert.equal(hasReachedTwentyFourHourDeadline(firstAssignedAt, almost24h), false);
    assert.equal(hasReachedTwentyFourHourDeadline(firstAssignedAt, atDeadline), true);

    // Even though createdAt + 24h has passed, window is still open relative to first_assigned_at
    const dayAfterCreate = new Date(createdAt.getTime() + TWENTY_FOUR_HOURS_MS + 1000);
    assert.equal(isWithinFirstAssignmentWindow(firstAssignedAt, dayAfterCreate), true);
  });

  it('restarts the 24h window when the lead is reassigned to another RM', () => {
    const autoReassignedAt = new Date('2026-08-25T17:00:00Z');
    const almost24hAfterReassign = new Date(autoReassignedAt.getTime() + TWENTY_FOUR_HOURS_MS - 1000);
    const atDeadline = new Date(autoReassignedAt.getTime() + TWENTY_FOUR_HOURS_MS);

    assert.equal(isWithinFirstAssignmentWindow(autoReassignedAt, almost24hAfterReassign), true);
    assert.equal(hasReachedTwentyFourHourDeadline(autoReassignedAt, almost24hAfterReassign), false);
    assert.equal(hasReachedTwentyFourHourDeadline(autoReassignedAt, atDeadline), true);
  });

  it('New + unassigned never starts the timer (Test 4)', () => {
    const created = new Date('2026-08-25T08:00:00Z');
    const nextDay = new Date('2026-08-26T08:00:00Z');
    assert.equal(isWithinFirstAssignmentWindow(null, nextDay), false);
    assert.equal(hasReachedTwentyFourHourDeadline(null, nextDay), false);
    assert.ok(nextDay - created >= TWENTY_FOUR_HOURS_MS);
  });
});

describe('NC threshold constants', () => {
  it('uses 4 as the Not Connected reassignment threshold', () => {
    assert.equal(NC_REASSIGN_THRESHOLD, 4);
  });

  it('exposes clear reason codes', () => {
    assert.equal(REASSIGN_REASONS.FOURTH_NOT_CONNECTED_UPDATE, 'FOURTH_NOT_CONNECTED_UPDATE');
    assert.equal(REASSIGN_REASONS.TWENTY_FOUR_HOUR_NOT_CONNECTED, 'TWENTY_FOUR_HOUR_NOT_CONNECTED');
  });
});

describe('assignment history exclusion', () => {
  const mockClient = (previousIds, activeRms) => ({
    query: async (sql) => {
      if (sql.includes('FROM lead_assignment_history')) {
        return { rows: previousIds.map((id) => ({ rm_id: id })) };
      }
      if (sql.includes('FROM users')) {
        return { rows: activeRms };
      }
      return { rows: [] };
    },
  });

  it('never selects a previous RM (Test 5)', async () => {
    const active = [
      { id: 'A', display_name: 'A' },
      { id: 'B', display_name: 'B' },
      { id: 'C', display_name: 'C' },
      { id: 'D', display_name: 'D' },
    ];
    const client = mockClient(['A'], active);
    for (let i = 0; i < 20; i += 1) {
      const picked = await pickRandomEligibleRm(client, 'lead-1', 'A');
      assert.ok(picked);
      assert.notEqual(picked.id, 'A');
      assert.ok(['B', 'C', 'D'].includes(picked.id));
    }
  });

  it('selects only the never-worked RM when A/B/C are previous (Test 6)', async () => {
    const active = [
      { id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' },
    ];
    const client = mockClient(['A', 'B', 'C'], active);
    for (let i = 0; i < 10; i += 1) {
      const picked = await pickRandomEligibleRm(client, 'lead-1', 'C');
      assert.equal(picked.id, 'D');
    }
  });

  it('returns null when no eligible RM remains (Test 7)', async () => {
    const active = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const client = mockClient(['A', 'B', 'C'], active);
    const picked = await pickRandomEligibleRm(client, 'lead-1', 'C');
    assert.equal(picked, null);
  });

  it('fetchPreviousRmIds returns distinct prior RMs', async () => {
    const client = {
      query: async () => ({ rows: [{ rm_id: 'A' }, { rm_id: 'B' }] }),
    };
    const set = await fetchPreviousRmIds(client, 'lead-1');
    assert.ok(set.has('A') && set.has('B'));
    assert.equal(set.size, 2);
  });
});

describe('4th NC and 24h trigger decision logic', () => {
  it('triggers 4th NC when four NC note rows exist inside window (Test 1)', () => {
    const firstAssignedAt = new Date('2026-08-25T10:00:00Z');
    const atFourth = new Date('2026-08-25T16:00:00Z');
    const assignedAt = firstAssignedAt.toISOString();
    const notes = [
      'Ringing__a__2026-08-25T10:01:00.000Z__rm',
      'Busy__b__2026-08-25T11:00:00.000Z__rm',
      'Wrong No__c__2026-08-25T12:00:00.000Z__rm',
      'Not Reachable__d__2026-08-25T13:00:00.000Z__rm',
    ].join('||');
    const nc = countNcNotesSinceAssignment(notes, assignedAt);
    assert.equal(nc, 4);
    assert.equal(isWithinFirstAssignmentWindow(firstAssignedAt, atFourth), true);
    assert.equal(nc >= NC_REASSIGN_THRESHOLD, true);
  });

  it('triggers 24h when status still NC at deadline with <4 NC notes (Test 2)', () => {
    const firstAssignedAt = new Date('2026-08-25T10:00:00Z');
    const deadline = new Date('2026-08-26T10:00:00Z');
    const assignedAt = firstAssignedAt.toISOString();
    const notes = [
      'Ringing__a__2026-08-25T10:01:00.000Z__rm',
      'Busy__b__2026-08-25T11:00:00.000Z__rm',
      'Wrong No__c__2026-08-25T12:00:00.000Z__rm',
    ].join('||');
    const nc = countNcNotesSinceAssignment(notes, assignedAt);
    assert.equal(nc, 3);
    assert.equal(isNotConnectedStatus('Wrong No'), true);
    assert.equal(hasReachedTwentyFourHourDeadline(firstAssignedAt, deadline), true);
    assert.equal(nc < NC_REASSIGN_THRESHOLD, true);
  });

  it('ignores excluded statuses when counting note rows toward 4 (Test 3)', () => {
    const assignedAt = '2026-08-25T10:00:00.000Z';
    const notes = [
      'Ringing__a__2026-08-25T10:01:00.000Z__rm',
      'Follow Up__b__2026-08-25T11:00:00.000Z__rm',
      'Busy__c__2026-08-25T12:00:00.000Z__rm',
      'Equity trader__d__2026-08-25T13:00:00.000Z__rm',
      'Wrong No__e__2026-08-25T14:00:00.000Z__rm',
      'Not Reachable__f__2026-08-25T15:00:00.000Z__rm',
    ].join('||');
    const nc = countNcNotesSinceAssignment(notes, assignedAt);
    assert.equal(nc, 4);
  });
});
