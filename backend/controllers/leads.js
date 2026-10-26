const pool = require('../db');
const {
  backfillLegacyRmNames,
  filterNotesForViewer,
  mergeNotesPreservingHidden,
} = require('../utils/notesHelper');
const {
  recordManualAssignment,
  handlePostStatusUpdate,
} = require('../utils/autoReassign');
const { REASSIGN_REASONS } = require('../utils/leadStatusRules');
const { sendStatusChangeToMeta } = require('../utils/metaConversionsApi');
const { resolveMissingFormNames } = require('../utils/metaFormNames');
const multer = require('multer');
const Papa = require('papaparse');
const fetch = require('node-fetch');
const XLSX = require('xlsx');

const upload = multer({ storage: multer.memoryStorage() });

const {
  buildCustomerId,
  resolveCustomerIdDate,
} = require('../utils/customerId');

const normalizePhone = (p) => (p || '').replace(/\D/g, '').trim();

const PAYMENT_LIMIT = 178000;

const countPaymentEntries = (history) => {
  if (!history || typeof history !== 'string' || !history.trim()) return 0;
  return history.split('|||').filter((entry) => entry && entry.trim() !== '').length;
};

const sumPaymentAmounts = (history) => {
  if (!history || typeof history !== 'string' || !history.trim()) return 0;
  return history
    .split('|||')
    .filter((entry) => entry && entry.trim() !== '')
    .reduce((sum, entry) => {
      const amount = Number(String(entry.split('__')[0] || '').replace(/,/g, ''));
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
};

const canDeletePayments = (role) => role === 'super_admin' || role === 'financial_manager';
const canEditClientName = (role) =>
  role === 'super_admin' || role === 'financial_manager' || role === 'admin' || role === 'team_leader';

/** Paid clients / payments pages — includes payment_history. */
const PAID_CLIENT_SELECT = `
  l.id, l.full_name, l.phone, l.email, l.alt_number, l.status, l.team_id, l.date,
  l.assigned_to, l.assigned_at, l.tags, l.language, l.customer_id,
  l.payment_history, l.gender, l.dob, l.age, l.pan_card_number, l.aadhar_card_number,
  u.display_name AS assigned_user_name, u.role AS assigned_user_role
`;

const getPaidClients = async (req, res) => {
  const { role, id: user_id } = req.user;

  try {
    let result;

    if (role === 'relationship_mgr') {
      result = await pool.query(
        `SELECT ${PAID_CLIENT_SELECT}
         FROM leads l
         LEFT JOIN users u ON l.assigned_to = u.id
         WHERE l.status IN ('Paid Client', 'Won')
           AND l.assigned_to = $1
         ORDER BY l.customer_id DESC NULLS LAST, l.date DESC NULLS LAST`,
        [user_id]
      );
    } else if (role === 'team_leader') {
      const teamRes = await pool.query(
        'SELECT team_id FROM users WHERE id = $1',
        [user_id]
      );
      const teamId = teamRes.rows[0]?.team_id;
      if (!teamId) {
        return res.json([]);
      }
      result = await pool.query(
        `SELECT ${PAID_CLIENT_SELECT}
         FROM leads l
         LEFT JOIN users u ON l.assigned_to = u.id
         WHERE l.status IN ('Paid Client', 'Won')
           AND l.team_id = $1
         ORDER BY l.customer_id DESC NULLS LAST, l.date DESC NULLS LAST`,
        [teamId]
      );
    } else {
      result = await pool.query(
        `SELECT ${PAID_CLIENT_SELECT}
         FROM leads l
         LEFT JOIN users u ON l.assigned_to = u.id
         WHERE l.status IN ('Paid Client', 'Won')
         ORDER BY l.customer_id DESC NULLS LAST, l.date DESC NULLS LAST`
      );
    }

    console.log(`✅ Paid clients fetched: ${result.rows.length} (role=${role})`);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Failed to fetch paid clients:', err.message);
    res.status(500).json({ error: 'Failed to fetch paid clients' });
  }
};

const getViewerDisplayName = async (userId) => {
  if (!userId) return '';
  const res = await pool.query('SELECT display_name FROM users WHERE id = $1', [userId]);
  return res.rows[0]?.display_name || '';
};

const redactLeadNotesForViewer = (lead, { role, viewerRmName }) => {
  if (!lead || role === 'super_admin') return lead;
  return {
    ...lead,
    notes: filterNotesForViewer(lead.notes, {
      role,
      viewerRmName,
      assignedRmName: lead.assigned_user_name || '',
    }),
  };
};

const getLeads = async (req, res) => {
  const { role, id: user_id } = req.user;

  try {
    if (role === 'super_admin') {
      try {
        await Promise.race([
          resolveMissingFormNames(),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      } catch (err) {
        console.warn('[Facebook] Form name backfill skipped:', err.message);
      }
    }

    let result;
    const viewerRmName = await getViewerDisplayName(user_id);

    if (role === 'relationship_mgr') {
      console.log(`🔍 Fetching leads for RM with user_id: ${user_id}, role: ${role}`);
      result = await pool.query(
        `SELECT l.*, u.display_name AS assigned_user_name, u.role AS assigned_user_role
         FROM leads l
         LEFT JOIN users u ON l.assigned_to = u.id
         WHERE l.assigned_to = $1
         ORDER BY l.date DESC NULLS LAST`,
        [user_id]
      );
      console.log(`✅ RM fetched ${result.rows.length} leads assigned to user_id: ${user_id}`);
    } else if (role === 'financial_manager') {
      result = await pool.query(
        `SELECT l.*, u.display_name AS assigned_user_name, u.role AS assigned_user_role
         FROM leads l
         LEFT JOIN users u ON l.assigned_to = u.id
         ORDER BY l.date DESC NULLS LAST`
      );
    } else if (role === 'team_leader') {
      const teamRes = await pool.query(
        'SELECT team_id FROM users WHERE id = $1',
        [user_id]
      );
      const teamId = teamRes.rows[0]?.team_id;

      if (teamId) {
        result = await pool.query(
          `SELECT l.*, u.display_name AS assigned_user_name, u.role AS assigned_user_role
           FROM leads l
           LEFT JOIN users u ON l.assigned_to = u.id
           WHERE l.team_id = $1
           ORDER BY l.date DESC NULLS LAST`,
          [teamId]
        );
      } else {
        result = { rows: [] };
      }
    } else if (role === 'admin') {
      result = await pool.query(
        `SELECT l.*, u.display_name AS assigned_user_name, u.role AS assigned_user_role
         FROM leads l
         LEFT JOIN users u ON l.assigned_to = u.id
         ORDER BY l.date DESC NULLS LAST`
      );
        console.log(`✅ Admin fetched ${result.rows.length} leads`);
    } else {
      result = await pool.query(
        `SELECT l.*, u.display_name AS assigned_user_name, u.role AS assigned_user_role
         FROM leads l
         LEFT JOIN users u ON l.assigned_to = u.id
         ORDER BY l.date DESC NULLS LAST`
      );
        console.log(`✅ Super Admin fetched ${result.rows.length} leads`);
    }

    const rows = result.rows.map((row) =>
      redactLeadNotesForViewer(row, { role, viewerRmName })
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Failed to fetch leads:', err.message);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
};

const addLead = async (req, res) => {
  const {
    fullName,
    email,
    phone,
    altNumber,
    notes,
    deematAccountName,
    profession,
    stateName,
    capital,
    segment,
    team_id,
    assigned_to,
    tags,
    language
  } = req.body;
  const { role, id: user_id } = req.user;

  console.log('🔍 addLead called with:', {
    role,
    user_id,
    assigned_to,
    team_id,
    fullName,
    tags,
    language,
    assigned_to_type: typeof assigned_to,
    assigned_to_value: assigned_to
  });

  if (!fullName || !phone) {
    return res.status(400).json({ error: 'Full name and phone are required' });
  }

  const phoneNorm = normalizePhone(phone);
  
  // Validate phone number is exactly 10 digits
  if (phoneNorm.length !== 10) {
    return res.status(400).json({ error: 'Phone number must be exactly 10 digits' });
  }

  try {
    const existing = await pool.query('SELECT id FROM leads WHERE phone = $1', [phoneNorm]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Lead with this phone number already exists' });
    }

    let assignedTo = null;
    let finalTeamId = team_id;

    // Normalize assigned_to - handle empty strings, null, undefined
    const normalizedAssignedTo = assigned_to && typeof assigned_to === 'string' && assigned_to.trim() !== '' ? assigned_to.trim() : null;
    const normalizedTeamId = finalTeamId && typeof finalTeamId === 'string' && finalTeamId.trim() !== '' ? finalTeamId.trim() : null;

    // Use assigned_to from frontend if provided, otherwise use role-based logic
    if (normalizedAssignedTo) {
      console.log('✅ Using assigned_to from frontend:', normalizedAssignedTo);
      // Verify the user exists and is active
      const userCheck = await pool.query(
        'SELECT id, team_id, status FROM users WHERE id = $1',
        [normalizedAssignedTo]
      );
      
      if (userCheck.rows.length > 0 && userCheck.rows[0].status?.toLowerCase() === 'active') {
        assignedTo = normalizedAssignedTo;
        // Get team_id from the assigned user if not provided
        if (!normalizedTeamId && userCheck.rows[0].team_id) {
          finalTeamId = userCheck.rows[0].team_id;
          console.log('📋 Got team_id from assigned user:', finalTeamId);
        } else if (normalizedTeamId) {
          finalTeamId = normalizedTeamId;
        }
      } else {
        console.log('⚠️ Assigned user not found or inactive:', normalizedAssignedTo);
        // Fall through to role-based assignment if user doesn't exist
      }
    }
    
    // Role-based assignment (only if not already assigned above)
    if (!assignedTo && (role === 'relationship_mgr' || role === 'financial_manager')) {
      console.log('✅ Using role-based assignment for:', role, user_id);
      assignedTo = user_id;
      if (!finalTeamId) {
        const rm = await pool.query('SELECT team_id FROM users WHERE id = $1', [user_id]);
        finalTeamId = rm.rows[0]?.team_id || null;
        console.log('📋 Got team_id from user:', finalTeamId);
      }
    }

    console.log('🎯 Final assignment values:', {
      assignedTo,
      finalTeamId,
      inputAssignedTo: assigned_to,
      inputTeamId: team_id,
      role,
      user_id
    });

    const safeTeamId = finalTeamId && typeof finalTeamId === 'string' && finalTeamId.trim() !== '' ? finalTeamId.trim() : null;
    const safeAssignedTo = assignedTo && typeof assignedTo === 'string' && assignedTo.trim() !== '' ? assignedTo.trim() : null;
    
    console.log('✅ Safe values before INSERT:', {
      safeAssignedTo,
      safeTeamId,
      assignedAt: safeAssignedTo ? new Date() : null
    });

    const assignedAt = safeAssignedTo ? new Date() : null;
    const firstAssignedAt = safeAssignedTo ? assignedAt : null;

    const result = await pool.query(
      `INSERT INTO leads (
        date,
        full_name,
        email,
        phone,
        alt_number,
        notes,
        deemat_account_name,
        profession,
        state_name,
        capital,
        segment,
        team_id,
        assigned_to,
        assigned_at,
        first_assigned_at,
        nc_count,
        tags,
        language
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 0, $16, $17)
       RETURNING *`,
      [
        new Date(),
        fullName,
        email || null,
        phoneNorm,
        altNumber || '',
        notes || '',
        deematAccountName || '',
        profession || '',
        stateName || '',
        capital || '',
        segment || '',
        safeTeamId,
        safeAssignedTo,
        assignedAt,
        firstAssignedAt,
        tags || '',
        language || ''
      ]
    );

    if (safeAssignedTo) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await recordManualAssignment(client, {
          leadId: result.rows[0].id,
          newRmId: safeAssignedTo,
          previousRmId: null,
          previousStatus: result.rows[0].status || 'New',
          reason: REASSIGN_REASONS.INITIAL,
          assignedAt,
        });
        await client.query('COMMIT');
      } catch (histErr) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        console.error('⚠️ Failed to record initial assignment history:', histErr.message);
      } finally {
        client.release();
      }
    }
    
    console.log('✅ Lead inserted successfully:', {
      id: result.rows[0].id,
      assigned_to: result.rows[0].assigned_to,
      team_id: result.rows[0].team_id,
      assigned_at: result.rows[0].assigned_at
    });
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to add lead:', err);
    console.error('❌ Error details:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to add lead', details: err.message });
  }
};

const updateLead = async (req, res) => {
  const { id } = req.params;
  const { role, id: user_id } = req.user;
  const {
    fullName, email, phone, altNumber, notes, deematAccountName,
    profession, stateName, capital, segment, gender, dob, age,
    panCardNumber, aadharCardNumber, paymentHistory, status,
    team_id, assigned_to, tags, language
  } = req.body;

  try {
    console.log('Updating lead ID:', id);
    console.log('Payload:', req.body);
    console.log('Tags in payload:', tags);
    console.log('User role:', role, 'User ID:', user_id);

    if (!fullName || !phone || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingLeadRes = await pool.query(
      'SELECT assigned_to, team_id, assigned_at, status, notes, meta_lead_id, email, phone, first_assigned_at, payment_history, full_name, customer_id FROM leads WHERE id = $1',
      [id]
    );

    if (existingLeadRes.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const existingLead = existingLeadRes.rows[0];
    const previousStatus = existingLead.status;
    const nextFullName = canEditClientName(role)
      ? String(fullName || '').trim()
      : (existingLead.full_name || fullName);

    if (!nextFullName) {
      return res.status(400).json({ error: 'Client name is required' });
    }

    if (paymentHistory !== undefined && !canDeletePayments(role)) {
      const existingCount = countPaymentEntries(existingLead.payment_history);
      const incomingCount = countPaymentEntries(paymentHistory);
      if (incomingCount < existingCount) {
        return res.status(403).json({
          error: 'Only finance manager and super admin can delete payments'
        });
      }
    }

    if (paymentHistory !== undefined) {
      const existingTotal = sumPaymentAmounts(existingLead.payment_history);
      const incomingTotal = sumPaymentAmounts(paymentHistory);
      const existingCount = countPaymentEntries(existingLead.payment_history);
      const incomingCount = countPaymentEntries(paymentHistory);
      // Block adding money / new rows once limit is reached or would be exceeded
      if (
        incomingTotal > existingTotal &&
        (existingTotal >= PAYMENT_LIMIT || incomingTotal > PAYMENT_LIMIT)
      ) {
        return res.status(403).json({
          error: 'Completed — payments cannot exceed ₹1,78,000'
        });
      }
      if (existingTotal >= PAYMENT_LIMIT && incomingCount > existingCount) {
        return res.status(403).json({
          error: 'Completed — cannot add more payments'
        });
      }
    }

    let notesValue = notes !== undefined ? notes : (existingLead.notes || '');
    const isRMorFM = role === 'relationship_mgr' || role === 'financial_manager';
    const viewerRmName = await getViewerDisplayName(user_id);
    let existingAssignedRmName = '';
    if (existingLead.assigned_to) {
      existingAssignedRmName = await getViewerDisplayName(existingLead.assigned_to);
    }

    // Non-super_admins receive a redacted notes view; merge so prior-RM history is kept.
    if (notes !== undefined && role !== 'super_admin') {
      notesValue = mergeNotesPreservingHidden(existingLead.notes, notes, {
        role,
        viewerRmName,
        assignedRmName: existingAssignedRmName,
      });
    }

    // Normalize assigned_to - handle empty strings, null, undefined
    let finalAssignedTo = null;
    if (assigned_to !== undefined && assigned_to !== null && typeof assigned_to === 'string' && assigned_to.trim() !== '') {
      const normalizedAssignedTo = assigned_to.trim();
      // Verify the user exists and is active
      const userCheck = await pool.query(
        'SELECT id, team_id, status FROM users WHERE id = $1',
        [normalizedAssignedTo]
      );
      
      if (userCheck.rows.length > 0 && userCheck.rows[0].status?.toLowerCase() === 'active') {
        finalAssignedTo = normalizedAssignedTo;
      } else {
        console.log('⚠️ Assigned user not found or inactive during update:', normalizedAssignedTo);
        // Keep existing assignment if new one is invalid
        finalAssignedTo = existingLead.assigned_to;
      }
    } else {
      // If assigned_to is not provided or is empty, keep existing assignment
      finalAssignedTo = existingLead.assigned_to;
    }

    let finalTeamId = team_id;
    if (finalTeamId === undefined || finalTeamId === null || (typeof finalTeamId === 'string' && finalTeamId.trim() === '')) {
      finalTeamId = existingLead.team_id;
    }
    
    // If we have a valid assigned user, try to get team_id from them if not provided
    if (finalAssignedTo && !finalTeamId) {
      const userTeamRes = await pool.query('SELECT team_id FROM users WHERE id = $1', [finalAssignedTo]);
      if (userTeamRes.rows.length > 0 && userTeamRes.rows[0].team_id) {
        finalTeamId = userTeamRes.rows[0].team_id;
      }
    }

    // RMs/FMs cannot change assignment
    if (isRMorFM) {
      finalAssignedTo = existingLead.assigned_to;
      finalTeamId = existingLead.team_id;
    }

    let assignedAtValue = existingLead.assigned_at;
    let statusValue = status;
    let assignmentChanged = false;
    let firstAssignedAtValue = existingLead.first_assigned_at || null;
    let resetNcCount = false;

    if (finalAssignedTo && finalAssignedTo !== existingLead.assigned_to) {
      assignedAtValue = new Date();
      assignmentChanged = true;
      resetNcCount = true;
      firstAssignedAtValue = assignedAtValue;
      if (existingLead.assigned_to) {
        statusValue = 'New';
        const prevRmRes = await pool.query(
          'SELECT display_name FROM users WHERE id = $1',
          [existingLead.assigned_to]
        );
        const prevRmName = prevRmRes.rows[0]?.display_name || 'Previous RM';
        notesValue = backfillLegacyRmNames(notesValue, prevRmName);
      }
    } else if (!finalAssignedTo) {
      assignedAtValue = null;
      if (existingLead.assigned_to) {
        assignmentChanged = true;
        resetNcCount = true;
      }
    }

    // Assign sequential Customer ID when lead becomes a Paid Client (DT{FY}{####}, e.g. DT26270507)
    let customerIdValue = existingLead.customer_id || null;
    if (statusValue === 'Paid Client' && !customerIdValue) {
      const nextIdRes = await pool.query(
        "SELECT nextval('leads_customer_id_seq') AS next_id"
      );
      const nextNum = Number(nextIdRes.rows[0].next_id);
      const fyDate = resolveCustomerIdDate({
        paymentHistory,
        date: existingLead.date,
        assignedAt: assignedAtValue || existingLead.assigned_at,
      });
      customerIdValue = buildCustomerId(nextNum, fyDate);
    }

    const result = await pool.query(
  `UPDATE leads SET
    full_name = $1, email = $2, phone = $3, alt_number = $4, notes = $5,
    deemat_account_name = $6, profession = $7, state_name = $8, capital = $9,
    segment = $10, gender = $11, dob = $12, age = $13, pan_card_number = $14,
    aadhar_card_number = $15, payment_history = $16, status = $17,
    team_id = $18, assigned_to = $19, assigned_at = $20, tags = $21, language = $22,
    first_assigned_at = CASE WHEN $25 THEN $23 ELSE first_assigned_at END,
    nc_count = CASE WHEN $24 THEN 0 ELSE nc_count END,
    twenty_four_hour_processed = CASE WHEN $25 THEN FALSE ELSE twenty_four_hour_processed END,
    needs_manual_reassignment = CASE WHEN $25 THEN FALSE ELSE needs_manual_reassignment END,
    manual_reassignment_reason = CASE WHEN $25 THEN NULL ELSE manual_reassignment_reason END,
    customer_id = COALESCE(customer_id, $27)
   WHERE id = $26 RETURNING *`,
  [
    nextFullName,
    email || null,
    phone,
    altNumber || '',
    notesValue || '',
    deematAccountName || '',
    profession || '',
    stateName || '',
    capital || '',
    segment || '',
    gender || '',
    dob?.trim() === '' ? null : dob,
    isNaN(Number(age)) ? null : Number(age),
    panCardNumber || '',
    aadharCardNumber || '',
    paymentHistory || '',
    statusValue,
    finalTeamId || null,
    finalAssignedTo || null,
    assignedAtValue,
    tags || '',
    language || '',
    firstAssignedAtValue,
    resetNcCount,
    assignmentChanged && !!finalAssignedTo,
    id,
    customerIdValue
  ]
);

    if (assignmentChanged && finalAssignedTo) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await recordManualAssignment(client, {
          leadId: id,
          newRmId: finalAssignedTo,
          previousRmId: existingLead.assigned_to || null,
          previousStatus,
          reason: REASSIGN_REASONS.MANUAL,
          assignedAt: assignedAtValue || new Date(),
        });
        await client.query('COMMIT');
      } catch (histErr) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        console.error('⚠️ Failed to record assignment history on updateLead:', histErr.message);
      } finally {
        client.release();
      }
    } else if (assignmentChanged && !finalAssignedTo && existingLead.assigned_to) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { closeOpenAssignment } = require('../utils/autoReassign');
        await closeOpenAssignment(client, id, existingLead.assigned_to, new Date());
        await client.query('COMMIT');
      } catch (histErr) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        console.error('⚠️ Failed to close assignment history on unassign:', histErr.message);
      } finally {
        client.release();
      }
    }

    let autoReassignment = null;
    if (!assignmentChanged && result.rows[0]?.assigned_to) {
      try {
        autoReassignment = await handlePostStatusUpdate(pool, {
          leadId: id,
          newNotes: result.rows[0].notes,
          assignedTo: result.rows[0].assigned_to,
        });
      } catch (autoErr) {
        console.error('⚠️ Auto-reassignment post-update failed:', autoErr.message);
      }
    }

    console.log('✅ Update success:', result.rows[0]?.id);
    console.log('   Final assigned_to:', result.rows[0]?.assigned_to);

    const responseLead = autoReassignment?.reassigned && autoReassignment?.reassignment?.lead
      ? autoReassignment.reassignment.lead
      : result.rows[0];

    if (responseLead.status !== previousStatus) {
      sendStatusChangeToMeta(responseLead, previousStatus).catch((err) => {
        console.error('[Meta CAPI] Background send failed:', err.message);
      });
    }

    let assignedUserName = responseLead.assigned_user_name || '';
    if (!assignedUserName && responseLead.assigned_to) {
      assignedUserName = await getViewerDisplayName(responseLead.assigned_to);
    }

    const safeLead = redactLeadNotesForViewer(
      { ...responseLead, assigned_user_name: assignedUserName },
      { role, viewerRmName }
    );

    res.json({
      ...safeLead,
      auto_reassignment: autoReassignment?.reassigned
        ? {
            triggered: true,
            reason: autoReassignment.reassignment?.reason,
            new_rm_id: autoReassignment.reassignment?.newRmId,
            nc_count: autoReassignment.ncCount,
          }
        : { triggered: false, nc_count: autoReassignment?.ncCount ?? responseLead.nc_count },
    });

  } catch (err) {
    console.error('[❌ updateLead Error]', err); 
    res.status(500).json({ error: 'Failed to update lead' });
  }
};

const assignLead = async (req, res) => {
  const { id } = req.params;
  const { assigned_to } = req.body;

  console.log(`🔍 Assigning lead ${id} to user ${assigned_to}`);

  if (!assigned_to) {
    return res.status(400).json({ error: 'Missing assigned_to value' });
  }

  try {
    const userRes = await pool.query(
      'SELECT team_id, display_name, role FROM users WHERE id = $1',
      [assigned_to]
    );
    
    if (userRes.rows.length === 0) {
      console.error(`❌ User ${assigned_to} not found`);
      return res.status(404).json({ error: 'User not found' });
    }

    const userTeamId = userRes.rows[0]?.team_id || null;
    console.log(`✅ Found user: ${userRes.rows[0].display_name}, team_id: ${userTeamId}`);

    const currentLeadRes = await pool.query(
      `SELECT assigned_to, assigned_at, notes, status, first_assigned_at
       FROM leads WHERE id = $1`,
      [id]
    );

    if (currentLeadRes.rows.length === 0) {
      console.error(`❌ Lead ${id} not found`);
      return res.status(404).json({ error: 'Lead not found' });
    }

    const currentLead = currentLeadRes.rows[0];
    let newAssignedAt = currentLead.assigned_at;
    let notesToSave = currentLead.notes || '';
    let resetStatus = false;
    let assignmentChanged = false;
    let firstAssignedAtValue = currentLead.first_assigned_at || null;

    if (assigned_to && assigned_to !== currentLead.assigned_to) {
      newAssignedAt = new Date();
      assignmentChanged = true;
      firstAssignedAtValue = newAssignedAt;
      if (currentLead.assigned_to) {
        resetStatus = true;
        const prevRmRes = await pool.query(
          'SELECT display_name FROM users WHERE id = $1',
          [currentLead.assigned_to]
        );
        const prevRmName = prevRmRes.rows[0]?.display_name || 'Previous RM';
        notesToSave = backfillLegacyRmNames(notesToSave, prevRmName);
      }
    } else if (!assigned_to) {
      newAssignedAt = null;
    }

    const result = await pool.query(
      `UPDATE leads
       SET assigned_to = $1,
           team_id = COALESCE(team_id, $2),
           assigned_at = $4,
           notes = $5,
           status = CASE WHEN $6 THEN 'New' ELSE status END,
           first_assigned_at = CASE WHEN $8 THEN $7 ELSE first_assigned_at END,
           nc_count = CASE WHEN $8 THEN 0 ELSE nc_count END,
           twenty_four_hour_processed = CASE WHEN $8 THEN FALSE ELSE twenty_four_hour_processed END,
           needs_manual_reassignment = CASE WHEN $8 THEN FALSE ELSE needs_manual_reassignment END,
           manual_reassignment_reason = CASE WHEN $8 THEN NULL ELSE manual_reassignment_reason END
       WHERE id = $3
       RETURNING *`,
      [
        assigned_to,
        userTeamId,
        id,
        newAssignedAt,
        notesToSave,
        resetStatus,
        firstAssignedAtValue,
        assignmentChanged,
      ]
    );

    if (result.rows.length === 0) {
      console.error(`❌ Lead ${id} not found`);
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (assignmentChanged) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await recordManualAssignment(client, {
          leadId: id,
          newRmId: assigned_to,
          previousRmId: currentLead.assigned_to || null,
          previousStatus: currentLead.status,
          reason: REASSIGN_REASONS.MANUAL,
          assignedAt: newAssignedAt || new Date(),
        });
        await client.query('COMMIT');
      } catch (histErr) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        console.error('⚠️ Failed to record assignment history on assignLead:', histErr.message);
      } finally {
        client.release();
      }
    }

    console.log(`✅ Lead ${id} assigned successfully to ${assigned_to}`);
    console.log(`   Lead assigned_to: ${result.rows[0].assigned_to}, team_id: ${result.rows[0].team_id}`);
    
    res.json({ message: 'Lead assigned successfully', lead: result.rows[0] });
  } catch (err) {
    console.error('❌ Failed to assign lead:', err.message);
    console.error('   Full error:', err);
    res.status(500).json({ error: 'Failed to assign lead' });
  }
};

const deleteLead = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM leads WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error('❌ Failed to delete lead:', err.message);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
};

const uploadLeads = [
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let data = [];
    const fileName = req.file.originalname.toLowerCase();

    // Parse CSV or Excel based on file extension
    if (fileName.endsWith('.csv')) {
      const csvData = req.file.buffer.toString('utf-8');
      const parsed = Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
      });
      data = parsed.data;
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      data = XLSX.utils.sheet_to_json(worksheet);
    } else {
      return res.status(400).json({ error: 'Unsupported file format. Please upload CSV or Excel file.' });
    }

    console.log('📊 Upload file columns:', Object.keys(data[0] || {}));
    if (data[0]) {
      console.log('📊 [UPLOAD] Sample first row:', JSON.stringify(data[0], null, 2));
    }

    const totalParsed = data.length;
    let validCount = 0;

    const client = await pool.connect();
    try {
      const existingPhonesRes = await client.query('SELECT phone FROM leads');
      const existingPhones = new Set(existingPhonesRes.rows.map(r => normalizePhone(r.phone)));
      const sheetPhones = new Set();

      await client.query('BEGIN');
      for (const row of data) {
        const fullName = row['Full Name'] || row.fullName || '';
        const email = row['Email'] || row.email || '';
        const phone = normalizePhone(row['Phone'] || row.phone || '');
        const altNumber = row['Alternate Number'] || row.altNumber || '';
        const notes = row['Notes'] || row.notes || '';
        const deematAccountName = row['Deemat Account Name'] || row.deematAccountName || '';
        const profession = row['Profession'] || row.profession || '';
        const stateName = row['State Name'] || row.stateName || '';
        const capital = row['Capital'] || row.capital || '';
        const segment = row['Segment'] || row.segment || '';
        const team_id = row['Team ID'] || row.team_id || null;
        // Try multiple column name variations for "Assigned to"
        let assignedToName = '';
        const possibleAssignedToKeys = [
          'Assigned to', 'Assigned To', 'assigned to', 'Assigned To ', 'Assigned  to',
          'assigned_to', 'Assigned_To', 'Assigned_to', 'assignedTo', 'assigned_to'
        ];
        for (const key of possibleAssignedToKeys) {
          if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
            assignedToName = String(row[key]).trim();
            break;
          }
        }
        // Also check all keys for case-insensitive match
        if (!assignedToName) {
          for (const key of Object.keys(row)) {
            if (key.toLowerCase().replace(/[\s_]/g, '') === 'assignedto') {
              assignedToName = String(row[key]).trim();
              break;
            }
          }
        }
        
        const tags = row['Tags'] || row['Tag'] || row['tags'] || row['tag'] || row.tags || row.tag || '';
        const language = row['Language'] || row['language'] || row.language || '';
        
        console.log(`📝 [UPLOAD] Row for ${fullName}: assignedToName="${assignedToName}", all row keys:`, Object.keys(row));

        // Look up user by display_name if "Assigned to" is provided
        let assignedTo = null;
        let finalTeamId = team_id && team_id.trim() !== '' ? team_id : null;

        if (assignedToName && assignedToName.trim() !== '') {
          const trimmedName = assignedToName.trim();
          console.log(`🔍 [UPLOAD] Looking up user: "${trimmedName}" for lead: ${fullName}`);
          // Check if it's a valid user with role relationship_mgr or financial_manager
          const userRes = await client.query(
            `SELECT id, team_id, role, status FROM users 
             WHERE (LOWER(display_name) = LOWER($1) OR LOWER(email) = LOWER($1))
             AND LOWER(status) = 'active'
             AND (role = 'relationship_mgr' OR role = 'financial_manager')`,
            [trimmedName]
          );
          console.log(`🔍 [UPLOAD] User lookup result for "${trimmedName}":`, {
            found: userRes.rows.length > 0,
            users: userRes.rows.map(u => ({ id: u.id, name: u.display_name || 'N/A', role: u.role, status: u.status }))
          });
          if (userRes.rows.length > 0) {
            assignedTo = userRes.rows[0].id;
            // Use the user's team_id if not provided in the row
            if (!finalTeamId && userRes.rows[0].team_id) {
              finalTeamId = userRes.rows[0].team_id;
            }
            console.log(`✅ [UPLOAD] Found active user: ${trimmedName} (ID: ${assignedTo}, Role: ${userRes.rows[0].role}, Team: ${finalTeamId})`);
          } else {
            console.log(`⚠️ [UPLOAD] User "${trimmedName}" not found or inactive, lead will be unassigned`);
          }
        } else {
          console.log(`⚠️ [UPLOAD] No assigned_to name provided for ${fullName}`);
        }

        const safeTeamId = finalTeamId;

        if (!fullName || !phone) continue;
        // Skip if phone is not exactly 10 digits
        if (phone.length !== 10) continue;
        if (existingPhones.has(phone)) continue;
        if (sheetPhones.has(phone)) continue;

        validCount++;

        const assignedAt = assignedTo ? new Date() : null;

        await client.query(
          `INSERT INTO leads (
            date,
            full_name,
            email,
            phone,
            alt_number,
            notes,
            deemat_account_name,
            profession,
            state_name,
            capital,
            segment,
            team_id,
            assigned_to,
            assigned_at,
            tags,
            language
          )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            new Date(),
            fullName,
            email || null,
            phone,
            altNumber,
            notes,
            deematAccountName,
            profession,
            stateName,
            capital,
            segment,
            safeTeamId,
            assignedTo,
            assignedAt,
            tags || '',
            language || ''
          ]
        );

        sheetPhones.add(phone);
      }
      await client.query('COMMIT');
      console.log(`📊 Parsed: ${totalParsed}, ✅ Inserted: ${validCount}`);
      res.status(201).json({
        message: 'Leads uploaded successfully (duplicates skipped)',
        totalParsed,
        validInserted: validCount
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to upload leads:', err.message);
      res.status(500).json({ error: 'Failed to upload leads' });
    } finally {
      client.release();
    }
  }
];

const googleSheetsUpload = async (req, res) => {
  const { sheetLink } = req.body;

  if (!sheetLink || !sheetLink.includes('docs.google.com/spreadsheets')) {
    return res.status(400).json({ error: 'Invalid Google Sheets link' });
  }

  try {
    const match = sheetLink.match(/\/d\/(.*?)\//);
    if (!match) {
      return res.status(400).json({ error: 'Could not parse Google Sheets link' });
    }

    const sheetId = match[1];
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

    const response = await fetch(exportUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch data from Google Sheets');
    }

    const csvData = await response.text();
    const { data } = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
    });

    const totalParsed = data.length;
    let validCount = 0;

    const client = await pool.connect();
    try {
      const existingPhonesRes = await client.query('SELECT phone FROM leads');
      const existingPhones = new Set(existingPhonesRes.rows.map(r => normalizePhone(r.phone)));
      const sheetPhones = new Set();

      await client.query('BEGIN');
      for (const row of data) {
        const fullName = row['Full Name'] || row.fullName || '';
        const email = row['Email'] || row.email || '';
        const phone = normalizePhone(row['Phone'] || row.phone || '');
        const altNumber = row['Alternate Number'] || row.altNumber || '';
        const notes = row['Notes'] || row.notes || '';
        const deematAccountName = row['Deemat Account Name'] || row.deematAccountName || '';
        const profession = row['Profession'] || row.profession || '';
        const stateName = row['State Name'] || row.stateName || '';
        const capital = row['Capital'] || row.capital || '';
        const segment = row['Segment'] || row.segment || '';
        const team_id = row['Team ID'] || row.team_id || null;
        // Try multiple column name variations for "Assigned to"
        let assignedToName = '';
        const possibleAssignedToKeys = [
          'Assigned to', 'Assigned To', 'assigned to', 'Assigned To ', 'Assigned  to',
          'assigned_to', 'Assigned_To', 'Assigned_up', 'assignedTo', 'assigned_to'
        ];
        for (const key of possibleAssignedToKeys) {
          if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
            assignedToName = String(row[key]).trim();
            break;
          }
        }
        // Also check all keys for case-insensitive match
        if (!assignedToName) {
          for (const key of Object.keys(row)) {
            if (key.toLowerCase().replace(/[\s_]/g, '') === 'assignedto') {
              assignedToName = String(row[key]).trim();
              break;
            }
          }
        }
        
        const tags = row['Tags'] || row['Tag'] || row['tags'] || row['tag'] || row.tags || row.tag || '';
        const language = row['Language'] || row['language'] || row.language || '';

        // Look up user by display_name if "Assigned to" is provided
        let assignedTo = null;
        let finalTeamId = team_id && team_id.trim() !== '' ? team_id : null;

        if (assignedToName && assignedToName.trim() !== '') {
          const trimmedName = assignedToName.trim();
          console.log(`🔍 [UPLOAD] Looking up user: "${trimmedName}" for lead: ${fullName}`);
          // Check if it's a valid user with role relationship_mgr or financial_manager
          const userRes = await client.query(
            `SELECT id, team_id, role, status FROM users 
             WHERE (LOWER(display_name) = LOWER($1) OR LOWER(email) = LOWER($1))
             AND LOWER(status) = 'active'
             AND (role = 'relationship_mgr' OR role = 'financial_manager')`,
            [trimmedName]
          );
          console.log(`🔍 [UPLOAD] User lookup result for "${trimmedName}":`, {
            found: userRes.rows.length > 0,
            users: userRes.rows.map(u => ({ id: u.id, name: u.display_name || 'N/A', role: u.role, status: u.status }))
          });
          if (userRes.rows.length > 0) {
            assignedTo = userRes.rows[0].id;
            // Use the user's team_id if not provided in the row
            if (!finalTeamId && userRes.rows[0].team_id) {
              finalTeamId = userRes.rows[0].team_id;
            }
            console.log(`✅ [UPLOAD] Found active user: ${trimmedName} (ID: ${assignedTo}, Role: ${userRes.rows[0].role}, Team: ${finalTeamId})`);
          } else {
            console.log(`⚠️ [UPLOAD] User "${trimmedName}" not found or inactive, lead will be unassigned`);
          }
        } else {
          console.log(`⚠️ [UPLOAD] No assigned_to name provided for ${fullName}`);
        }

        const safeTeamId = finalTeamId;

        if (!fullName || !phone) continue;
        // Skip if phone is not exactly 10 digits
        if (phone.length !== 10) continue;
        if (existingPhones.has(phone)) continue;
        if (sheetPhones.has(phone)) continue;

        validCount++;

        const assignedAt = assignedTo ? new Date() : null;

        await client.query(
          `INSERT INTO leads (
            date,
            full_name,
            email,
            phone,
            alt_number,
            notes,
            deemat_account_name,
            profession,
            state_name,
            capital,
            segment,
            team_id,
            assigned_to,
            assigned_at,
            tags,
            language
          )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            new Date(),
            fullName,
            email || null,
            phone,
            altNumber,
            notes,
            deematAccountName,
            profession,
            stateName,
            capital,
            segment,
            safeTeamId,
            assignedTo,
            assignedAt,
            tags || '',
            language || ''
          ]
        );

        sheetPhones.add(phone);
      }
      await client.query('COMMIT');
      console.log(`📊 Parsed: ${totalParsed}, ✅ Inserted: ${validCount}`);
      res.status(201).json({
        message: 'Leads uploaded successfully (duplicates skipped)',
        totalParsed,
        validInserted: validCount
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to upload leads from Google Sheets:', err.message);
      res.status(500).json({ error: 'Failed to upload leads from Google Sheets' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Google Sheets upload error:', err.message);
    res.status(500).json({ error: 'Failed to process Google Sheets link' });
  }
};

const getLatestFreeTrialMarkedAt = (notes) => {
  if (!notes) return null;

  let latest = null;
  const entries = notes.split('||').filter((entry) => entry.trim() !== '');

  for (const entry of entries) {
    const parts = entry.split('__');
    if (parts[0] !== 'Free Trial') continue;

    const timestamp = parts[2];
    if (!timestamp) continue;

    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) continue;

    if (!latest || parsed > latest) {
      latest = parsed;
    }
  }

  return latest;
};

const getFreeTrialAlerts = async (req, res) => {
  const { id: user_id, role } = req.user;

  try {
    if (role !== 'super_admin' && role !== 'admin') {
      return res.json({ alerts: [] });
    }

    const loginRes = await pool.query(
      'SELECT last_login FROM users WHERE id = $1',
      [user_id]
    );
    const lastLogin = loginRes.rows[0]?.last_login
      ? new Date(loginRes.rows[0].last_login)
      : new Date(0);

    const result = await pool.query(
      `SELECT l.id, l.full_name, l.notes, l.assigned_at, u.display_name AS rm_name
       FROM leads l
       LEFT JOIN users u ON l.assigned_to = u.id
       WHERE l.status = 'Free Trial'`
    );

    const alerts = [];

    for (const row of result.rows) {
      const markedAt = getLatestFreeTrialMarkedAt(row.notes);
      const effectiveAt = markedAt || (row.assigned_at ? new Date(row.assigned_at) : null);

      if (!effectiveAt || effectiveAt <= lastLogin) continue;

      alerts.push({
        id: row.id,
        fullName: row.full_name,
        rmName: row.rm_name || 'Unassigned',
        markedAt: effectiveAt.toISOString(),
      });
    }

    alerts.sort((a, b) => new Date(b.markedAt) - new Date(a.markedAt));
    res.json({ alerts });
  } catch (err) {
    console.error('❌ Failed to get free trial alerts:', err.message);
    res.status(500).json({ error: 'Failed to get free trial alerts' });
  }
};

const getNewLeadsCount = async (req, res) => {
  const { id: user_id, role } = req.user;

  try {
    // Only for Relationship Managers (leads assigned to them)
    if (role !== 'relationship_mgr') {
      return res.json({ newLeadsCount: 0 });
    }

    const result = await pool.query(
      `SELECT COUNT(*) as count FROM leads 
       WHERE assigned_to = $1 
       AND assigned_at IS NOT NULL
       AND assigned_at > COALESCE((SELECT last_login FROM users WHERE id = $1), '1970-01-01'::timestamp)`,
      [user_id]
    );

    const newLeadsCount = parseInt(result.rows[0]?.count || 0);
    res.json({ newLeadsCount });
  } catch (err) {
    console.error('❌ Failed to get new leads count:', err.message);
    res.status(500).json({ error: 'Failed to get new leads count' });
  }
};

const parsePaymentEntries = (paymentHistory) => {
  if (!paymentHistory) return [];
  return String(paymentHistory)
    .split('|||')
    .filter((entry) => entry.trim() !== '')
    .map((entry) => {
      const parts = entry.split('__');
      const approvedFlag = parts[3];
      const approved =
        approvedFlag === undefined ||
        approvedFlag === '' ||
        approvedFlag === '1' ||
        approvedFlag === 'true';
      const assignedTo = (parts[4] || '').trim();
      return {
        amount: parseFloat(parts[0] || '0') || 0,
        date: (parts[1] || '').trim(),
        approved,
        assignedTo,
        rm1: (parts[7] || parts[4] || '').trim(),
        rm2: (parts[9] || '').trim(),
      };
    });
};

const getIstYearMonth = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).format(date);
};

const addSalesCredit = (salesById, nameById, rmId, amount) => {
  if (!rmId || !nameById.has(rmId) || amount <= 0) return;
  salesById.set(rmId, (salesById.get(rmId) || 0) + amount);
};

const getStarPerformers = async (_req, res) => {
  try {
    const currentMonth = getIstYearMonth(new Date());
    const [leadsRes, usersRes] = await Promise.all([
      pool.query(
        `SELECT assigned_to, payment_history
         FROM leads
         WHERE status IN ('Won', 'Paid Client')
           AND payment_history IS NOT NULL
           AND TRIM(payment_history) <> ''`
      ),
      pool.query(
        `SELECT id, display_name
         FROM users
         WHERE role IN ('relationship_mgr', 'financial_manager')`
      ),
    ]);

    const nameById = new Map(
      usersRes.rows.map((u) => [u.id, u.display_name || 'Unknown'])
    );
    const salesById = new Map();

    for (const lead of leadsRes.rows) {
      for (const payment of parsePaymentEntries(lead.payment_history)) {
        if (!payment.approved || payment.amount <= 0) continue;
        if (getIstYearMonth(payment.date) !== currentMonth) continue;

        if (payment.rm1 && payment.rm2) {
          addSalesCredit(salesById, nameById, payment.rm1, payment.amount / 2);
          addSalesCredit(salesById, nameById, payment.rm2, payment.amount / 2);
        } else if (payment.rm1) {
          addSalesCredit(salesById, nameById, payment.rm1, payment.amount);
        } else if (payment.rm2) {
          addSalesCredit(salesById, nameById, payment.rm2, payment.amount);
        } else {
          addSalesCredit(
            salesById,
            nameById,
            payment.assignedTo || lead.assigned_to,
            payment.amount
          );
        }
      }
    }

    const performers = [...salesById.entries()]
      .filter(([, sales]) => sales > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, sales], index) => ({
        id,
        name: nameById.get(id),
        sales,
        rank: index + 1,
      }));

    res.json({ performers, period: 'current_month' });
  } catch (err) {
    console.error('❌ Failed to get star performers:', err.message);
    res.status(500).json({ error: 'Failed to get star performers' });
  }
};

module.exports = {
  getLeads,
  getPaidClients,
  addLead,
  updateLead,
  deleteLead,
  uploadLeads,
  assignLead,
  googleSheetsUpload,
  getNewLeadsCount,
  getFreeTrialAlerts,
  getStarPerformers
};
