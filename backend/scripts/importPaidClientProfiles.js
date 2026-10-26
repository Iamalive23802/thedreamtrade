/**
 * Import DreamTrade paid-client profile CSV into thedreamtrade_db.
 *
 * - Matches existing leads by phone (10-digit)
 * - Sets customer_id from sheet CID (clears then reassigns to avoid UNIQUE clashes)
 * - Updates profile / KYC fields
 * - Creates Paid Client leads for phones not in DB
 * - If payment_history is empty, seeds one approved payment from Total Paid + First Payment Date
 * - Does NOT wipe existing payment_history
 *
 * Usage:
 *   node scripts/importPaidClientProfiles.js [csv-path]
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const Papa = require('papaparse');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DEFAULT_CSV = path.join(
  __dirname,
  'data',
  'All_Paid_Clients_Profile_cleaned.csv'
);
const CSV_PATH = process.argv[2] || DEFAULT_CSV;

if (!fs.existsSync(CSV_PATH)) {
  console.error('CSV not found:', CSV_PATH);
  process.exit(1);
}

if (String(process.env.DB_NAME || '') !== 'thedreamtrade_db') {
  console.error(
    `Refusing to run: DB_NAME="${process.env.DB_NAME}" is not thedreamtrade_db.`
  );
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
  if (!s || ['-', 'NA', 'N/A', 'null', 'No E-mail ID', 'No E-mail'].includes(s)) {
    return '';
  }
  return s;
};

const digits = (v) => String(v || '').replace(/\D/g, '');

const phone10 = (v) => {
  const d = digits(v);
  return d.length >= 10 ? d.slice(-10) : '';
};

function fullName(row) {
  return [row['First Name'], row['Middle Name'], row['Last Name']]
    .map(clean)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSheetDate(raw) {
  const s = clean(raw);
  if (!s) return null;
  // 18-Sep-25 / 05-01-2001 / 18-05-1987
  const mon = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (mon) {
    const months = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    const d = Number(mon[1]);
    const m = months[mon[2].toLowerCase()];
    let y = Number(mon[3]);
    if (y < 100) y += 2000;
    if (!m) return null;
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const dmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = `20${y}`;
    return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function parseAmount(raw) {
  const n = Number(String(raw || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function parseAge(raw) {
  const n = Number(clean(raw));
  return Number.isFinite(n) ? n : null;
}

function normalizeAadhar(raw) {
  const d = digits(raw);
  if (d.length === 12) {
    return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return clean(raw);
}

function seedPaymentHistory(totalPaid, firstPaymentDate) {
  if (!totalPaid || totalPaid <= 0) return '';
  const day = parseSheetDate(firstPaymentDate) || new Date().toISOString().slice(0, 10);
  const iso = `${day}T12:00:00.000Z`;
  // amount__date__utr__approved__assigned_to__assigned_to_name__packageTier__rm1__rm1_name__rm2__rm2_name
  return `${totalPaid}__${iso}____1______`;
}

async function main() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true });
  const rows = parsed.data.filter((r) => clean(r.CID));
  console.log(`Loaded ${rows.length} profile rows from ${CSV_PATH}`);
  console.log(`Target DB: ${process.env.DB_NAME}`);

  // Guard: unique CIDs and phones in sheet
  const cidSet = new Set();
  const phoneSet = new Set();
  for (const r of rows) {
    const cid = clean(r.CID);
    const phone = phone10(r['MOBILE NO.']);
    if (cidSet.has(cid)) throw new Error(`Duplicate CID in sheet: ${cid}`);
    if (!phone || phone.length !== 10) throw new Error(`Bad phone for ${cid}: ${r['MOBILE NO.']}`);
    if (phoneSet.has(phone)) throw new Error(`Duplicate phone in sheet: ${phone} (${cid})`);
    cidSet.add(cid);
    phoneSet.add(phone);
  }
  console.log('Sheet uniqueness OK (CID + phone)');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Free all customer_ids so remapping cannot violate UNIQUE mid-loop
    const cleared = await client.query(
      `UPDATE leads SET customer_id = NULL WHERE customer_id IS NOT NULL`
    );
    console.log(`Cleared customer_id on ${cleared.rowCount} leads`);

    let updated = 0;
    let created = 0;
    let seededPayments = 0;
    let maxSeq = 0;

    for (const r of rows) {
      const cid = clean(r.CID);
      const phone = phone10(r['MOBILE NO.']);
      const name = fullName(r) || `Client ${phone}`;
      const email = clean(r['EMAIL ID']) || null;
      const gender = clean(r.Gender) || '';
      const dob = parseSheetDate(r.DOB);
      const age = parseAge(r.Age);
      const pan = clean(r['PAN NUMBER']).toUpperCase();
      const aadhar = normalizeAadhar(r['Aadhar Card']);
      const state = clean(r.State) || '';
      const tags = clean(r['CRM Tag']);
      const source = clean(r.Source) || '';
      const totalPaid = parseAmount(r['Total Paid AMT']);
      const firstPay = clean(r['First Payment Date']);
      const seq = Number((cid.match(/(\d{4})$/) || [])[1] || 0);
      if (seq > maxSeq) maxSeq = seq;

      const findRes = await client.query(
        `SELECT id, payment_history, full_name, email, tags, notes
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
          paymentHistory = seedPaymentHistory(totalPaid, firstPay);
          seededPayments += 1;
        }

        const nextTags = (() => {
          const existing = clean(lead.tags);
          if (!tags) return existing;
          if (!existing) return tags;
          if (existing.split(',').map((t) => t.trim()).includes(tags)) return existing;
          return `${existing}, ${tags}`;
        })();

        await client.query(
          `UPDATE leads SET
             full_name = $1,
             email = COALESCE($2, email),
             gender = CASE WHEN $3 <> '' THEN $3 ELSE gender END,
             dob = COALESCE($4::date, dob),
             age = COALESCE($5, age),
             pan_card_number = CASE WHEN $6 <> '' THEN $6 ELSE pan_card_number END,
             aadhar_card_number = CASE WHEN $7 <> '' THEN $7 ELSE aadhar_card_number END,
             state_name = CASE WHEN $8 <> '' THEN $8 ELSE state_name END,
             tags = CASE WHEN $9 <> '' THEN $9 ELSE tags END,
             payment_history = $10,
             status = 'Paid Client',
             customer_id = $11,
             phone = $12,
             notes = CASE
               WHEN $13 <> '' AND (notes IS NULL OR notes NOT ILIKE '%' || $13 || '%')
                 THEN COALESCE(notes, '') || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\\n' END || $13
               ELSE notes
             END
           WHERE id = $14`,
          [
            name,
            email,
            gender,
            dob,
            age,
            pan,
            aadhar,
            state,
            nextTags,
            paymentHistory,
            cid,
            phone,
            source ? `Sheet source: ${source}` : '',
            lead.id,
          ]
        );
        updated += 1;
      } else {
        const paymentHistory =
          totalPaid > 0 ? seedPaymentHistory(totalPaid, firstPay) : '';
        if (paymentHistory) seededPayments += 1;
        const noteParts = [
          `Imported from paid clients profile CSV (${cid})`,
          source ? `Sheet source: ${source}` : '',
        ].filter(Boolean);

        await client.query(
          `INSERT INTO leads (
             full_name, phone, email, status, customer_id, payment_history,
             gender, dob, age, pan_card_number, aadhar_card_number, state_name,
             tags, notes, date
           ) VALUES (
             $1,$2,$3,'Paid Client',$4,$5,
             $6,$7::date,$8,$9,$10,$11,
             $12,$13, COALESCE($14::timestamptz, CURRENT_TIMESTAMP)
           )`,
          [
            name,
            phone,
            email,
            cid,
            paymentHistory,
            gender,
            dob,
            age,
            pan,
            aadhar,
            state,
            tags || '',
            noteParts.join('\n'),
            parseSheetDate(firstPay) ? `${parseSheetDate(firstPay)}T12:00:00+05:30` : null,
          ]
        );
        created += 1;
      }
    }

    if (maxSeq > 0) {
      await client.query(
        `SELECT setval('leads_customer_id_seq', GREATEST($1, (SELECT last_value FROM leads_customer_id_seq)))`,
        [maxSeq]
      );
    }

    await client.query('COMMIT');

    const verify = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE customer_id IS NOT NULL) AS with_cid,
         COUNT(*) FILTER (WHERE status = 'Paid Client') AS paid_clients,
         COUNT(*) FILTER (WHERE customer_id IN ('DT25260158','DT25260226')) AS keepers,
         COUNT(*) FILTER (WHERE customer_id IN ('DT25260167','DT25260231')) AS dropped_still_present
       FROM leads`
    );

    console.log('--- Import complete ---');
    console.log({ updated, created, seededPayments, maxSeq });
    console.log('DB verify:', verify.rows[0]);

    const keepers = await pool.query(
      `SELECT customer_id, full_name, phone, payment_history
       FROM leads
       WHERE customer_id IN ('DT25260158','DT25260226')
       ORDER BY customer_id`
    );
    console.log('Clubbed keepers:', keepers.rows.map((r) => ({
      cid: r.customer_id,
      name: r.full_name,
      phone: r.phone,
      paidSeedOrHistory: (r.payment_history || '').slice(0, 80),
    })));
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
