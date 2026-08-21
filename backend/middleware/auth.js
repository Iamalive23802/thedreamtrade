const jwt = require('jsonwebtoken');
require('dotenv').config();
const { getClientIp, isIpAllowed, isNetworkRestrictionEnabled, isSuperAdmin } = require('./networkRestriction');

// JWT secret key - must be set in environment
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is not set!');
  console.error('Please set a strong JWT secret in your .env file');
  process.exit(1);
}

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000), // issued at
    },
    JWT_SECRET,
    { 
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'stockvista-crm',
      audience: 'stockvista-users'
    }
  );
};

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  // Get token from header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN format

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'stockvista-crm',
      audience: 'stockvista-users'
    });
    
    // Check if token is expired
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({ message: 'Token has expired.' });
    }
    
    req.user = decoded;

    if (
      isNetworkRestrictionEnabled() &&
      !isSuperAdmin(decoded.role) &&
      !isIpAllowed(getClientIp(req))
    ) {
      return res.status(403).json({
        message: 'Access is only allowed from authorized office WiFi networks.',
        code: 'NETWORK_RESTRICTED'
      });
    }

    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return res.status(403).json({ message: 'Invalid token.' });
  }
};

// Middleware to check user role
const authorizeRoles = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
};

module.exports = {
  generateToken,
  authenticateToken,
  authorizeRoles,
  JWT_SECRET
};