const { query } = require('../db');
const bcrypt = require('bcrypt');

// Salt rounds for bcrypt password hashing
const SALT_ROUNDS = 10;

const normalizePhone = (p) => String(p ?? '').replace(/\D/g, '').trim();

const normalizeOptionalString = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

// Get all users with team name
const getAllUsers = async (req, res) => {
  try {
    const result = await query(
      'SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON u.team_id = t.id ORDER BY u.display_name'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[❌ getAllUsers Error]', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

const addUser = async (req, res) => {
  const {
    displayName,
    email,
    phoneNumber,
    password,
    role,
    status,
    team_id
  } = req.body;

  try {
    if (!displayName || !email || !phoneNumber || !password || !role || !status) {
      return res.status(400).json({ error: 'displayName, email, phoneNumber, password, role, and status are required' });
    }

    const phoneNorm = normalizePhone(phoneNumber);
    const existing = await query(
      'SELECT id FROM users WHERE phone_number = $1',
      [phoneNorm]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User with this phone number already exists' });
    }

    const existingEmail = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const safeTeamId = normalizeOptionalString(team_id);
    
    // Hash password before storing
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await query(
      `INSERT INTO users
        (display_name, email, phone_number, password, role, status, team_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [displayName, email, phoneNorm, hashedPassword, role, status, safeTeamId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[❌ addUser Error]', err);
    // Convert common constraint failures into client-friendly responses
    if (err?.code === '23505') {
      // Unique violation (e.g., users_email_key)
      return res.status(409).json({ error: 'User already exists' });
    }
    res.status(500).json({ error: 'Failed to add user' });
  }
};

const updateUser = async (req, res) => {
  const { id } = req.params;
  const {
    displayName,
    email,
    phoneNumber,
    password,
    role,
    status,
    team_id
  } = req.body;

  try {
    const phoneNorm = normalizePhone(phoneNumber);
    const existing = await query(
      'SELECT id FROM users WHERE phone_number = $1 AND id <> $2',
      [phoneNorm, id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User with this phone number already exists' });
    }

    const safeTeamId = normalizeOptionalString(team_id);

    // Build dynamic update query so password remains unchanged when not provided
    const values = [displayName, email, phoneNorm, role, status, safeTeamId];
    let setClause = `
        display_name = $1,
        email = $2,
        phone_number = $3,
        role = $4,
        status = $5,
        team_id = $6`;

    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      values.push(hashedPassword);
      setClause += `,
        password = $${values.length}`;
    }

    values.push(id);

    const result = await query(
      `UPDATE users SET${setClause}
       WHERE id = $${values.length} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[❌ updateUser Error]', err);
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'User already exists' });
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// Delete user by ID
const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    await query('DELETE FROM users WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error('[❌ deleteUser Error]', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// ✅ Bulk inactivate users (best practice)
const bulkInactivateUsers = async (req, res) => {
  const { userIds } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds must be a non-empty array' });
  }

  try {
    const placeholders = userIds.map((_, idx) => `$${idx + 1}`).join(',');
    const queryText = `UPDATE users SET status = 'Inactive' WHERE id IN (${placeholders})`;
    await query(queryText, userIds);
    res.json({ success: true, updatedCount: userIds.length });
  } catch (err) {
    console.error('[❌ bulkInactivateUsers Error]', err);
    res.status(500).json({ error: 'Failed to inactivate users' });
  }
};

// Export all
module.exports = {
  getAllUsers,
  addUser,
  updateUser,
  deleteUser,
  bulkInactivateUsers
};
