const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  filterNotesForViewer,
  mergeNotesPreservingHidden,
} = require('../utils/notesHelper');

const PREV =
  'Ringing__NC1__2026-08-01T10:00:00.000Z__Old RM||Not Reachable__NC2__2026-08-01T11:00:00.000Z__Old RM';
const CURRENT = 'Follow Up__Working__2026-08-02T10:00:00.000Z__New RM';
const SYSTEM = 'New__Facebook Lead Ads__2026-08-01T09:00:00.000Z__—';
const FULL = `${SYSTEM}||${PREV}||${CURRENT}`;

describe('notes visibility for reassigned leads', () => {
  it('super_admin sees all note rows including previous RM', () => {
    const filtered = filterNotesForViewer(FULL, {
      role: 'super_admin',
      viewerRmName: 'Any',
      assignedRmName: 'New RM',
    });
    assert.equal(filtered, FULL);
  });

  it('new RM does not see previous RM rows but keeps system + own rows', () => {
    const filtered = filterNotesForViewer(FULL, {
      role: 'relationship_mgr',
      viewerRmName: 'New RM',
      assignedRmName: 'New RM',
    });
    assert.ok(!filtered.includes('Old RM'));
    assert.ok(filtered.includes('New RM'));
    assert.ok(filtered.includes('Facebook Lead Ads'));
  });

  it('admin cannot see previous RM rows (super_admin only)', () => {
    const filtered = filterNotesForViewer(FULL, {
      role: 'admin',
      viewerRmName: 'Admin User',
      assignedRmName: 'New RM',
    });
    assert.ok(!filtered.includes('Old RM'));
    assert.ok(filtered.includes('New RM'));
  });

  it('merge preserves hidden prior-RM notes when RM saves filtered payload', () => {
    const submitted = `${SYSTEM}||${CURRENT}||Free Trial__Mine__2026-08-02T12:00:00.000Z__New RM`;
    const merged = mergeNotesPreservingHidden(FULL, submitted, {
      role: 'relationship_mgr',
      viewerRmName: 'New RM',
      assignedRmName: 'New RM',
    });
    assert.ok(merged.includes('Old RM'), 'prior RM history must remain in DB');
    assert.ok(merged.includes('Mine'));
    assert.equal(
      mergeNotesPreservingHidden(FULL, submitted, {
        role: 'relationship_mgr',
        viewerRmName: 'New RM',
        assignedRmName: 'New RM',
      }).split('||').filter((e) => e.includes('Old RM')).length,
      2
    );
  });
});
