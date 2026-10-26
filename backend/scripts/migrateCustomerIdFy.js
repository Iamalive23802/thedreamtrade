/**
 * Rewrite customer_id from DT0507 → DT26270507 using Indian FY of the
 * earliest payment date (fallback: assigned_at / lead date).
 *
 * Usage: node scripts/migrateCustomerIdFy.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const {
  buildCustomerId,
  resolveCustomerIdDate,
  extractCustomerSequence,
} = require('../utils/customerId');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

(async () => {
  const { rows } = await pool.query(`
    SELECT id, customer_id, payment_history, date, assigned_at
    FROM leads
    WHERE customer_id IS NOT NULL
      AND customer_id ~ '^DT[0-9]{4}$'
    ORDER BY customer_id ASC
  `);

  console.log(`Found ${rows.length} old-format customer IDs to migrate`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const seq = extractCustomerSequence(row.customer_id);
    if (seq == null) {
      skipped += 1;
      continue;
    }

    const fyDate = resolveCustomerIdDate({
      paymentHistory: row.payment_history,
      date: row.date,
      assignedAt: row.assigned_at,
    });
    const nextId = buildCustomerId(seq, fyDate);

    if (nextId === row.customer_id) {
      skipped += 1;
      continue;
    }

    try {
      await pool.query(
        'UPDATE leads SET customer_id = $1 WHERE id = $2 AND customer_id = $3',
        [nextId, row.id, row.customer_id]
      );
      updated += 1;
      if (updated <= 8 || updated % 50 === 0) {
        console.log(`${row.customer_id} → ${nextId}`);
      }
    } catch (err) {
      console.error(`Failed ${row.customer_id} → ${nextId}:`, err.message);
      skipped += 1;
    }
  }

  const check = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE customer_id ~ '^DT[0-9]{4}$') AS old_fmt,
      COUNT(*) FILTER (WHERE customer_id ~ '^DT[0-9]{8}$') AS new_fmt,
      COUNT(*) AS total
    FROM leads WHERE customer_id IS NOT NULL
  `);
  console.log('Done.', { updated, skipped, ...check.rows[0] });

  const samples = await pool.query(`
    SELECT customer_id, full_name
    FROM leads
    WHERE customer_id IS NOT NULL
    ORDER BY customer_id DESC
    LIMIT 5
  `);
  console.log('Latest samples:', samples.rows);

  await pool.end();
})().catch(async (err) => {
  console.error(err);
  try { await pool.end(); } catch (_) { /* ignore */ }
  process.exit(1);
});
