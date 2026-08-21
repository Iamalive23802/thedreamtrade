const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const { authenticateToken } = require('./middleware/auth');

const userRoutes = require('./routes/users');
const teamRoutes = require('./routes/teams');
const authRoutes = require('./routes/auth');
const leadRoutes = require('./routes/leads');
const marketRoutes = require('./routes/market');
const facebookWebhookRoutes = require('./routes/facebookWebhook');
const whatsappWebhookRoutes = require('./routes/whatsappWebhook');

const app = express();
const PORT = process.env.PORT || 5050;
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(compression());
app.use(
  express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      const url = req.originalUrl || '';
      if (
        url.startsWith('/api/webhooks/facebook') ||
        url.startsWith('/api/webhooks/whatsapp')
      ) {
        req.rawBody = buf;
      }
    },
  })
);

app.use((req, res, next) => {
  console.log(`[INCOMING] ${req.method} ${req.originalUrl}`);
  next();
});

app.get('/test', (req, res) => {
  res.json({ message: 'Server is working' });
});

app.use('/api/webhooks/facebook', facebookWebhookRoutes);
app.use('/api/webhooks/whatsapp', whatsappWebhookRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/teams', authenticateToken, teamRoutes);
app.use('/api/leads', authenticateToken, leadRoutes);
app.use('/api/market', authenticateToken, marketRoutes);

try {
  const { inboxAuthorize } = require('./utils/whatsappInboxAccess');
  const whatsappInboxRoutes = require('./routes/whatsappInbox');
  app.use('/api/whatsapp', authenticateToken, inboxAuthorize, whatsappInboxRoutes);
  console.log('Mounting WhatsApp inbox at /api/whatsapp');
} catch (err) {
  console.warn('WhatsApp inbox routes not loaded:', err.message);
}

app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.stack || err.message}`);
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ message: err.message });
  }
  res.status(500).json({ message: 'Internal Server Error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
});
