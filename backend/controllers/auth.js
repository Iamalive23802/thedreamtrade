const pool = require('../db');
const bcrypt = require('bcrypt');
const { generateToken } = require('../middleware/auth');
const { getClientIp, isIpAllowed, isNetworkRestrictionEnabled, isSuperAdmin } = require('../middleware/networkRestriction');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

const checkNetworkAccess = (req, res) => {
  const restrictionEnabled = isNetworkRestrictionEnabled();

  if (!restrictionEnabled) {
    return res.json({ restrictionEnabled: false, allowed: true });
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'stockvista-crm',
        audience: 'stockvista-users'
      });

      if (isSuperAdmin(decoded.role)) {
        return res.json({ restrictionEnabled: true, allowed: true });
      }
    } catch {
      // Ignore invalid tokens and fall back to IP check
    }
  }

  res.json({
    restrictionEnabled: true,
    allowed: isIpAllowed(getClientIp(req))
  });
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Validate inputs
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // 2. Fetch user from DB
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = result.rows[0];

    const storedPassword = user.password || '';
    const isHashed =
      storedPassword.startsWith('$2a$') ||
      storedPassword.startsWith('$2b$') ||
      storedPassword.startsWith('$2y$');
    if (!isHashed) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const isMatch = await bcrypt.compare(password, storedPassword);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // 4. Check if user is inactive
    if (user.status.toLowerCase() !== 'active') {
      return res.status(403).json({ message: 'User is inactive. Please contact the administrator.' });
    }

    // 4b. Office network required for non-super-admin users
    if (
      isNetworkRestrictionEnabled() &&
      !isSuperAdmin(user.role) &&
      !isIpAllowed(getClientIp(req))
    ) {
      return res.status(403).json({
        message: 'Login is only allowed from authorized office WiFi networks.',
        code: 'NETWORK_RESTRICTED'
      });
    }

    // 5. Get count of new leads assigned since last login (for RMs) BEFORE updating last_login
    let newLeadsCount = 0;
    if (user.role === 'relationship_mgr') {
      const leadsRes = await pool.query(
        `SELECT COUNT(*) as count FROM leads 
         WHERE assigned_to = $1 
         AND assigned_at IS NOT NULL
         AND assigned_at > COALESCE((SELECT last_login FROM users WHERE id = $1), '1970-01-01'::timestamp)`,
        [user.id]
      );
      newLeadsCount = parseInt(leadsRes.rows[0]?.count || 0);
    }

    // 6. Update last_login timestamp AFTER counting new leads
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // 7. Remove password before responding
    delete user.password;

    // 8. Generate JWT token
    const userObj = {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      status: user.status,
      team_id: user.team_id
    };
    
    const token = generateToken(userObj);
    
    // 9. Return safe user object with token and new leads count
    res.json({
      message: 'Login successful',
      token,
      user: {
        ...userObj,
        is_active: user.status.toLowerCase() === 'active'
      },
      newLeadsCount
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { loginUser, checkNetworkAccess };
