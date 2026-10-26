const crypto = require('crypto');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let cachedKey;

function getKey() {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.RESPONSE_ENC_KEY || '';
  let key = null;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    key = null;
  }
  cachedKey = key && key.length === 32 ? key : null;
  if (!cachedKey) {
    console.warn('[encryptResponse] RESPONSE_ENC_KEY missing or not 32 bytes; API JSON stays plaintext');
  }
  return cachedKey;
}

function encryptJson(value) {
  const key = getKey();
  if (!key) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  };
}

function shouldSkip(req) {
  const url = req.originalUrl || req.url || '';
  const pathOnly = url.split('?')[0];
  if (!pathOnly.startsWith('/api/')) return true;
  if (pathOnly.startsWith('/api/webhooks')) return true;
  return false;
}

function encryptResponse(req, res, next) {
  if (shouldSkip(req) || !getKey()) return next();
  const original = res.json.bind(res);
  res.json = (body) => {
    if (res.headersSent) return original(body);
    try {
      return original(encryptJson(body));
    } catch (err) {
      console.error('[encryptResponse]', err.message);
      return original(body);
    }
  };
  next();
}

module.exports = { encryptResponse, encryptJson };
