const fetch = require('node-fetch');
const db = require('../db');
const { verifyMetaSignature } = require('../utils/metaSignature');
const { acceptWebhookEvent } = require('../utils/webhookQueue');
const { fetchFormName } = require('../utils/metaFormNames');

const normalizePhone = (p) => (p || '').replace(/\D/g, '').trim();

const toTenDigitPhone = (raw) => {
  const digits = normalizePhone(raw);
  if (digits.length === 10) return digits;
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

const getField = (fieldData, names) => {
  if (!Array.isArray(fieldData)) return '';
  for (const name of names) {
    const row = fieldData.find(
      (f) => f.name && f.name.toLowerCase() === name.toLowerCase()
    );
    if (row?.values?.[0]) return String(row.values[0]).trim();
  }
  return '';
};

const isMetaTestDummy = (value) =>
  typeof value === 'string' && /<test lead:/i.test(value);

const parseLeadFields = (fieldData, leadgenId = '') => {
  const firstName = getField(fieldData, ['first_name', 'firstname']);
  const lastName = getField(fieldData, ['last_name', 'lastname']);
  const rawFullName =
    getField(fieldData, ['full_name', 'full name', 'name']) ||
    [firstName, lastName].filter(Boolean).join(' ').trim();
  const rawPhone = getField(fieldData, [
    'phone_number',
    'phone',
    'mobile',
    'contact_number',
  ]);
  const rawEmail = getField(fieldData, ['email', 'email_address']);

  // Meta Lead Ads Testing Tool sends placeholder text, not real phone digits.
  if (isMetaTestDummy(rawFullName) || isMetaTestDummy(rawPhone)) {
    const digits = String(leadgenId).replace(/\D/g, '');
    const phone =
      digits.length >= 10 ? digits.slice(-10) : digits.padStart(10, '9');
    return {
      fullName: 'Meta Test Lead',
      email: rawEmail && !isMetaTestDummy(rawEmail) ? rawEmail : 'test@meta.com',
      phone,
      city: getField(fieldData, ['city', 'state', 'state_name']),
      isTestLead: true,
    };
  }

  return {
    fullName: rawFullName,
    email: rawEmail,
    phone: toTenDigitPhone(rawPhone),
    city: getField(fieldData, ['city', 'state', 'state_name']),
    isTestLead: false,
  };
};

const verifySignature = (req) =>
  verifyMetaSignature(req, process.env.FACEBOOK_APP_SECRET);

const fetchLeadFromGraph = async (leadgenId) => {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('FACEBOOK_PAGE_ACCESS_TOKEN is not set');

  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  const url =
    `https://graph.facebook.com/${version}/${leadgenId}` +
    `?fields=id,created_time,ad_id,form_id,field_data,campaign_id` +
    `&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || `Graph API error (${res.status})`);
  }
  return data;
};

const notifyMetaOfNewLead = (leadRow) => {
  try {
    const { sendInitialMetaLeadEvent } = require('../utils/metaConversionsApi');
    sendInitialMetaLeadEvent({
      meta_lead_id: leadRow.meta_lead_id,
      email: leadRow.email,
      phone: leadRow.phone,
    }).catch((err) => {
      console.error('[Meta CAPI] Initial lead event failed:', err.message);
    });
  } catch (err) {
    console.error('[Meta CAPI] notifyMetaOfNewLead error:', err.message);
  }
};

const parseMetaCreatedTime = (value) => {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const insertLead = async (lead, meta = {}) => {
  const { fullName, email, phone } = lead;
  if (!fullName || !phone) {
    throw new Error('Lead missing full name or phone after parsing');
  }
  if (phone.length !== 10) {
    throw new Error(`Phone must be 10 digits (got ${phone.length})`);
  }

  const leadgenId = meta.leadgen_id ? String(meta.leadgen_id) : null;
  if (leadgenId) {
    const byMeta = await db.query(
      'SELECT id FROM leads WHERE meta_lead_id = $1',
      [leadgenId]
    );
    if (byMeta.rows.length > 0) {
      return { duplicate: true, id: byMeta.rows[0].id };
    }
  }

  const existing = await db.query('SELECT id FROM leads WHERE phone = $1', [phone]);
  if (existing.rows.length > 0) {
    return { duplicate: true, id: existing.rows[0].id };
  }

  const source = meta.source || 'Instant Form';
  const defaultTags = process.env.FACEBOOK_DEFAULT_TAGS || 'Facebook';
  const tags =
    source === 'Messenger'
      ? `${defaultTags},Messenger`
      : defaultTags;
  const assignedTo = process.env.FACEBOOK_DEFAULT_ASSIGNED_TO || null;
  const teamId = process.env.FACEBOOK_DEFAULT_TEAM_ID || null;
  const formId = meta.form_id ? String(meta.form_id) : null;
  const formName = meta.form_name || (await fetchFormName(formId)) || null;
  const leadDate = parseMetaCreatedTime(meta.created_time);
  const notes = [
    source === 'Messenger' ? 'Facebook Messenger Lead' : 'Facebook Lead Ads',
    lead.isTestLead ? 'Meta Test Lead' : null,
    `Source: ${source}`,
    formName ? `Form Name: ${formName}` : null,
    formId ? `Form: ${formId}` : null,
    meta.ad_id ? `Ad: ${meta.ad_id}` : null,
    meta.campaign_id ? `Campaign: ${meta.campaign_id}` : null,
    leadgenId ? `Lead ID: ${leadgenId}` : null,
    meta.psid ? `PSID: ${meta.psid}` : null,
    lead.city ? `Location: ${lead.city}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  let result;
  try {
    result = await db.query(
    `INSERT INTO leads (
      date, full_name, email, phone, notes, tags, language, team_id, assigned_to, assigned_at,
      meta_lead_id, meta_form_id, meta_form_name, meta_source
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING id, full_name, phone, email, meta_lead_id`,
    [
      leadDate,
      fullName,
      email || null,
      phone,
      notes,
      tags,
      process.env.FACEBOOK_DEFAULT_LANGUAGE || '',
      teamId,
      assignedTo,
      assignedTo ? new Date() : null,
      leadgenId,
      formId,
      formName,
      source,
    ]
  );
  } catch (err) {
    if (err.code === '23505') return { duplicate: true };
    throw err;
  }

  notifyMetaOfNewLead(result.rows[0]);
  return { duplicate: false, lead: result.rows[0] };
};

const fetchLatestLeadFromForm = async (formId) => {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('FACEBOOK_PAGE_ACCESS_TOKEN is not set');

  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  const url =
    `https://graph.facebook.com/${version}/${formId}/leads` +
    `?fields=id,created_time,field_data,form_id&limit=5` +
    `&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Graph API error (${res.status})`);
  }
  return data.data?.[0] || null;
};

const processLeadgen = async (value, extras = {}) => {
  const leadgenId = value?.leadgen_id;
  if (!leadgenId) return;

  console.log('[Facebook] Processing leadgen:', leadgenId, extras.source || 'Instant Form');
  const graphLead = await fetchLeadFromGraph(leadgenId);
  const parsed = parseLeadFields(graphLead.field_data, leadgenId);

  const result = await insertLead(parsed, {
    leadgen_id: leadgenId,
    form_id: value.form_id || graphLead.form_id,
    ad_id: value.ad_id,
    campaign_id: value.campaign_id,
    source: extras.source || 'Instant Form',
    psid: extras.psid || null,
    created_time: graphLead.created_time || value.created_time || null,
  });

  if (result.duplicate) {
    console.log('[Facebook] Duplicate phone, existing lead:', result.id);
  } else {
    console.log('[Facebook] Lead created:', result.lead.id, result.lead.phone);
  }
};

const processMessengerFormSubmit = async (event) => {
  const formId = event?.form?.id || event?.form_id;
  const leadgenId = event?.form?.leadgen_id || event?.leadgen_id;
  const psid = event?.sender?.id || null;

  console.log('[Facebook] Messenger form submit:', { formId, leadgenId, psid });

  if (leadgenId) {
    return processLeadgen(
      { leadgen_id: leadgenId, form_id: formId },
      { source: 'Messenger', psid }
    );
  }

  if (!formId) {
    throw new Error('Messenger form submit missing form id and leadgen id');
  }

  const latest = await fetchLatestLeadFromForm(formId);
  if (!latest?.id) {
    throw new Error(`No recent leads found for Messenger form ${formId}`);
  }

  const parsed = parseLeadFields(latest.field_data, latest.id);
  const result = await insertLead(parsed, {
    leadgen_id: latest.id,
    form_id: formId || latest.form_id,
    source: 'Messenger',
    psid,
    created_time: latest.created_time || null,
  });

  if (result.duplicate) {
    console.log('[Facebook] Duplicate phone, existing lead:', result.id);
  } else {
    console.log('[Facebook] Messenger lead created:', result.lead.id, result.lead.phone);
  }
};

const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.FACEBOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token && expected && token === expected) {
    console.log('[Facebook] Webhook verified');
    return res.status(200).send(challenge);
  }

  console.warn('[Facebook] Webhook verification failed');
  return res.sendStatus(403);
};

const parseWebhookBody = (req) => {
  if (!req.rawBody) return req.body;
  // Keep large Meta IDs as strings (JS numbers can lose precision).
  const text = req.rawBody.toString('utf8').replace(
    /"(leadgen_id|form_id|page_id|ad_id|adgroup_id|campaign_id|id)"\s*:\s*(\d{10,})/g,
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

  if (body?.object === 'whatsapp_business_account') {
    const { handleWhatsAppPayload } = require('./whatsappWebhook');
    await handleWhatsAppPayload(body);
    return;
  }

  if (body?.object !== 'page' || !Array.isArray(body.entry)) return;

  for (const entry of body.entry) {
    for (const change of entry.changes || []) {
      if (change.field === 'leadgen') {
        await processLeadgen(change.value, { source: 'Instant Form' });
      }
      if (change.field === 'messaging_in_thread_lead_form_submit') {
        await processMessengerFormSubmit(change.value || {});
      }
    }

    for (const event of entry.messaging || []) {
      if (!event?.form && !event?.leadgen_id) continue;
      await processMessengerFormSubmit(event);
    }
  }
};

const handleWebhookEvent = async (req, res) => {
  if (!verifySignature(req)) {
    console.warn('[Facebook] Invalid signature');
    return res.sendStatus(403);
  }

  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  try {
    await acceptWebhookEvent({
      source: 'facebook',
      rawBody,
      handler: processRawWebhook,
    });
    return res.sendStatus(200);
  } catch (err) {
    console.error('[Facebook] Webhook processing failed:', err.message);
    return res.sendStatus(500);
  }
};

module.exports = { verifyWebhook, handleWebhookEvent, processRawWebhook };
