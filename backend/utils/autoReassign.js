const { backfillLegacyRmNames, countNcNotesSinceAssignment } = require('./notesHelper');
const {
  isNotConnectedStatus,
  isWithinFirstAssignmentWindow,
  hasReachedTwentyFourHourDeadline,
  REASSIGN_REASONS,
  NC_REASSIGN_THRESHOLD,
} = require('./leadStatusRules');

/**
 * Active RMs eligible to receive leads (matches upload/UI filters).
 */
const fetchActiveAssignableRms = async (client) => {
  const result = await client.query(
    `SELECT id, display_name, team_id, role, status
     FROM users
     WHERE LOWER(status) = 'active'
       AND role IN ('relationship_mgr', 'financial_manager')`
  );
  return result.rows;
};

const fetchPreviousRmIds = async (client, leadId) => {
  const result = await client.query(
    `SELECT DISTINCT rm_id
     FROM lead_assignment_history
     WHERE lead_id = $1 AND rm_id IS NOT NULL`,
    [leadId]
  );
  return new Set(result.rows.map((r) => r.rm_id));
};

const pickRandomEligibleRm = async (client, leadId, currentRmId) => {
  const [activeRms, previousIds] = await Promise.all([
    fetchActiveAssignableRms(client),
    fetchPreviousRmIds(client, leadId),
  ]);

  if (currentRmId) previousIds.add(currentRmId);

  const eligible = activeRms.filter((rm) => !previousIds.has(rm.id));
  if (eligible.length === 0) return null;

  const index = Math.floor(Math.random() * eligible.length);
  return eligible[index];
};

const closeOpenAssignment = async (client, leadId, rmId, at = new Date()) => {
  if (!rmId) return;
  await client.query(
    `UPDATE lead_assignment_history
     SET unassigned_at = $1
     WHERE lead_id = $2
       AND rm_id = $3
       AND unassigned_at IS NULL`,
    [at, leadId, rmId]
  );
};

const insertAssignmentHistory = async (client, {
  leadId,
  rmId,
  assignedAt,
  isAutomatic,
  reason,
  previousStatus,
  ncCount,
  firstAssignedAt,
  originalRmId,
  previousRmId,
}) => {
  await client.query(
    `INSERT INTO lead_assignment_history (
      lead_id, rm_id, assigned_at, is_automatic, reason,
      previous_status, nc_count, first_assigned_at, original_rm_id, previous_rm_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      leadId,
      rmId,
      assignedAt || new Date(),
      !!isAutomatic,
      reason || null,
      previousStatus || null,
      ncCount == null ? null : ncCount,
      firstAssignedAt || null,
      originalRmId || null,
      previousRmId || null,
    ]
  );
};

const insertReassignmentAudit = async (client, {
  leadId,
  previousRmId,
  newRmId,
  reason,
  previousStatus,
  ncCount,
  firstAssignedAt,
  originalRmId,
  isAutomatic = true,
  success = true,
  failureDetail = null,
}) => {
  await client.query(
    `INSERT INTO lead_reassignment_audit (
      lead_id, previous_rm_id, new_rm_id, reason, previous_status,
      nc_count, first_assigned_at, original_rm_id, is_automatic, success, failure_detail
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      leadId,
      previousRmId || null,
      newRmId || null,
      reason,
      previousStatus || null,
      ncCount == null ? null : ncCount,
      firstAssignedAt || null,
      originalRmId || null,
      !!isAutomatic,
      !!success,
      failureDetail,
    ]
  );
};

/**
 * Record a (manual/upload/initial) assignment onto a lead.
 * Restarts the 24h window whenever the lead is assigned to an RM.
 */
const recordManualAssignment = async (client, {
  leadId,
  newRmId,
  previousRmId,
  previousStatus,
  reason = REASSIGN_REASONS.MANUAL,
  assignedAt = new Date(),
}) => {
  const leadRes = await client.query(
    `SELECT id, assigned_to, status, first_assigned_at, nc_count
     FROM leads WHERE id = $1 FOR UPDATE`,
    [leadId]
  );
  if (leadRes.rows.length === 0) return null;
  const lead = leadRes.rows[0];

  const firstAssignedAt = newRmId ? assignedAt : lead.first_assigned_at;

  let originalRmId = null;
  const firstHist = await client.query(
    `SELECT rm_id FROM lead_assignment_history
     WHERE lead_id = $1 AND rm_id IS NOT NULL
     ORDER BY assigned_at ASC, created_at ASC
     LIMIT 1`,
    [leadId]
  );
  originalRmId = firstHist.rows[0]?.rm_id || newRmId || null;

  if (previousRmId && previousRmId !== newRmId) {
    await closeOpenAssignment(client, leadId, previousRmId, assignedAt);
  }

  if (newRmId) {
    await insertAssignmentHistory(client, {
      leadId,
      rmId: newRmId,
      assignedAt,
      isAutomatic: false,
      reason,
      previousStatus: previousStatus || lead.status,
      ncCount: 0,
      firstAssignedAt,
      originalRmId,
      previousRmId: previousRmId || null,
    });
  }

  await client.query(
    `UPDATE leads
     SET first_assigned_at = $1,
         nc_count = 0,
         twenty_four_hour_processed = CASE WHEN $3::uuid IS NOT NULL THEN FALSE ELSE twenty_four_hour_processed END,
         needs_manual_reassignment = FALSE,
         manual_reassignment_reason = NULL
     WHERE id = $2`,
    [firstAssignedAt, leadId, newRmId]
  );

  return { firstAssignedAt, originalRmId };
};

/**
 * Atomically auto-reassign a lead.
 * Returns { ok, lead, skipped, reason, failure }.
 */
const autoReassignLead = async (poolOrClient, {
  leadId,
  reason,
  expectedAssignedTo = undefined,
  requireNotConnected = true,
}) => {
  const externalClient = poolOrClient.query && poolOrClient.release ? poolOrClient : null;
  const client = externalClient || (await poolOrClient.connect());
  const shouldRelease = !externalClient;

  try {
    if (shouldRelease) await client.query('BEGIN');

    const leadRes = await client.query(
      `SELECT l.*,
              (SELECT h.rm_id FROM lead_assignment_history h
               WHERE h.lead_id = l.id
               ORDER BY h.assigned_at ASC, h.created_at ASC
               LIMIT 1) AS original_rm_id
       FROM leads l
       WHERE l.id = $1
       FOR UPDATE`,
      [leadId]
    );

    if (leadRes.rows.length === 0) {
      if (shouldRelease) await client.query('ROLLBACK');
      return { ok: false, skipped: true, reason: 'LEAD_NOT_FOUND' };
    }

    const lead = leadRes.rows[0];

    if (lead.needs_manual_reassignment) {
      if (shouldRelease) await client.query('ROLLBACK');
      return { ok: false, skipped: true, reason: 'NEEDS_MANUAL' };
    }

    if (!lead.assigned_to) {
      if (shouldRelease) await client.query('ROLLBACK');
      return { ok: false, skipped: true, reason: 'UNASSIGNED' };
    }

    if (!lead.first_assigned_at) {
      if (shouldRelease) await client.query('ROLLBACK');
      return { ok: false, skipped: true, reason: 'NO_FIRST_ASSIGNED_AT' };
    }

    if (expectedAssignedTo !== undefined && lead.assigned_to !== expectedAssignedTo) {
      if (shouldRelease) await client.query('ROLLBACK');
      return { ok: false, skipped: true, reason: 'ASSIGNEE_CHANGED' };
    }

    if (requireNotConnected && !isNotConnectedStatus(lead.status)) {
      if (reason === REASSIGN_REASONS.TWENTY_FOUR_HOUR_NOT_CONNECTED) {
        await client.query(
          `UPDATE leads SET twenty_four_hour_processed = TRUE WHERE id = $1`,
          [leadId]
        );
        if (shouldRelease) await client.query('COMMIT');
        return { ok: false, skipped: true, reason: 'STATUS_NOT_NC_MARKED_PROCESSED' };
      }
      if (shouldRelease) await client.query('ROLLBACK');
      return { ok: false, skipped: true, reason: 'STATUS_NOT_NC' };
    }

    if (
      reason === REASSIGN_REASONS.TWENTY_FOUR_HOUR_NOT_CONNECTED &&
      lead.twenty_four_hour_processed
    ) {
      if (shouldRelease) await client.query('ROLLBACK');
      return { ok: false, skipped: true, reason: 'TFH_ALREADY_PROCESSED' };
    }

    if (
      reason === REASSIGN_REASONS.FOURTH_NOT_CONNECTED_UPDATE &&
      !isWithinFirstAssignmentWindow(lead.first_assigned_at)
    ) {
      if (shouldRelease) await client.query('ROLLBACK');
      return { ok: false, skipped: true, reason: 'OUTSIDE_WINDOW' };
    }

    if (
      reason === REASSIGN_REASONS.TWENTY_FOUR_HOUR_NOT_CONNECTED &&
      !hasReachedTwentyFourHourDeadline(lead.first_assigned_at)
    ) {
      if (shouldRelease) await client.query('ROLLBACK');
      return { ok: false, skipped: true, reason: 'DEADLINE_NOT_REACHED' };
    }

    // Duplicate protection: if another auto-reassign just happened seconds ago for same reason
    const recent = await client.query(
      `SELECT id FROM lead_reassignment_audit
       WHERE lead_id = $1
         AND reason = $2
         AND success = TRUE
         AND reassigned_at > NOW() - INTERVAL '2 minutes'
       LIMIT 1`,
      [leadId, reason]
    );
    if (recent.rows.length > 0) {
      if (shouldRelease) await client.query('ROLLBACK');
      return { ok: false, skipped: true, reason: 'DUPLICATE_RECENT' };
    }

    const previousRmId = lead.assigned_to;
    const previousStatus = lead.status;
    const ncCount = lead.nc_count;
    const firstAssignedAt = lead.first_assigned_at;
    const originalRmId = lead.original_rm_id || previousRmId;

    const selected = await pickRandomEligibleRm(client, leadId, previousRmId);

    if (!selected) {
      await client.query(
        `UPDATE leads
         SET assigned_to = NULL,
             assigned_at = NULL,
             team_id = team_id,
             needs_manual_reassignment = TRUE,
             manual_reassignment_reason = $2,
             twenty_four_hour_processed = CASE
               WHEN $3 THEN TRUE ELSE twenty_four_hour_processed END
         WHERE id = $1`,
        [
          leadId,
          REASSIGN_REASONS.NO_ELIGIBLE_RM,
          reason === REASSIGN_REASONS.TWENTY_FOUR_HOUR_NOT_CONNECTED,
        ]
      );

      await closeOpenAssignment(client, leadId, previousRmId, new Date());

      // Stamp previous RM onto notes for audit continuity
      const prevRmNameRes = await client.query(
        'SELECT display_name FROM users WHERE id = $1',
        [previousRmId]
      );
      const prevRmName = prevRmNameRes.rows[0]?.display_name || 'Previous RM';
      const notes = backfillLegacyRmNames(lead.notes || '', prevRmName);
      await client.query(`UPDATE leads SET notes = $1 WHERE id = $2`, [notes, leadId]);

      await insertReassignmentAudit(client, {
        leadId,
        previousRmId,
        newRmId: null,
        reason: REASSIGN_REASONS.NO_ELIGIBLE_RM,
        previousStatus,
        ncCount,
        firstAssignedAt,
        originalRmId,
        isAutomatic: true,
        success: false,
        failureDetail: `Triggered by ${reason}; no eligible active RM remaining`,
      });

      if (shouldRelease) await client.query('COMMIT');
      return {
        ok: false,
        skipped: false,
        failure: true,
        reason: REASSIGN_REASONS.NO_ELIGIBLE_RM,
        leadId,
      };
    }

    const now = new Date();
    const prevRmNameRes = await client.query(
      'SELECT display_name FROM users WHERE id = $1',
      [previousRmId]
    );
    const prevRmName = prevRmNameRes.rows[0]?.display_name || 'Previous RM';
    const notesToSave = backfillLegacyRmNames(lead.notes || '', prevRmName);

    await closeOpenAssignment(client, leadId, previousRmId, now);

    await client.query(
      `UPDATE leads
       SET assigned_to = $1,
           team_id = COALESCE($2, team_id),
           assigned_at = $3,
           notes = $4,
           status = 'New',
           nc_count = 0,
           first_assigned_at = $3,
           needs_manual_reassignment = FALSE,
           manual_reassignment_reason = NULL,
           twenty_four_hour_processed = CASE
             WHEN $6 THEN TRUE ELSE FALSE END
       WHERE id = $5`,
      [
        selected.id,
        selected.team_id || null,
        now,
        notesToSave,
        leadId,
        reason === REASSIGN_REASONS.TWENTY_FOUR_HOUR_NOT_CONNECTED,
      ]
    );

    await insertAssignmentHistory(client, {
      leadId,
      rmId: selected.id,
      assignedAt: now,
      isAutomatic: true,
      reason,
      previousStatus,
      ncCount,
      firstAssignedAt: now,
      originalRmId,
      previousRmId,
    });

    await insertReassignmentAudit(client, {
      leadId,
      previousRmId,
      newRmId: selected.id,
      reason,
      previousStatus,
      ncCount,
      firstAssignedAt,
      originalRmId,
      isAutomatic: true,
      success: true,
    });

    const updated = await client.query(`SELECT * FROM leads WHERE id = $1`, [leadId]);

    if (shouldRelease) await client.query('COMMIT');

    return {
      ok: true,
      skipped: false,
      reason,
      lead: updated.rows[0],
      previousRmId,
      newRmId: selected.id,
    };
  } catch (err) {
    if (shouldRelease) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    }
    throw err;
  } finally {
    if (shouldRelease) client.release();
  }
};

/**
 * After a successful lead save: recount NC note rows for the current assignment
 * and trigger auto-reassignment when the threshold is reached.
 * Each new note row with an NC status counts (including repeated Ringing rows).
 */
const handlePostStatusUpdate = async (pool, {
  leadId,
  newNotes,
  assignedTo,
}) => {
  if (!assignedTo) {
    return { ncCount: 0, reassigned: false };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const leadRes = await client.query(
      `SELECT id, assigned_to, assigned_at, status, notes, first_assigned_at, nc_count, needs_manual_reassignment
       FROM leads WHERE id = $1 FOR UPDATE`,
      [leadId]
    );
    if (leadRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ncCount: 0, reassigned: false };
    }

    const lead = leadRes.rows[0];
    if (!lead.assigned_to || lead.needs_manual_reassignment) {
      await client.query('ROLLBACK');
      return { ncCount: lead.nc_count, reassigned: false };
    }

    if (!lead.first_assigned_at || !isWithinFirstAssignmentWindow(lead.first_assigned_at)) {
      await client.query('ROLLBACK');
      return { ncCount: lead.nc_count, reassigned: false, outsideWindow: true };
    }

    const notesToEvaluate = newNotes != null ? newNotes : lead.notes;
    const nextCount = countNcNotesSinceAssignment(notesToEvaluate, lead.assigned_at);
    const prevCount = lead.nc_count || 0;

    if (nextCount === prevCount && nextCount < NC_REASSIGN_THRESHOLD) {
      await client.query('ROLLBACK');
      return { ncCount: prevCount, reassigned: false, unchanged: true };
    }

    await client.query(`UPDATE leads SET nc_count = $1 WHERE id = $2`, [nextCount, leadId]);
    await client.query('COMMIT');

    if (nextCount >= NC_REASSIGN_THRESHOLD) {
      const result = await autoReassignLead(pool, {
        leadId,
        reason: REASSIGN_REASONS.FOURTH_NOT_CONNECTED_UPDATE,
        expectedAssignedTo: lead.assigned_to,
        requireNotConnected: false,
      });
      return {
        ncCount: nextCount,
        reassigned: !!result.ok,
        reassignment: result,
      };
    }

    return { ncCount: nextCount, reassigned: false };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Process all leads that have reached the 24h deadline.
 */
const processTwentyFourHourReassignments = async (pool) => {
  const due = await pool.query(
    `SELECT id FROM leads
     WHERE first_assigned_at IS NOT NULL
       AND assigned_to IS NOT NULL
       AND needs_manual_reassignment = FALSE
       AND twenty_four_hour_processed = FALSE
       AND first_assigned_at <= NOW() - INTERVAL '24 hours'
     ORDER BY first_assigned_at ASC
     LIMIT 200`
  );

  const results = [];
  for (const row of due.rows) {
    try {
      const result = await autoReassignLead(pool, {
        leadId: row.id,
        reason: REASSIGN_REASONS.TWENTY_FOUR_HOUR_NOT_CONNECTED,
        requireNotConnected: true,
      });
      results.push({ leadId: row.id, ...result });
    } catch (err) {
      console.error(`[24h-reassign] Failed for lead ${row.id}:`, err.message);
      results.push({ leadId: row.id, ok: false, error: err.message });
    }
  }
  return results;
};

module.exports = {
  fetchActiveAssignableRms,
  fetchPreviousRmIds,
  pickRandomEligibleRm,
  closeOpenAssignment,
  insertAssignmentHistory,
  insertReassignmentAudit,
  recordManualAssignment,
  autoReassignLead,
  handlePostStatusUpdate,
  processTwentyFourHourReassignments,
};
