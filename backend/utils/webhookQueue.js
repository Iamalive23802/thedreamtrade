const crypto = require('crypto');
const db = require('../db');

const STALE_PROCESSING = '2 minutes';
let tableReady = null;

const ensureWebhookEventsTable = async () => {
  if (!tableReady) {
    tableReady = db.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id BIGSERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        dedupe_key TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        UNIQUE (source, dedupe_key)
      )
    `).catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  await tableReady;
};

const dispatchStoredEvent = async (source, rawText) => {
  if (source === 'whatsapp') {
    const { processRawWebhook } = require('../controllers/whatsappWebhook');
    await processRawWebhook(rawText);
    return;
  }
  if (source === 'facebook') {
    const { processRawWebhook } = require('../controllers/facebookWebhook');
    await processRawWebhook(rawText);
    return;
  }
  throw new Error(`Unknown webhook source: ${source}`);
};

const markProcessed = (id) =>
  db.query(
    `UPDATE webhook_events
     SET status = 'processed', processed_at = NOW(), updated_at = NOW(), last_error = NULL
     WHERE id = $1`,
    [id]
  );

const markFailed = (id, err) =>
  db.query(
    `UPDATE webhook_events
     SET status = 'failed', attempts = attempts + 1, last_error = $2, updated_at = NOW()
     WHERE id = $1`,
    [id, String(err?.message || err).slice(0, 500)]
  );

const acceptWebhookEvent = async ({ source, rawBody, handler }) => {
  await ensureWebhookEventsTable();
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''));
  const dedupeKey = crypto.createHash('sha256').update(bodyBuf).digest('hex');
  const payload = bodyBuf.toString('utf8');

  const inserted = await db.query(
    `INSERT INTO webhook_events (source, dedupe_key, payload, status)
     VALUES ($1, $2, $3, 'processing')
     ON CONFLICT (source, dedupe_key) DO NOTHING
     RETURNING id`,
    [source, dedupeKey, payload]
  );

  let eventId = inserted.rows[0]?.id;
  if (!eventId) {
    const claimed = await db.query(
      `UPDATE webhook_events
       SET status = 'processing', updated_at = NOW()
       WHERE source = $1 AND dedupe_key = $2
         AND (
           status IN ('pending', 'failed')
           OR (status = 'processing' AND updated_at < NOW() - INTERVAL '${STALE_PROCESSING}')
         )
       RETURNING id`,
      [source, dedupeKey]
    );
    eventId = claimed.rows[0]?.id;
    if (!eventId) {
      const existing = await db.query(
        `SELECT status FROM webhook_events WHERE source = $1 AND dedupe_key = $2`,
        [source, dedupeKey]
      );
      if (existing.rows[0]?.status === 'processed') {
        return { ok: true, duplicate: true };
      }
      const err = new Error('Webhook event is already being processed');
      err.retryable = true;
      throw err;
    }
  }

  try {
    await handler(payload);
    await markProcessed(eventId);
    return { ok: true };
  } catch (err) {
    await markFailed(eventId, err);
    throw err;
  }
};

const recoverWebhookEvents = async () => {
  await ensureWebhookEventsTable();
  const claimed = await db.query(
    `UPDATE webhook_events
     SET status = 'processing', updated_at = NOW()
     WHERE status IN ('pending', 'failed')
        OR (status = 'processing' AND updated_at < NOW() - INTERVAL '${STALE_PROCESSING}')
     RETURNING id, source, payload`
  );

  for (const row of claimed.rows) {
    try {
      await dispatchStoredEvent(row.source, row.payload);
      await markProcessed(row.id);
      console.log(`[webhook-queue] recovered ${row.source} event ${row.id}`);
    } catch (err) {
      await markFailed(row.id, err);
      console.error(`[webhook-queue] recovery failed for ${row.id}:`, err.message);
    }
  }
  return claimed.rows.length;
};

const startWebhookRecovery = () => {
  const intervalMs = Number(process.env.WEBHOOK_RECOVERY_INTERVAL_MS || 60 * 1000);
  const tick = () => {
    recoverWebhookEvents().catch((err) => {
      console.error('[webhook-queue] recovery tick failed:', err.message);
    });
  };
  setTimeout(tick, 20_000);
  setInterval(tick, intervalMs);
};

module.exports = {
  ensureWebhookEventsTable,
  acceptWebhookEvent,
  recoverWebhookEvents,
  startWebhookRecovery,
};
