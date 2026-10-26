const db = require('../db');
const { verifyMetaSignature } = require('../utils/metaSignature');
const { acceptWebhookEvent } = require('../utils/webhookQueue');

const normalizePhone = (p) => (p || '').replace(/\D/g, '').trim();

const toTenDigitPhone = (raw) => {
  const digits = normalizePhone(raw);
  if (digits.length === 10) return digits;
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

const initialNewNotes = (at) => {
  const date = (at instanceof Date ? at : new Date(at)).toISOString();
  return `New____${date}__—`;
};

const verifySignature = (req) =>
  verifyMetaSignature(req, process.env.WHATSAPP_APP_SECRET);

const notifyMetaOfNewCtwaLead = (leadRow) => {
  try {
    const { sendInitialCtwaLeadEvent } = require('../utils/metaConversionsApi');
    sendInitialCtwaLeadEvent({
      ctwa_clid: leadRow.ctwa_clid,
      email: leadRow.email,
      phone: leadRow.phone,
      wa_id: leadRow.wa_id,
    }).catch((err) => {
      console.error('[Meta CAPI] Initial CTWA event failed:', err.message);
    });
  } catch (err) {
    console.error('[Meta CAPI] notifyMetaOfNewCtwaLead error:', err.message);
  }
};

const parseMessageTimestamp = (value) => {
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

const persistInboxMessage = async ({ message, waId, phone, contactName, leadId }) => {
  try {
    const { persistInboundMessage } = require('../utils/whatsappInbox');
    await persistInboundMessage({ message, waId, phone, contactName, leadId });
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return;
    console.error('[WhatsApp] Inbox persist failed:', err.message);
    throw err;
  }
};

const processStatusUpdates = async (statuses) => {
  if (!Array.isArray(statuses) || statuses.length === 0) return;
  try {
    const { persistStatusUpdate } = require('../utils/whatsappInbox');
    for (const status of statuses) {
      try {
        await persistStatusUpdate(status);
      } catch (err) {
        console.error('[WhatsApp] Status persist failed:', err.message);
        throw err;
      }
    }
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return;
    console.error('[WhatsApp] Status persist failed:', err.message);
    throw err;
  }
};

const upsertCtwaLead = async ({
  fullName,
  phone,
  waId,
  referral,
  wabaId,
  messageTimestamp,
}) => {
  const ctwaClid = referral?.ctwa_clid ? String(referral.ctwa_clid) : null;
  if (!ctwaClid) {
    return { skipped: true, reason: 'missing_ctwa_clid' };
  }
  if (!phone || phone.length !== 10) {
    throw new Error(`CTWA phone must be 10 digits (got ${phone || 'empty'})`);
  }

  const existingByClid = await db.query(
    'SELECT id, phone, ctwa_clid FROM leads WHERE ctwa_clid = $1',
    [ctwaClid]
  );
  if (existingByClid.rows.length > 0) {
    return { duplicate: true, id: existingByClid.rows[0].id, reason: 'ctwa_clid' };
  }

  const adId = referral?.source_id ? String(referral.source_id) : null;
  const defaultTags = process.env.WHATSAPP_DEFAULT_TAGS || 'CTWA,WhatsApp';
  const assignedTo = process.env.WHATSAPP_DEFAULT_ASSIGNED_TO || process.env.FACEBOOK_DEFAULT_ASSIGNED_TO || null;
  const teamId = process.env.WHATSAPP_DEFAULT_TEAM_ID || process.env.FACEBOOK_DEFAULT_TEAM_ID || null;

  const existingByPhone = await db.query(
    'SELECT id, notes, ctwa_clid, meta_source FROM leads WHERE phone = $1',
    [phone]
  );

  if (existingByPhone.rows.length > 0) {
    const row = existingByPhone.rows[0];
    const updated = await db.query(
      `UPDATE leads SET
        ctwa_clid = COALESCE(NULLIF(ctwa_clid, ''), $1),
        meta_ad_id = COALESCE(NULLIF(meta_ad_id, ''), $2),
        wa_id = COALESCE(NULLIF(wa_id, ''), $3),
        meta_source = CASE
          WHEN meta_source IS NULL OR meta_source = '' THEN 'CTWA'
          WHEN meta_source ILIKE '%CTWA%' THEN meta_source
          ELSE meta_source || ',CTWA'
        END,
        tags = CASE
          WHEN tags IS NULL OR tags = '' THEN $4
          WHEN tags ILIKE '%CTWA%' THEN tags
          ELSE tags || ',' || $4
        END,
        full_name = CASE
          WHEN full_name IS NULL OR full_name = '' OR full_name ILIKE 'whatsapp lead%' THEN $5
          ELSE full_name
        END
      WHERE id = $6
      RETURNING id, full_name, phone, email, ctwa_clid, wa_id, meta_source`,
      [ctwaClid, adId, waId || null, defaultTags, fullName, row.id]
    );

    const lead = updated.rows[0];
    if (!row.ctwa_clid) {
      notifyMetaOfNewCtwaLead(lead);
    }
    return { duplicate: false, attached: true, lead };
  }

  const leadDate = parseMessageTimestamp(messageTimestamp);
  let result;
  try {
    result = await db.query(
    `INSERT INTO leads (
      date, full_name, email, phone, notes, tags, language, team_id, assigned_to, assigned_at,
      meta_source, ctwa_clid, meta_ad_id, wa_id, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING id, full_name, phone, email, ctwa_clid, wa_id, meta_source`,
    [
      leadDate,
      fullName,
      null,
      phone,
      initialNewNotes(leadDate),
      defaultTags,
      process.env.WHATSAPP_DEFAULT_LANGUAGE || process.env.FACEBOOK_DEFAULT_LANGUAGE || '',
      teamId,
      assignedTo,
      assignedTo ? new Date() : null,
      'CTWA',
      ctwaClid,
      adId,
      waId || null,
      'New',
    ]
  );
  } catch (err) {
    if (err.code === '23505') return { duplicate: true, reason: 'ctwa_clid' };
    throw err;
  }

  notifyMetaOfNewCtwaLead(result.rows[0]);
  return { duplicate: false, attached: false, lead: result.rows[0], wabaId };
};

const upsertWhatsAppLead = async ({
  fullName,
  phone,
  waId,
  messageTimestamp,
}) => {
  if (!phone || phone.length !== 10) {
    throw new Error(`WhatsApp phone must be 10 digits (got ${phone || 'empty'})`);
  }

  const defaultTags = process.env.WHATSAPP_DEFAULT_TAGS || 'WhatsApp';
  const assignedTo =
    process.env.WHATSAPP_DEFAULT_ASSIGNED_TO ||
    process.env.FACEBOOK_DEFAULT_ASSIGNED_TO ||
    null;
  const teamId =
    process.env.WHATSAPP_DEFAULT_TEAM_ID ||
    process.env.FACEBOOK_DEFAULT_TEAM_ID ||
    null;

  const existingByPhone = await db.query(
    'SELECT id, notes, meta_source FROM leads WHERE phone = $1',
    [phone]
  );

  if (existingByPhone.rows.length > 0) {
    const row = existingByPhone.rows[0];
    const updated = await db.query(
      `UPDATE leads SET
        wa_id = COALESCE(NULLIF(wa_id, ''), $1),
        meta_source = CASE
          WHEN meta_source IS NULL OR meta_source = '' THEN 'WhatsApp'
          WHEN meta_source ILIKE '%WhatsApp%' THEN meta_source
          ELSE meta_source || ',WhatsApp'
        END,
        tags = CASE
          WHEN tags IS NULL OR tags = '' THEN $2
          WHEN tags ILIKE '%WhatsApp%' THEN tags
          ELSE tags || ',' || $2
        END,
        full_name = CASE
          WHEN full_name IS NULL OR full_name = '' OR full_name ILIKE 'whatsapp lead%' THEN $3
          ELSE full_name
        END
      WHERE id = $4
      RETURNING id, full_name, phone, meta_source`,
      [waId || null, defaultTags, fullName, row.id]
    );
    return { duplicate: false, attached: true, lead: updated.rows[0] };
  }

  const leadDate = parseMessageTimestamp(messageTimestamp);
  let result;
  try {
    result = await db.query(
    `INSERT INTO leads (
      date, full_name, email, phone, notes, tags, language, team_id, assigned_to, assigned_at,
      meta_source, wa_id, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id, full_name, phone, meta_source`,
    [
      leadDate,
      fullName,
      null,
      phone,
      initialNewNotes(leadDate),
      defaultTags,
      process.env.WHATSAPP_DEFAULT_LANGUAGE || process.env.FACEBOOK_DEFAULT_LANGUAGE || '',
      teamId,
      assignedTo,
      assignedTo ? new Date() : null,
      'WhatsApp',
      waId || null,
      'New',
    ]
  );
  } catch (err) {
    if (err.code === '23505') return { duplicate: true };
    throw err;
  }

  return { duplicate: false, attached: false, lead: result.rows[0] };
};

const processInboundMessage = async (value) => {
  const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
  const messages = Array.isArray(value?.messages) ? value.messages : [];

  if (messages.length === 0) {
    console.log('[WhatsApp] Webhook received (no user messages)', {
      phone_number_id: value?.metadata?.phone_number_id || null,
      statuses: statuses.length,
    });
    await processStatusUpdates(statuses);
    return;
  }

  await processStatusUpdates(statuses);

  const contacts = Array.isArray(value.contacts) ? value.contacts : [];
  const wabaId =
    value?.metadata?.phone_number_id ||
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
    null;

  for (const message of messages) {
    const referral = message.referral;
    const waId = String(message.from || contacts[0]?.wa_id || '').replace(/\D/g, '');
    const phone = toTenDigitPhone(waId);
    const profileName = (
      contacts.find(
        (c) =>
          normalizePhone(c.wa_id) === waId ||
          normalizePhone(c.wa_id).endsWith(phone)
      )?.profile?.name ||
      contacts[0]?.profile?.name ||
      ''
    ).trim();
    const fullName = profileName || `WhatsApp Lead ${phone.slice(-4) || ''}`.trim();

    console.log('[WhatsApp] Inbound message:', {
      type: message.type,
      phone,
      has_referral: !!referral,
      ctwa_clid: referral?.ctwa_clid || null,
      source_type: referral?.source_type || null,
    });

    let leadId = null;
    const isAdReferral =
      !referral?.source_type || String(referral.source_type).toLowerCase() === 'ad';

    if (referral?.ctwa_clid && isAdReferral) {
      console.log('[WhatsApp] Processing CTWA message:', {
        phone,
        ctwa_clid: referral.ctwa_clid,
        ad: referral.source_id,
      });

      try {
        const result = await upsertCtwaLead({
          fullName,
          phone,
          waId,
          referral,
          wabaId,
          messageTimestamp: message.timestamp,
        });

        if (result.skipped) {
          console.log('[WhatsApp] Skipped:', result.reason);
        } else if (result.duplicate) {
          console.log('[WhatsApp] Duplicate CTWA clid, existing lead:', result.id);
          leadId = result.id || null;
        } else if (result.attached) {
          console.log('[WhatsApp] CTWA attached to existing lead:', result.lead.id, result.lead.phone);
          leadId = result.lead?.id || null;
        } else {
          console.log('[WhatsApp] CTWA lead created:', result.lead.id, result.lead.phone);
          leadId = result.lead?.id || null;
        }

        if (!leadId) {
          const fallback = await upsertWhatsAppLead({
            fullName,
            phone,
            waId,
            messageTimestamp: message.timestamp,
          });
          leadId = fallback.lead?.id || null;
        }
      } catch (err) {
        console.error('[WhatsApp] Failed to upsert CTWA lead:', err.message);
        throw err;
      }
    } else {
      try {
        const result = await upsertWhatsAppLead({
          fullName,
          phone,
          waId,
          messageTimestamp: message.timestamp,
        });
        if (result.duplicate) {
          console.log('[WhatsApp] Duplicate WhatsApp lead');
        } else if (result.attached) {
          console.log('[WhatsApp] Updated existing WhatsApp lead:', result.lead.id, result.lead.phone);
        } else {
          console.log('[WhatsApp] WhatsApp lead created:', result.lead.id, result.lead.phone);
        }
        leadId = result.lead?.id || null;
      } catch (err) {
        console.error('[WhatsApp] Failed to upsert WhatsApp lead:', err.message);
        throw err;
      }
    }

    await persistInboxMessage({
      message,
      waId,
      phone,
      contactName: fullName,
      leadId,
    });
  }
};

const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected =
    process.env.WHATSAPP_VERIFY_TOKEN || process.env.FACEBOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token && expected && token === expected) {
    console.log('[WhatsApp] Webhook verified');
    return res.status(200).send(challenge);
  }

  console.warn('[WhatsApp] Webhook verification failed');
  return res.sendStatus(403);
};

const parseWebhookBody = (req) => {
  if (!req.rawBody) return req.body;
  const text = req.rawBody.toString('utf8').replace(
    /"(id|from|source_id|phone_number_id)"\s*:\s*(\d{10,})/g,
    '"$1":"$2"'
  );
  try {
    return JSON.parse(text);
  } catch {
    return req.body;
  }
};

const processRawWebhook = async (rawText) => {
  const body = parseWebhookBody({ rawBody: Buffer.from(rawText || '', 'utf8') });
  await handleWhatsAppPayload(body);
};

const handleWebhookEvent = async (req, res) => {
  if (!verifySignature(req)) {
    console.warn('[WhatsApp] Invalid signature');
    return res.sendStatus(403);
  }

  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  try {
    await acceptWebhookEvent({
      source: 'whatsapp',
      rawBody,
      handler: processRawWebhook,
    });
    return res.sendStatus(200);
  } catch (err) {
    console.error('[WhatsApp] Webhook processing failed:', err.message);
    return res.sendStatus(500);
  }
};

const handleWhatsAppPayload = async (body) => {
  if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
    return false;
  }
  for (const entry of body.entry) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      await processInboundMessage(change.value || {});
    }
  }
  return true;
};

module.exports = {
  verifyWebhook,
  handleWebhookEvent,
  handleWhatsAppPayload,
  processRawWebhook,
  processInboundMessage,
  upsertCtwaLead,
};
