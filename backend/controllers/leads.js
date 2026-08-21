const pool = require('../db');
const { backfillLegacyRmNames } = require('../utils/notesHelper');
const { sendStatusChangeToMeta } = require('../utils/metaConversionsApi');
const multer = require('multer');
const Papa = require('papaparse');
const fetch = require('node-fetch');
const XLSX = require('xlsx');

const upload = multer({ storage: multer.memoryStorage() });

const normalizePhone = (p) => (p || '').replace(/\D/g, '').trim();

const getLeads = async (req, res) => {
  const { role, id: user_id } = req.user;

  try {
    let result;

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

    res.json(result.rows);
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
        tags,
        language
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
        tags || '',
        language || ''
      ]
    );
    
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
      'SELECT assigned_to, team_id, assigned_at, status, notes, meta_lead_id, email, phone FROM leads WHERE id = $1',
      [id]
    );

    if (existingLeadRes.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const existingLead = existingLeadRes.rows[0];
    const previousStatus = existingLead.status;
    let notesValue = notes !== undefined ? notes : (existingLead.notes || '');
    const isRMorFM = role === 'relationship_mgr' || role === 'financial_manager';

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
    if (finalAssignedTo && finalAssignedTo !== existingLead.assigned_to) {
      assignedAtValue = new Date();
      if (existingLead.assigned_to) {
        const prevRmRes = await pool.query(
          'SELECT display_name FROM users WHERE id = $1',
          [existingLead.assigned_to]
        );
        const prevRmName = prevRmRes.rows[0]?.display_name || 'Previous RM';
        notesValue = backfillLegacyRmNames(notesValue, prevRmName);
      }
    } else if (!finalAssignedTo) {
      assignedAtValue = null;
    }

    const result = await pool.query(
  `UPDATE leads SET
    full_name = $1, email = $2, phone = $3, alt_number = $4, notes = $5,
    deemat_account_name = $6, profession = $7, state_name = $8, capital = $9,
    segment = $10, gender = $11, dob = $12, age = $13, pan_card_number = $14,
    aadhar_card_number = $15, payment_history = $16, status = $17,
    team_id = $18, assigned_to = $19, assigned_at = $20, tags = $21, language = $22
   WHERE id = $23 RETURNING *`,
  [
    fullName,
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
    status,
    finalTeamId || null,
    finalAssignedTo || null,
    assignedAtValue,
    tags || '',
    language || '',
    id
  ]
);

    console.log('✅ Update success:', result.rows[0]);
    console.log('   Final assigned_to:', result.rows[0].assigned_to);

    // Fire-and-forget CRM → Meta Conversions API on status change (Meta leads only)
    if (result.rows[0].status !== previousStatus) {
      sendStatusChangeToMeta(result.rows[0], previousStatus).catch((err) => {
        console.error('[Meta CAPI] Background send failed:', err.message);
      });
    }

    res.json(result.rows[0]);

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
      'SELECT assigned_to, assigned_at, notes FROM leads WHERE id = $1',
      [id]
    );

    if (currentLeadRes.rows.length === 0) {
      console.error(`❌ Lead ${id} not found`);
      return res.status(404).json({ error: 'Lead not found' });
    }

    const currentLead = currentLeadRes.rows[0];
    let newAssignedAt = currentLead.assigned_at;
    let notesToSave = currentLead.notes || '';

    if (assigned_to && assigned_to !== currentLead.assigned_to) {
      newAssignedAt = new Date();
      if (currentLead.assigned_to) {
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
           notes = $5
       WHERE id = $3
       RETURNING *`,
      [assigned_to, userTeamId, id, newAssignedAt, notesToSave]
    );

    if (result.rows.length === 0) {
      console.error(`❌ Lead ${id} not found`);
      return res.status(404).json({ error: 'Lead not found' });
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

module.exports = {
  getLeads,
  addLead,
  updateLead,
  deleteLead,
  uploadLeads,
  assignLead,
  googleSheetsUpload,
  getNewLeadsCount,
  getFreeTrialAlerts
};
