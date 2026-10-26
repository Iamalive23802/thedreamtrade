const fetch = require('node-fetch');
const db = require('../db');

const CACHE_MS = 10 * 60 * 1000;

let pageFormNames = null;
let pageFormNamesAt = 0;
let pageFormsBlocked = false;

const graphVersion = () => process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';

const mappedFormNames = () => {
  try {
    const mapped = JSON.parse(process.env.FACEBOOK_FORM_NAMES || '{}');
    return mapped && typeof mapped === 'object' ? mapped : {};
  } catch {
    return {};
  }
};

const formAccessToken = () =>
  process.env.FACEBOOK_FORM_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

const graphGet = async (path, token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN) => {
  if (!token) throw new Error('FACEBOOK_PAGE_ACCESS_TOKEN is not set');

  const url =
    `https://graph.facebook.com/${graphVersion()}/${path}` +
    `${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { timeout: 8000 });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || `Graph API error (${res.status})`);
    err.graphCode = data.error?.code;
    throw err;
  }
  return data;
};

const loadPageFormNames = async () => {
  if (pageFormNames && Date.now() - pageFormNamesAt < CACHE_MS) return pageFormNames;
  if (pageFormsBlocked && Date.now() - pageFormNamesAt < CACHE_MS) return {};

  const names = {};
  try {
    const me = await graphGet('me?fields=id');
    let path = `${me.id}/leadgen_forms?fields=id,name&limit=100`;
    for (let page = 0; page < 20 && path; page += 1) {
      const data = await graphGet(path);
      for (const form of data.data || []) {
        if (form?.id && form?.name) names[String(form.id)] = String(form.name);
      }
      const next = data.paging?.next;
      if (!next) break;
      path = next.replace(`https://graph.facebook.com/${graphVersion()}/`, '');
    }
    pageFormNames = names;
    pageFormsBlocked = false;
    pageFormNamesAt = Date.now();
    return names;
  } catch (err) {
    pageFormNames = null;
    pageFormsBlocked = true;
    pageFormNamesAt = Date.now();
    console.warn('[Facebook] Could not list lead form names:', err.message);
    return {};
  }
};

const fetchFormName = async (formId) => {
  if (!formId) return '';
  const id = String(formId);
  const mapped = mappedFormNames()[id];
  if (mapped) return String(mapped);

  const fromPage = await loadPageFormNames();
  if (fromPage[id]) return fromPage[id];

  try {
    const data = await graphGet(`${id}?fields=id,name`, formAccessToken());
    if (data.name) return String(data.name);
  } catch (err) {
    console.warn('[Facebook] Could not resolve form name:', err.message);
  }
  return '';
};

const resolveMissingFormNames = async () => {
  const { rows } = await db.query(
    `SELECT DISTINCT meta_form_id
     FROM leads
     WHERE meta_form_id IS NOT NULL
       AND meta_form_id <> ''
       AND (meta_form_name IS NULL OR btrim(meta_form_name) = '')`
  );
  if (rows.length === 0) return { checked: 0, updated: 0 };

  let updated = 0;
  for (const row of rows) {
    const name = await fetchFormName(row.meta_form_id);
    if (!name) continue;
    const result = await db.query(
      `UPDATE leads
       SET meta_form_name = $1
       WHERE meta_form_id = $2
         AND (meta_form_name IS NULL OR btrim(meta_form_name) = '')`,
      [name, row.meta_form_id]
    );
    updated += result.rowCount || 0;
  }
  return { checked: rows.length, updated };
};

module.exports = {
  fetchFormName,
  resolveMissingFormNames,
};
