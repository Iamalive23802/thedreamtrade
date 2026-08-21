/**
 * One-time / idempotent migration for CTWA columns on leads.
 * Usage: node scripts/migrateCtwaColumns.js
 */
require('dotenv').config();
const db = require('../db');

(async () => {
  await db.query(`
    ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS ctwa_clid text,
      ADD COLUMN IF NOT EXISTS meta_ad_id text,
      ADD COLUMN IF NOT EXISTS meta_campaign_id text,
      ADD COLUMN IF NOT EXISTS wa_id text
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS leads_ctwa_clid_uidx
      ON leads (ctwa_clid)
      WHERE ctwa_clid IS NOT NULL AND ctwa_clid <> ''
  `);
  console.log('CTWA columns ready');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
