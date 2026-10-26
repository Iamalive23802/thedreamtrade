/**
 * Recompute customer_id FY prefix from earliest payment date (IST).
 * Keeps trailing 4-digit sequence. Example: DT25260232 → DT26270232
 *
 * Usage: node scripts/recomputeCustomerIdFy.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const {
  buildCustomerId,
  resolveCustomerIdDate,
  extractCustomerSequence,
  getFinancialYearCode,
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
    SELECT id, customer_id, full_name, payment_history, date, assigned_at
    FROM leads
    WHERE customer_id IS NOT NULL
    ORDER BY customer_id
  `);

  const planned = [];
  const byNewCid = new Map();

  for (const row of rows) {
    const seq = extractCustomerSequence(row.customer_id);
    if (seq == null) continue;
    const fyDate = resolveCustomerIdDate({
      paymentHistory: row.payment_history,
      date: row.date,
      assignedAt: row.assigned_at,
    });
    const nextId = buildCustomerId(seq, fyDate);
    if (byNewCid.has(nextId)) {
      throw new Error(`Duplicate target CID ${nextId}`);
    }
    byNewCid.set(nextId, row.id);
    planned.push({
      id: row.id,
      old: row.customer_id,
      next: nextId,
      fy: getFinancialYearCode(fyDate),
      changed: nextId !== row.customer_id,
    });
  }

  const changing = planned.filter((p) => p.changed);
  console.log(`Updating ${changing.length} / ${planned.length} customer IDs`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE leads SET customer_id = NULL WHERE customer_id IS NOT NULL');
    for (const p of planned) {
      await client.query('UPDATE leads SET customer_id = $1 WHERE id = $2', [p.next, p.id]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const verify = await pool.query(`
    SELECT left(customer_id, 6) AS prefix, COUNT(*)::int AS n
    FROM leads WHERE customer_id IS NOT NULL
    GROUP BY 1 ORDER BY 1
  `);
  console.log('Done.', verify.rows);
  await pool.end();
})().catch(async (err) => {
  console.error(err);
  try { await pool.end(); } catch (_) { /* ignore */ }
  process.exit(1);
});
