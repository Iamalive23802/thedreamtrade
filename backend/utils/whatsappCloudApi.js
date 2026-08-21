const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');

const graphVersion = () => process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const getAccessToken = () =>
  process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_CAPI_WHATSAPP_ACCESS_TOKEN || '';
const getPhoneNumberId = () => process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const getWabaId = () => process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
const graphBase = () => `https://graph.facebook.com/${graphVersion()}`;

const requireConfig = () => {
  const token = getAccessToken();
  const phoneNumberId = getPhoneNumberId();
  if (!token) {
    const err = new Error('Missing WHATSAPP_ACCESS_TOKEN (or META_CAPI_WHATSAPP_ACCESS_TOKEN)');
    err.code = 'WHATSAPP_NOT_CONFIGURED';
    throw err;
  }
  if (!phoneNumberId) {
    const err = new Error('Missing WHATSAPP_PHONE_NUMBER_ID');
    err.code = 'WHATSAPP_NOT_CONFIGURED';
    throw err;
  }
  return { token, phoneNumberId };
};

const parseGraphError = async (res, fallback) => {
  let detail = fallback;
  try {
    const json = await res.json();
    detail = json?.error?.message || json?.error?.error_user_msg || JSON.stringify(json);
  } catch {
    // ignore
  }
  const err = new Error(detail);
  err.status = res.status;
  return err;
};

const graphJson = async (url, options = {}) => {
  const { token } = requireConfig();
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw await parseGraphError(res, `Graph API ${res.status}`);
  return res.json();
};

const sendMessage = async (payload) => {
  const { phoneNumberId } = requireConfig();
  return graphJson(`${graphBase()}/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...payload,
    }),
  });
};

const sendText = async ({ to, body }) =>
  sendMessage({ to, type: 'text', text: { preview_url: false, body } });

const sendTemplate = async ({ to, name, language, components }) =>
  sendMessage({
    to,
    type: 'template',
    template: {
      name,
      language: { code: language || 'en_US' },
      ...(Array.isArray(components) && components.length ? { components } : {}),
    },
  });

const sendMediaMessage = async ({ to, type, mediaId, caption, filename }) => {
  const media = { id: mediaId };
  if (caption && ['image', 'video', 'document'].includes(type)) media.caption = caption;
  if (filename && type === 'document') media.filename = filename;
  return sendMessage({ to, type, [type]: media });
};

const uploadMedia = async ({ filePath, mimeType, filename }) => {
  const { token, phoneNumberId } = requireConfig();
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', fs.createReadStream(filePath), {
    filename: filename || path.basename(filePath),
    contentType: mimeType,
  });
  const res = await fetch(`${graphBase()}/${phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
    body: form,
  });
  if (!res.ok) throw await parseGraphError(res, `Media upload failed (${res.status})`);
  return res.json();
};

const downloadMediaToFile = async (mediaId, destPath) => {
  const { token } = requireConfig();
  const meta = await graphJson(`${graphBase()}/${mediaId}`);
  if (!meta?.url) throw new Error('Graph media URL missing');
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Failed to download media (${res.status})`);
  const buffer = await res.buffer();
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await fs.promises.writeFile(destPath, buffer);
  return {
    mimeType: meta.mime_type || res.headers.get('content-type') || 'application/octet-stream',
    fileSize: meta.file_size || buffer.length,
  };
};

let templateCache = { at: 0, data: null };
const listTemplates = async ({ force = false } = {}) => {
  const wabaId = getWabaId();
  if (!wabaId) {
    const err = new Error('Missing WHATSAPP_BUSINESS_ACCOUNT_ID');
    err.code = 'WHATSAPP_NOT_CONFIGURED';
    throw err;
  }
  if (!force && templateCache.data && Date.now() - templateCache.at < 5 * 60 * 1000) {
    return templateCache.data;
  }
  const templates = [];
  let url = `${graphBase()}/${wabaId}/message_templates?limit=100`;
  while (url) {
    const json = await graphJson(url);
    templates.push(...(json.data || []));
    url = json.paging?.next || null;
  }
  const approved = templates.filter((t) => String(t.status || '').toUpperCase() === 'APPROVED');
  templateCache = { at: Date.now(), data: approved };
  return approved;
};

const extractOutboundWamid = (graphResponse) => graphResponse?.messages?.[0]?.id || null;

module.exports = {
  getAccessToken,
  getPhoneNumberId,
  getWabaId,
  sendText,
  sendTemplate,
  sendMediaMessage,
  uploadMedia,
  downloadMediaToFile,
  listTemplates,
  extractOutboundWamid,
};
