#!/usr/bin/env node
/**
 * Create/fetch the Meta dataset linked to the WhatsApp Business Account,
 * then optionally replay a CTWA test event for a lead.
 *
 * Usage:
 *   node scripts/setupWhatsappCapiDataset.js
 *   node scripts/setupWhatsappCapiDataset.js --lead-id=<uuid>
 *   node scripts/setupWhatsappCapiDataset.js --event=QualifiedLead --lead-id=<uuid>
 *
 * Requires a token with:
 *   whatsapp_business_management
 *   whatsapp_business_manage_events
 *
 * Set either META_CAPI_WHATSAPP_ACCESS_TOKEN (preferred) or META_CAPI_ACCESS_TOKEN.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fetch = require('node-fetch');

const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const token =
  process.env.META_CAPI_WHATSAPP_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN;

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const formatErr = (error) =>
  [
    error?.error_user_title,
    error?.error_user_msg || error?.message,
    error?.code != null ? `code=${error.code}` : null,
    error?.error_subcode != null ? `subcode=${error.error_subcode}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

async function main() {
  if (!wabaId) {
    console.error('Missing WHATSAPP_BUSINESS_ACCOUNT_ID');
    process.exit(1);
  }
  if (!token) {
    console.error('Missing META_CAPI_WHATSAPP_ACCESS_TOKEN / META_CAPI_ACCESS_TOKEN');
    process.exit(1);
  }

  console.log('WABA:', wabaId);
  console.log('Resolving dataset via POST/GET /{WABA_ID}/dataset ...');

  const url = `https://graph.facebook.com/${version}/${wabaId}/dataset?access_token=${encodeURIComponent(token)}`;

  let res = await fetch(url);
  let data = await res.json();
  console.log('GET status', res.status, JSON.stringify(data, null, 2));

  if (!data?.id) {
    res = await fetch(url, { method: 'POST' });
    data = await res.json();
    console.log('POST status', res.status, JSON.stringify(data, null, 2));
  }

  if (!data?.id) {
    console.error('\nFailed to resolve WABA dataset.');
    console.error(formatErr(data.error || data));
    console.error(`
Fix in Meta Business Manager:
1. Use a System User token with whatsapp_business_management + whatsapp_business_manage_events
2. Ensure the token's app/business can manage WABA ${wabaId}
3. Or create/link a dataset to the WABA in Events Manager and set:
   META_CAPI_WHATSAPP_DATASET_ID=<dataset_id>
`);
    process.exit(1);
  }

  const datasetId = String(data.id);
  console.log('\n✅ WABA dataset ID:', datasetId);
  console.log('Add this to backend/.env:');
  console.log(`META_CAPI_WHATSAPP_DATASET_ID=${datasetId}`);

  const leadId = arg('lead-id');
  if (!leadId) return;

  process.env.META_CAPI_WHATSAPP_DATASET_ID = datasetId;
  const db = require('../db');
  const {
    sendCtwaConversionEvent,
    mapStatusToCtwaEvent,
    CTWA_INITIAL_EVENT,
  } = require('../utils/metaConversionsApi');

  const result = await db.query(
    `SELECT id, full_name, phone, email, status, ctwa_clid
     FROM leads WHERE id = $1`,
    [leadId]
  );
  const lead = result.rows[0];
  if (!lead) {
    console.error('Lead not found:', leadId);
    process.exit(1);
  }
  if (!lead.ctwa_clid) {
    console.error('Lead has no ctwa_clid:', leadId);
    process.exit(1);
  }

  const eventName =
    arg('event') || mapStatusToCtwaEvent(lead.status) || CTWA_INITIAL_EVENT;

  console.log('\nReplaying CTWA event for', lead.full_name, {
    status: lead.status,
    event: eventName,
    phone: lead.phone,
  });

  const sendResult = await sendCtwaConversionEvent({
    eventName,
    ctwaClid: lead.ctwa_clid,
    email: lead.email,
    phone: lead.phone,
  });
  console.log('Result:', sendResult);
  process.exit(sendResult.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
