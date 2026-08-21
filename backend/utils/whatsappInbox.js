const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const cloudApi = require('./whatsappCloudApi');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'whatsapp');
const SESSION_MS = 24 * 60 * 60 * 1000;
const MEDIA_TYPES = new Set(['image', 'audio', 'video', 'document', 'sticker']);

const ensureUploadDir = () => fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const parseWaTimestamp = (value) => {
  if (value == null || value === '') return new Date();
  const raw = String(value).trim();
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 0) {
    const ms = asNum < 1e12 ? asNum * 1000 : asNum;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const previewFor = ({ type, body, filename }) => {
  if (type === 'text' || type === 'template') {
    return (body || '').slice(0, 80) || (type === 'template' ? '[Template]' : '');
  }
  const labels = {
    image: '[Photo]', audio: '[Audio]', video: '[Video]',
    document: filename ? `[File] ${filename}` : '[File]',
    sticker: '[Sticker]', location: body || '[Location]', unknown: body || '[Message]',
  };
  return labels[type] || (body ? body.slice(0, 80) : '[Message]');
};

const extensionFor = (mimeType, filename) => {
  if (filename && path.extname(filename)) return path.extname(filename);
  const map = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a',
    'video/mp4': '.mp4', 'application/pdf': '.pdf',
  };
  return map[mimeType] || '';
};

const extractInboundContent = (message) => {
  const type = message?.type || 'unknown';
  if (type === 'text') return { type: 'text', body: message.text?.body || '' };
  if (type === 'button') return { type: 'text', body: message.button?.text || '' };
  if (type === 'interactive') {
    const body =
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title || '';
    return { type: 'text', body: String(body) };
  }
  if (MEDIA_TYPES.has(type)) {
    const media = message[type] || {};
    return {
      type, body: media.caption || '', graphMediaId: media.id || null,
      mimeType: media.mime_type || null, filename: media.filename || null,
    };
  }
  if (type === 'location') {
    const loc = message.location || {};
    return { type: 'location', body: [loc.name, loc.address].filter(Boolean).join(' | ') };
  }
  return { type: 'unknown', body: `[${type}]` };
};

const isSessionOpen = (lastCustomerMessageAt) => {
  if (!lastCustomerMessageAt) return false;
  const at = new Date(lastCustomerMessageAt).getTime();
  return Number.isFinite(at) && Date.now() - at < SESSION_MS;
};

const withSession = (conversation) => {
  if (!conversation) return conversation;
  const at = conversation.last_customer_message_at
    ? new Date(conversation.last_customer_message_at).getTime()
    : null;
  return {
    ...conversation,
    session_open: isSessionOpen(conversation.last_customer_message_at),
    session_expires_at: at ? new Date(at + SESSION_MS).toISOString() : null,
  };
};

const upsertConversation = async ({ waId, phone, contactName, leadId }) => {
  const result = await db.query(
    `INSERT INTO whatsapp_conversations (wa_id, phone, contact_name, lead_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (wa_id)
     DO UPDATE SET
       phone = COALESCE(NULLIF(EXCLUDED.phone, ''), whatsapp_conversations.phone),
       contact_name = CASE
         WHEN EXCLUDED.contact_name IS NULL OR EXCLUDED.contact_name = '' THEN whatsapp_conversations.contact_name
         WHEN whatsapp_conversations.contact_name IS NULL OR whatsapp_conversations.contact_name = '' THEN EXCLUDED.contact_name
         WHEN whatsapp_conversations.contact_name ILIKE 'whatsapp lead%' THEN EXCLUDED.contact_name
         ELSE whatsapp_conversations.contact_name
       END,
       lead_id = COALESCE(whatsapp_conversations.lead_id, EXCLUDED.lead_id),
       updated_at = NOW()
     RETURNING *`,
    [waId, phone || null, contactName || null, leadId || null]
  );
  return result.rows[0];
};

const touchConversation = async ({ conversationId, preview, at, inbound }) => {
  await db.query(
    `UPDATE whatsapp_conversations SET
       last_message_at = $2,
       last_message_preview = $3,
       last_customer_message_at = CASE WHEN $4 THEN $2 ELSE last_customer_message_at END,
       unread_count = CASE WHEN $4 THEN unread_count + 1 ELSE unread_count END,
       updated_at = NOW()
     WHERE id = $1`,
    [conversationId, at, preview, inbound]
  );
};

const insertMessage = async (fields) => {
  const result = await db.query(
    `INSERT INTO whatsapp_messages (
       conversation_id, wamid, direction, type, body, graph_media_id, local_filename,
       mime_type, filename, status, error_message, template_name, template_language,
       sent_by_user_id, wa_timestamp, raw
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (wamid) WHERE wamid IS NOT NULL AND wamid <> ''
     DO UPDATE SET status = COALESCE(EXCLUDED.status, whatsapp_messages.status)
     RETURNING *, (xmax = 0) AS inserted`,
    [
      fields.conversationId, fields.wamid || null, fields.direction, fields.type,
      fields.body || null, fields.graphMediaId || null, fields.localFilename || null,
      fields.mimeType || null, fields.filename || null, fields.status || 'sent',
      fields.errorMessage || null, fields.templateName || null, fields.templateLanguage || null,
      fields.sentByUserId || null, fields.waTimestamp || new Date(), fields.raw || null,
    ]
  );
  const row = result.rows[0];
  row._inserted = !!row.inserted;
  delete row.inserted;
  return row;
};

const downloadInboundMedia = async (messageRow) => {
  if (!messageRow?.graph_media_id || messageRow.local_filename) return messageRow;
  if (!MEDIA_TYPES.has(messageRow.type)) return messageRow;
  try {
    ensureUploadDir();
    const ext = extensionFor(messageRow.mime_type, messageRow.filename);
    const localFilename = `${messageRow.id}${ext || ''}`;
    const dest = path.join(UPLOAD_DIR, localFilename);
    const meta = await cloudApi.downloadMediaToFile(messageRow.graph_media_id, dest);
    const updated = await db.query(
      `UPDATE whatsapp_messages SET local_filename = $2, mime_type = COALESCE(NULLIF($3, ''), mime_type)
       WHERE id = $1 RETURNING *`,
      [messageRow.id, localFilename, meta.mimeType || null]
    );
    return updated.rows[0] || messageRow;
  } catch (err) {
    console.error('[WhatsApp inbox] Media download failed:', err.message);
    return messageRow;
  }
};

const persistInboundMessage = async ({ message, waId, phone, contactName, leadId }) => {
  if (!waId) return { skipped: true, reason: 'missing_wa_id' };
  const conversation = await upsertConversation({ waId, phone, contactName, leadId });
  const content = extractInboundContent(message);
  const at = parseWaTimestamp(message.timestamp);
  const inserted = await insertMessage({
    conversationId: conversation.id,
    wamid: message.id || null,
    direction: 'inbound',
    type: content.type,
    body: content.body,
    graphMediaId: content.graphMediaId,
    mimeType: content.mimeType,
    filename: content.filename,
    status: 'delivered',
    waTimestamp: at,
    raw: { type: message.type, referral: message.referral || null },
  });
  if (inserted._inserted) {
    await touchConversation({
      conversationId: conversation.id,
      preview: previewFor(content),
      at,
      inbound: true,
    });
  }
  if (content.graphMediaId) {
    downloadInboundMedia(inserted).catch((err) => {
      console.error('[WhatsApp inbox] async media download:', err.message);
    });
  }
  return { conversation, message: inserted };
};

const persistStatusUpdate = async (status) => {
  const wamid = status?.id;
  if (!wamid) return { skipped: true };
  const mapped = String(status.status || '').toLowerCase();
  if (!['sent', 'delivered', 'read', 'failed'].includes(mapped)) return { skipped: true };
  const errorMessage =
    mapped === 'failed'
      ? status.errors?.[0]?.title || status.errors?.[0]?.message || 'Failed'
      : null;
  const updated = await db.query(
    `UPDATE whatsapp_messages SET status = $2, error_message = COALESCE($3, error_message)
     WHERE wamid = $1 RETURNING *`,
    [wamid, mapped, errorMessage]
  );
  return { message: updated.rows[0] };
};

const persistOutboundMessage = async ({
  conversation, wamid, type, body, graphMediaId, localFilename, mimeType, filename,
  status, errorMessage, templateName, templateLanguage, sentByUserId, raw,
}) => {
  const at = new Date();
  const inserted = await insertMessage({
    conversationId: conversation.id, wamid, direction: 'outbound', type, body,
    graphMediaId, localFilename, mimeType, filename,
    status: status || (wamid ? 'sent' : 'failed'),
    errorMessage, templateName, templateLanguage, sentByUserId, waTimestamp: at, raw,
  });
  await touchConversation({
    conversationId: conversation.id,
    preview: previewFor({ type, body, filename }),
    at,
    inbound: false,
  });
  delete inserted._inserted;
  return inserted;
};

const getConversation = async (id) => {
  const result = await db.query(
    `SELECT c.*, l.full_name AS lead_full_name, l.status AS lead_status, l.ctwa_clid
     FROM whatsapp_conversations c
     LEFT JOIN leads l ON l.id = c.lead_id
     WHERE c.id = $1`,
    [id]
  );
  return result.rows[0] ? withSession(result.rows[0]) : null;
};

const listConversations = async ({ q } = {}) => {
  const params = [];
  let where = '';
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    where = `WHERE c.contact_name ILIKE $1 OR c.phone ILIKE $1 OR c.wa_id ILIKE $1 OR c.last_message_preview ILIKE $1`;
  }
  const result = await db.query(
    `SELECT c.*, l.full_name AS lead_full_name, l.status AS lead_status, l.ctwa_clid
     FROM whatsapp_conversations c
     LEFT JOIN leads l ON l.id = c.lead_id
     ${where}
     ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC
     LIMIT 200`,
    params
  );
  return result.rows.map(withSession);
};

const listMessages = async (conversationId, { limit = 200 } = {}) => {
  const result = await db.query(
    `SELECT * FROM whatsapp_messages WHERE conversation_id = $1
     ORDER BY wa_timestamp ASC, created_at ASC LIMIT $2`,
    [conversationId, Math.min(Number(limit) || 200, 500)]
  );
  return result.rows;
};

const markConversationRead = async (conversationId) => {
  await db.query(`UPDATE whatsapp_conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1`, [conversationId]);
};

const getMessage = async (id) => {
  const result = await db.query('SELECT * FROM whatsapp_messages WHERE id = $1', [id]);
  return result.rows[0] || null;
};

const mediaFilePath = (localFilename) => {
  if (!localFilename) return null;
  return path.join(UPLOAD_DIR, path.basename(localFilename));
};

module.exports = {
  UPLOAD_DIR, SESSION_MS, ensureUploadDir, isSessionOpen, withSession,
  persistInboundMessage, persistStatusUpdate, persistOutboundMessage,
  upsertConversation, getConversation, listConversations, listMessages,
  markConversationRead, getMessage, mediaFilePath, previewFor, uuidv4,
};
