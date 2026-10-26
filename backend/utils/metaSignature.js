const crypto = require('crypto');

const verifyMetaSignature = (req, secret) => {
  if (!secret) return false;

  const signature = req.headers['x-hub-signature-256'];
  if (!signature || !req.rawBody) return false;

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');

  const actualBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length) return false;

  return crypto.timingSafeEqual(actualBuf, expectedBuf);
};

const requireMetaAppSecrets = () => {
  const missing = ['WHATSAPP_APP_SECRET', 'FACEBOOK_APP_SECRET'].filter(
    (key) => !process.env[key]
  );
  if (missing.length > 0) {
    console.error(
      `Missing required webhook app secrets: ${missing.join(', ')}. Refusing to start.`
    );
    process.exit(1);
  }
};

module.exports = { verifyMetaSignature, requireMetaAppSecrets };
