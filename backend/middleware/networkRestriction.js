require('dotenv').config();

const ipaddr = require('ipaddr.js');

const ALWAYS_ALLOWED = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function normalizeIp(ip) {
  if (!ip) return '';

  let trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) {
    trimmed = trimmed.slice(7);
  }

  try {
    return ipaddr.process(trimmed).toString();
  } catch {
    return trimmed.toLowerCase();
  }
}

function ipToLong(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return parts.reduce((acc, octet) => {
    const value = Number(octet);
    if (!Number.isInteger(value) || value < 0 || value > 255) return null;
    return ((acc << 8) + value) >>> 0;
  }, 0);
}

function isIpInCidr(ip, cidr) {
  const [range, prefixLength] = cidr.split('/');
  const normalizedIp = normalizeIp(ip);
  const normalizedRange = normalizeIp(range);

  if (!prefixLength) {
    return normalizedIp === normalizedRange;
  }

  try {
    const addr = ipaddr.process(normalizedIp);
    const rangeAddr = ipaddr.process(normalizedRange);
    const bits = Number(prefixLength);

    if (!Number.isInteger(bits) || bits < 0) {
      return false;
    }

    if (addr.kind() !== rangeAddr.kind()) {
      return false;
    }

    return addr.match(rangeAddr, bits);
  } catch {
    const ipLong = ipToLong(normalizedIp);
    const rangeLong = ipToLong(normalizedRange);
    const bits = Number(prefixLength);

    if (ipLong === null || rangeLong === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
      return false;
    }

    if (bits === 0) return true;

    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (ipLong & mask) === (rangeLong & mask);
  }
}

function getAllowedNetworks() {
  return (process.env.ALLOWED_LOGIN_IPS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isNetworkRestrictionEnabled() {
  return getAllowedNetworks().length > 0;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return normalizeIp(forwarded.split(',')[0]);
  }

  return normalizeIp(
    req.headers['x-real-ip'] ||
      req.ip ||
      req.socket?.remoteAddress ||
      ''
  );
}

function isIpAllowed(ip) {
  const normalizedIp = normalizeIp(ip);

  if (!normalizedIp || ALWAYS_ALLOWED.has(normalizedIp)) {
    return true;
  }

  const allowedNetworks = getAllowedNetworks();
  if (allowedNetworks.length === 0) {
    return true;
  }

  return allowedNetworks.some((entry) => isIpInCidr(normalizedIp, entry));
}

function isSuperAdmin(role) {
  return role === 'super_admin';
}

function restrictToAllowedNetworks(req, res, next) {
  if (!isNetworkRestrictionEnabled()) {
    return next();
  }

  const clientIp = getClientIp(req);

  if (!isIpAllowed(clientIp)) {
    console.warn(`[NETWORK] Blocked request from unauthorized IP: ${clientIp}`);
    return res.status(403).json({
      message: 'Login is only allowed from authorized office WiFi networks.',
      code: 'NETWORK_RESTRICTED'
    });
  }

  next();
}

module.exports = {
  getClientIp,
  isIpAllowed,
  isNetworkRestrictionEnabled,
  isSuperAdmin,
  restrictToAllowedNetworks
};
