/**
 * Import Old Paid Client Sheet (DT2425…) into thedreamtrade_db.
 * Does NOT clear existing DT2526/DT2627 customer_ids.
 *
 * Usage:
 *   node scripts/importOldPaidClientProfiles.js [csv-path]
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const Papa = require('papaparse');
const { extractCustomerSequence } = require('../utils/customerId');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DEFAULT_CSV =
  '/root/.cursor/projects/1791289156002/attachments/85c1cb58-8a1e-4516-960e-2e3525408cd5/All_Paid_Clients_Profile__-_Old_Paid_Client_Sheet.csv';
const CSV_PATH = process.argv[2] || DEFAULT_CSV;

if (!fs.existsSync(CSV_PATH)) {
  console.error('CSV not found:', CSV_PATH);
  process.exit(1);
}
if (String(process.env.DB_NAME || '') !== 'thedreamtrade_db') {
  console.error(`Refusing to run: DB_NAME="${process.env.DB_NAME}"`);
  process.exit(1);
}

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
});

const clean = (v) => {
  const s = String(v ?? '').trim();
  if (!s || ['-', 'NA', 'N/A', 'null', 'No E-mail ID', 'No E-mail'].includes(s)) return '';
  return s;
};
const phone10 = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};
const parseAmount = (raw) => {
  const n = Number(String(raw || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const fullName = (row) =>
  [row['First Name'], row['Last Name']].map(clean).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

const getCid = (row) => clean(row.CID || row['Column 27']);

function seedPayment(totalPaid) {
  if (!totalPaid || totalPaid <= 0) return '';
  // FY 24-25 midpoint-ish default date for seed when sheet has no payment date
  return `${totalPaid}__2024-12-16T12:00:00.000Z____1______`;
}

async function main() {
  const rows = Papa.parse(fs.readFileSync(CSV_PATH, 'utf8'), {
    header: true,
    skipEmptyLines: true,
  }).data.filter((r) => getCid(r));

  console.log(`Loaded ${rows.length} old paid client rows`);
  console.log(`Target DB: ${process.env.DB_NAME}`);

  const cidSet = new Set();
  const phoneSet = new Set();
  for (const r of rows) {
    const cid = getCid(r);
    const phone = phone10(r['Mobile No.'] || r['MOBILE NO.']);
    if (!/^DT\d{8}$/.test(cid)) throw new Error(`Bad CID: ${cid}`);
    if (cidSet.has(cid)) throw new Error(`Duplicate CID: ${cid}`);
    if (phone.length !== 10) throw new Error(`Bad phone for ${cid}: ${r['Mobile No.']}`);
    if (phoneSet.has(phone)) throw new Error(`Duplicate phone: ${phone}`);
    cidSet.add(cid);
    phoneSet.add(phone);
  }
  console.log('Sheet uniqueness OK');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let updated = 0;
    let created = 0;
    let seeded = 0;
    let maxSeq = 0;
    const cidMoved = [];

    for (const r of rows) {
      const cid = getCid(r);
      const phone = phone10(r['Mobile No.'] || r['MOBILE NO.']);
      const name = fullName(r) || `Client ${phone}`;
      const email = clean(r['Email ID'] || r['EMAIL ID']) || null;
      const totalPaid = parseAmount(r['Total Amount Paid'] || r['Total Paid AMT']);
      const seq = extractCustomerSequence(cid) || 0;
      if (seq > maxSeq) maxSeq = seq;

      // If this CID is already on another lead, free it first
      const cidOwner = await client.query(
        `SELECT id, phone FROM leads WHERE customer_id = $1`,
        [cid]
      );
      if (cidOwner.rows.length) {
        const ownerPhone = phone10(cidOwner.rows[0].phone);
        if (ownerPhone !== phone) {
          await client.query(`UPDATE leads SET customer_id = NULL WHERE id = $1`, [
            cidOwner.rows[0].id,
          ]);
          cidMoved.push({ cid, from: ownerPhone, to: phone });
        }
      }

      const findRes = await client.query(
        `SELECT id, payment_history, customer_id
         FROM leads
         WHERE RIGHT(regexp_replace(COALESCE(phone,''), '\\D', '', 'g'), 10) = $1
         ORDER BY CASE WHEN status IN ('Paid Client','Won') THEN 0 ELSE 1 END,
                  date DESC NULLS LAST
         LIMIT 1`,
        [phone]
      );

      if (findRes.rows.length) {
        const lead = findRes.rows[0];
        const hasPayments =
          lead.payment_history && String(lead.payment_history).trim() !== '';
        let paymentHistory = lead.payment_history || '';
        if (!hasPayments && totalPaid > 0) {
          paymentHistory = seedPayment(totalPaid);
          seeded += 1;
        }

        await client.query(
          `UPDATE leads SET
             full_name = $1,
             email = COALESCE($2, email),
             payment_history = $3,
             status = 'Paid Client',
             customer_id = $4,
             phone = $5,
             notes = CASE
               WHEN notes IS NULL OR notes NOT ILIKE '%Old Paid Client Sheet%'
                 THEN COALESCE(notes,'') || CASE WHEN COALESCE(notes,'')='' THEN '' ELSE E'\\n' END
                      || 'Imported from Old Paid Client Sheet (' || $4 || ')'
               ELSE notes
             END
           WHERE id = $6`,
          [name, email, paymentHistory, cid, phone, lead.id]
        );
        updated += 1;
      } else {
        const paymentHistory = totalPaid > 0 ? seedPayment(totalPaid) : '';
        if (paymentHistory) seeded += 1;
        await client.query(
          `INSERT INTO leads (
             full_name, phone, email, status, customer_id, payment_history,
             notes, date
           ) VALUES (
             $1,$2,$3,'Paid Client',$4,$5,
             $6, '2024-12-16T12:00:00+05:30'::timestamptz
           )`,
          [
            name,
            phone,
            email,
            cid,
            paymentHistory,
            `Imported from Old Paid Client Sheet (${cid})`,
          ]
        );
        created += 1;
      }
    }

    // Keep sequence at least max of all trailing seqs in DB
    const seqRes = await client.query(`
      SELECT COALESCE(MAX(NULLIF(substring(customer_id from '(\\d{4})$'), '')::int), 0) AS max_seq
      FROM leads WHERE customer_id IS NOT NULL
    `);
    const dbMax = Number(seqRes.rows[0].max_seq || 0);
    const nextMax = Math.max(maxSeq, dbMax);
    if (nextMax > 0) {
      await client.query(
        `SELECT setval('leads_customer_id_seq', GREATEST($1::bigint, (SELECT last_value FROM leads_customer_id_seq)))`,
        [nextMax]
      );
    }

    await client.query('COMMIT');

    const verify = await pool.query(`
      SELECT left(customer_id, 6) AS prefix, COUNT(*)::int AS n
      FROM leads WHERE customer_id IS NOT NULL
      GROUP BY 1 ORDER BY 1
    `);
    const janak = await pool.query(
      `SELECT customer_id, full_name, phone, payment_history
       FROM leads WHERE customer_id = 'DT24250007'`
    );

    console.log('--- Import complete ---');
    console.log({ updated, created, seeded, maxSeq, cidMoved: cidMoved.length });
    if (cidMoved.length) console.log('CID reassigned from other phones:', cidMoved.slice(0, 10));
    console.log('Prefixes:', verify.rows);
    console.log('DT24250007:', janak.rows[0]);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    console.error('Import failed, rolled back:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
