const crypto = require('crypto');
const fetch = require('node-fetch');

const sha256 = (value) =>
  crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');

/**
 * Instant Form / Lead Ads CRM write-back event names.
 * These custom funnel names are accepted with action_source=system_generated.
 */
const STATUS_TO_CAPI_EVENT = {
  'Free Trial': 'Free trial',
  // Mid-funnel: must map to Follow Up (not Free trial) so Meta counts match CRM intent.
  'Free Trial – Follow Up': 'Follow Up',
  'Follow Up': 'Follow Up',
  'Follow Up (No Response)': 'Follow Up',
  // Must match Events Manager funnel event names exactly (case-sensitive).
  Won: 'CONVERTED',
  'Paid Client': 'CONVERTED',
  'Not Interested': 'Not qualified',
};

/**
 * CTWA / WhatsApp Business Messaging only accepts Meta's allowlisted event names.
 * Custom CRM names (Follow Up, Raw Lead, etc.) are rejected with subcode 2804066.
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging/
 */
const STATUS_TO_CTWA_EVENT = {
  'Free Trial': 'QualifiedLead',
  'Free Trial – Follow Up': 'QualifiedLead',
  'Follow Up': 'QualifiedLead',
  'Follow Up (No Response)': 'QualifiedLead',
  Won: 'Purchase',
  'Paid Client': 'Purchase',
  // No Meta messaging equivalent for "Not qualified" — skip.
};

const CTWA_INITIAL_EVENT = 'LeadSubmitted';

const normalizeStatus = (status) =>
  String(status || '')
    .replace(/\u2013|\u2014/g, '–')
    .trim();

const mapStatusToCapiEvent = (status) => {
  if (!status) return null;
  const key = normalizeStatus(status);
  return STATUS_TO_CAPI_EVENT[status] || STATUS_TO_CAPI_EVENT[key] || null;
};

const mapStatusToCtwaEvent = (status) => {
  if (!status) return null;
  const key = normalizeStatus(status);
  return STATUS_TO_CTWA_EVENT[status] || STATUS_TO_CTWA_EVENT[key] || null;
};

const hashedUserFields = ({ email, phone }) => ({
  ...(email ? { em: [sha256(email)] } : {}),
  ...(phone
    ? { ph: [sha256(String(phone).replace(/\D/g, '').replace(/^91/, ''))] }
    : {}),
});

const formatMetaError = (error) => {
  if (!error) return 'unknown error';
  if (typeof error === 'string') return error;
  const parts = [
    error.error_user_title,
    error.error_user_msg || error.message,
    error.code != null ? `code=${error.code}` : null,
    error.error_subcode != null ? `subcode=${error.error_subcode}` : null,
    error.fbtrace_id ? `fbtrace=${error.fbtrace_id}` : null,
  ].filter(Boolean);
  return parts.join(' | ');
};

const postCapiEvents = async (payload, datasetId, accessToken) => {
  const pixelId = datasetId || process.env.META_CAPI_PIXEL_ID;
  const token =
    accessToken ||
    process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !token) {
    console.warn('[Meta CAPI] Missing META_CAPI_PIXEL_ID or access token');
    return { skipped: true, reason: 'missing_config' };
  }

  if (process.env.META_CAPI_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_CAPI_TEST_EVENT_CODE;
  }

  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  const url = `https://graph.facebook.com/${version}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();

  if (!res.ok) {
    console.error(
      '[Meta CAPI] Event failed:',
      formatMetaError(data.error || data),
      '| dataset:',
      pixelId,
      '| body:',
      JSON.stringify(data.error || data)
    );
    return { ok: false, error: data.error || data };
  }

  return { ok: true, data };
};

/**
 * Instant Form / Lead Ads CRM write-back (lead_id).
 */
const sendCrmConversionEvent = async ({
  eventName,
  metaLeadId,
  email,
  phone,
  eventTime,
}) => {
  if (!eventName) {
    return { skipped: true, reason: 'unmapped_status' };
  }
  if (!metaLeadId) {
    return { skipped: true, reason: 'missing_meta_lead_id' };
  }

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime || Math.floor(Date.now() / 1000),
        action_source: 'system_generated',
        user_data: {
          lead_id: String(metaLeadId),
          ...hashedUserFields({ email, phone }),
        },
        custom_data: {
          lead_event_source: process.env.META_CAPI_LEAD_EVENT_SOURCE || 'DreamTrade CRM',
          event_source: 'crm',
        },
      },
    ],
  };

  const result = await postCapiEvents(payload);
  if (result.ok) {
    console.log('[Meta CAPI] CRM event sent:', eventName, 'lead:', metaLeadId, result.data);
  }
  return result;
};

/**
 * Resolve the dataset linked to the WABA.
 * Prefer META_CAPI_WHATSAPP_DATASET_ID. Optionally auto-create/fetch via Graph.
 * Do NOT fall back to the website pixel — Meta rejects CTWA events on non-WABA datasets (2804132).
 */
const resolveWhatsappDatasetId = async () => {
  if (process.env.META_CAPI_WHATSAPP_DATASET_ID) {
    return {
      datasetId: process.env.META_CAPI_WHATSAPP_DATASET_ID,
      source: 'env',
    };
  }

  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const token =
    process.env.META_CAPI_WHATSAPP_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN;
  if (!wabaId || !token) {
    return { datasetId: null, source: null };
  }

  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  const url = `https://graph.facebook.com/${version}/${wabaId}/dataset?access_token=${encodeURIComponent(token)}`;

  try {
    let res = await fetch(url);
    let data = await res.json();
    if (data?.id) {
      return { datasetId: String(data.id), source: 'graph_get' };
    }

    res = await fetch(url, { method: 'POST' });
    data = await res.json();
    if (data?.id) {
      console.log('[Meta CAPI] Created/linked WABA dataset:', data.id);
      return { datasetId: String(data.id), source: 'graph_post' };
    }

    console.error(
      '[Meta CAPI] Could not resolve WABA dataset:',
      formatMetaError(data.error || data)
    );
  } catch (err) {
    console.error('[Meta CAPI] WABA dataset lookup failed:', err.message);
  }

  return { datasetId: null, source: null };
};

/**
 * CTWA / WhatsApp Business Messaging write-back (ctwa_clid).
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging/
 */
const sendCtwaConversionEvent = async ({
  eventName,
  ctwaClid,
  email,
  phone,
  eventTime,
  value,
  currency,
}) => {
  if (!eventName) {
    return { skipped: true, reason: 'unmapped_status' };
  }
  if (!ctwaClid) {
    return { skipped: true, reason: 'missing_ctwa_clid' };
  }

  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!wabaId) {
    console.warn('[Meta CAPI] Missing WHATSAPP_BUSINESS_ACCOUNT_ID for CTWA events');
    return { skipped: true, reason: 'missing_waba_id' };
  }

  const { datasetId, source } = await resolveWhatsappDatasetId();
  if (!datasetId) {
    console.error(
      '[Meta CAPI] Missing META_CAPI_WHATSAPP_DATASET_ID. ' +
        'CTWA events require a dataset linked to the WhatsApp Business Account ' +
        '(Events Manager → link dataset to WABA, or POST /{WABA_ID}/dataset). ' +
        'Do not use the website pixel ID.'
    );
    return { skipped: true, reason: 'missing_whatsapp_dataset' };
  }

  // WhatsApp messaging CAPI needs a token that can write to the WABA dataset.
  // Prefer META_CAPI_WHATSAPP_ACCESS_TOKEN (from DreamTrade Wp / system user).
  const waToken =
    process.env.META_CAPI_WHATSAPP_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN;
  if (!waToken) {
    console.error('[Meta CAPI] Missing META_CAPI_WHATSAPP_ACCESS_TOKEN / META_CAPI_ACCESS_TOKEN');
    return { skipped: true, reason: 'missing_whatsapp_token' };
  }

  const eventPayload = {
    event_name: eventName,
    event_time: eventTime || Math.floor(Date.now() / 1000),
    action_source: 'business_messaging',
    messaging_channel: 'whatsapp',
    user_data: {
      whatsapp_business_account_id: String(wabaId),
      ctwa_clid: String(ctwaClid),
      ...hashedUserFields({ email, phone }),
    },
  };

  // Purchase requires currency + value for business messaging.
  if (eventName === 'Purchase') {
    eventPayload.custom_data = {
      currency: currency || process.env.META_CAPI_DEFAULT_CURRENCY || 'INR',
      value:
        value != null
          ? Number(value)
          : Number(process.env.META_CAPI_DEFAULT_PURCHASE_VALUE || 1),
    };
  }

  const payload = {
    data: [eventPayload],
    partner_agent: process.env.META_CAPI_PARTNER_AGENT || 'DreamTrade CRM',
  };

  console.log('[Meta CAPI] Sending CTWA event', {
    event: eventName,
    dataset: datasetId,
    dataset_source: source,
    waba: wabaId,
  });

  const result = await postCapiEvents(payload, datasetId, waToken);
  if (result.ok) {
    console.log(
      '[Meta CAPI] CTWA event sent:',
      eventName,
      'ctwa_clid:',
      String(ctwaClid).slice(0, 16) + '…',
      result.data
    );
  }
  return result;
};

const sendStatusChangeToMeta = async (lead, previousStatus) => {
  try {
    if (previousStatus && previousStatus === lead.status) {
      return { skipped: true, reason: 'status_unchanged' };
    }

    // Prefer CTWA business-messaging path when ctwa_clid is present.
    if (lead?.ctwa_clid) {
      const eventName = mapStatusToCtwaEvent(lead.status);
      if (!eventName) {
        console.log('[Meta CAPI] Skip CTWA: unmapped/unsupported messaging status', {
          from: previousStatus,
          to: lead.status,
          phone: lead.phone,
        });
        return { skipped: true, reason: 'unmapped_ctwa_status', status: lead.status };
      }

      console.log('[Meta CAPI] CTWA status change', {
        from: previousStatus,
        to: lead.status,
        event: eventName,
        phone: lead.phone,
      });
      return await sendCtwaConversionEvent({
        eventName,
        ctwaClid: lead.ctwa_clid,
        email: lead.email,
        phone: lead.phone,
      });
    }

    const eventName = mapStatusToCapiEvent(lead.status);
    if (!eventName) {
      console.log('[Meta CAPI] Skip: unmapped status', {
        from: previousStatus,
        to: lead.status,
        meta_lead_id: lead.meta_lead_id,
        ctwa_clid: 'no',
      });
      return { skipped: true, reason: 'unmapped_status', status: lead.status };
    }

    if (!lead?.meta_lead_id) {
      console.log('[Meta CAPI] Skip: no meta_lead_id or ctwa_clid', {
        phone: lead?.phone,
        status: lead?.status,
      });
      return { skipped: true, reason: 'missing_meta_attribution' };
    }

    console.log('[Meta CAPI] Status change', {
      from: previousStatus,
      to: lead.status,
      event: eventName,
      meta_lead_id: lead.meta_lead_id,
      phone: lead.phone,
    });

    return await sendCrmConversionEvent({
      eventName,
      metaLeadId: lead.meta_lead_id,
      email: lead.email,
      phone: lead.phone,
    });
  } catch (err) {
    console.error('[Meta CAPI] sendStatusChangeToMeta error:', err.message);
    return { ok: false, error: err.message };
  }
};

const sendInitialMetaLeadEvent = async (lead) => {
  try {
    if (!lead?.meta_lead_id) return { skipped: true };
    return await sendCrmConversionEvent({
      eventName: 'Raw Lead',
      metaLeadId: lead.meta_lead_id,
      email: lead.email,
      phone: lead.phone,
    });
  } catch (err) {
    console.error('[Meta CAPI] sendInitialMetaLeadEvent error:', err.message);
    return { ok: false, error: err.message };
  }
};

const sendInitialCtwaLeadEvent = async (lead) => {
  try {
    if (!lead?.ctwa_clid) return { skipped: true };
    return await sendCtwaConversionEvent({
      eventName: CTWA_INITIAL_EVENT,
      ctwaClid: lead.ctwa_clid,
      email: lead.email,
      phone: lead.phone,
    });
  } catch (err) {
    console.error('[Meta CAPI] sendInitialCtwaLeadEvent error:', err.message);
    return { ok: false, error: err.message };
  }
};

module.exports = {
  mapStatusToCapiEvent,
  mapStatusToCtwaEvent,
  sendCrmConversionEvent,
  sendCtwaConversionEvent,
  sendStatusChangeToMeta,
  sendInitialMetaLeadEvent,
  sendInitialCtwaLeadEvent,
  resolveWhatsappDatasetId,
  STATUS_TO_CAPI_EVENT,
  STATUS_TO_CTWA_EVENT,
  CTWA_INITIAL_EVENT,
};
