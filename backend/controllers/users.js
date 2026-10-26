const { query } = require('../db');
const bcrypt = require('bcrypt');
const {
  ROLES,
  canManageUsers,
  userListScope,
  canAssignRole,
  canModifyUser,
} = require('../utils/userAccess');

const SALT_ROUNDS = 10;

const FULL_USER_COLUMNS = `
  u.id, u.display_name, u.email, u.phone_number, u.role, u.status, u.team_id, t.name AS team_name
`;
const DIRECTORY_COLUMNS = `
  u.id, u.display_name, u.role, u.status, u.team_id, t.name AS team_name
`;
const RETURNING_COLUMNS = 'id, display_name, email, phone_number, role, status, team_id';

const normalizePhone = (p) => String(p ?? '').replace(/\D/g, '').trim();

const normalizeOptionalString = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

const deny = (res, status, error) => res.status(status).json({ error });

const getAllUsers = async (req, res) => {
  try {
    const scope = userListScope(req.user?.role);
    if (scope === 'none') {
      return deny(res, 403, 'Forbidden');
    }

    if (scope === 'team') {
      const me = await query('SELECT team_id FROM users WHERE id = $1', [req.user.id]);
      const teamId = me.rows[0]?.team_id;
      if (!teamId) return res.json([]);
      const result = await query(
        `SELECT ${FULL_USER_COLUMNS}
         FROM users u
         LEFT JOIN teams t ON u.team_id = t.id
         WHERE u.team_id = $1
         ORDER BY u.display_name`,
        [teamId]
      );
      return res.json(result.rows);
    }

    const columns = scope === 'directory' ? DIRECTORY_COLUMNS : FULL_USER_COLUMNS;
    const result = await query(
      `SELECT ${columns}
       FROM users u
       LEFT JOIN teams t ON u.team_id = t.id
       ORDER BY u.display_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[❌ getAllUsers Error]', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

const addUser = async (req, res) => {
  if (!canManageUsers(req.user?.role)) {
    return deny(res, 403, 'Forbidden');
  }

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
    if (!ROLES.includes(role) || !canAssignRole(req.user.role, role)) {
      return deny(res, 403, 'You cannot assign that role');
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
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await query(
      `INSERT INTO users
        (display_name, email, phone_number, password, role, status, team_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${RETURNING_COLUMNS}`,
      [displayName, email, phoneNorm, hashedPassword, role, status, safeTeamId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[❌ addUser Error]', err);
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'User already exists' });
    }
    res.status(500).json({ error: 'Failed to add user' });
  }
};

const updateUser = async (req, res) => {
  if (!canManageUsers(req.user?.role)) {
    return deny(res, 403, 'Forbidden');
  }

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
    if (!ROLES.includes(role) || !canAssignRole(req.user.role, role)) {
      return deny(res, 403, 'You cannot assign that role');
    }

    const existingUser = await query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!canModifyUser(req.user.role, existingUser.rows[0].role)) {
      return deny(res, 403, 'You cannot change a super admin');
    }

    const phoneNorm = normalizePhone(phoneNumber);
    const existing = await query(
      'SELECT id FROM users WHERE phone_number = $1 AND id <> $2',
      [phoneNorm, id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User with this phone number already exists' });
    }

    const safeTeamId = normalizeOptionalString(team_id);
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
       WHERE id = $${values.length}
       RETURNING ${RETURNING_COLUMNS}`,
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

const deleteUser = async (req, res) => {
  if (!canManageUsers(req.user?.role)) {
    return deny(res, 403, 'Forbidden');
  }

  const { id } = req.params;

  try {
    const existingUser = await query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!canModifyUser(req.user.role, existingUser.rows[0].role)) {
      return deny(res, 403, 'You cannot delete a super admin');
    }

    await query('DELETE FROM users WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error('[❌ deleteUser Error]', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

const bulkInactivateUsers = async (req, res) => {
  if (!canManageUsers(req.user?.role)) {
    return deny(res, 403, 'Forbidden');
  }

  const { userIds } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds must be a non-empty array' });
  }

  try {
    const placeholders = userIds.map((_, idx) => `$${idx + 1}`).join(',');
    const protectSuperAdmins = req.user.role !== 'super_admin';
    const queryText = protectSuperAdmins
      ? `UPDATE users SET status = 'Inactive' WHERE id IN (${placeholders}) AND role <> 'super_admin'`
      : `UPDATE users SET status = 'Inactive' WHERE id IN (${placeholders})`;
    const result = await query(queryText, userIds);
    res.json({ success: true, updatedCount: result.rowCount });
  } catch (err) {
    console.error('[❌ bulkInactivateUsers Error]', err);
    res.status(500).json({ error: 'Failed to inactivate users' });
  }
};

module.exports = {
  getAllUsers,
  addUser,
  updateUser,
  deleteUser,
  bulkInactivateUsers
};
