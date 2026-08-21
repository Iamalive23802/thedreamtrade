/**
 * Convert leads.date from DATE (day-only) to TIMESTAMPTZ so lead arrival
 * times are stored (fixes UI showing 05:30:00 IST for every lead).
 *
 * Usage: node scripts/migrateLeadDateToTimestamptz.js
 */
require('dotenv').config();
const db = require('../db');

(async () => {
  const col = await db.query(
    `SELECT data_type, udt_name, column_default
     FROM information_schema.columns
     WHERE table_name = 'leads' AND column_name = 'date'`
  );

  if (!col.rows.length) {
    throw new Error('leads.date column not found');
  }

  const { data_type, udt_name } = col.rows[0];
  console.log('Current leads.date:', col.rows[0]);

  if (udt_name === 'timestamptz' || data_type === 'timestamp with time zone') {
    await db.query(`ALTER TABLE leads ALTER COLUMN date SET DEFAULT NOW()`);
    console.log('Already timestamptz; default set to NOW()');
    process.exit(0);
  }

  await db.query('BEGIN');
  try {
    // DATE → timestamptz keeps calendar day at 00:00 in the session TZ (UTC here).
    // Existing rows keep midnight; new inserts store real times via NOW()/explicit date.
    await db.query(`
      ALTER TABLE leads
        ALTER COLUMN date TYPE timestamptz
        USING CASE
          WHEN date IS NULL THEN NULL
          ELSE date::timestamp AT TIME ZONE 'UTC'
        END
    `);
    await db.query(`ALTER TABLE leads ALTER COLUMN date SET DEFAULT NOW()`);
    await db.query('COMMIT');
    console.log('Migrated leads.date to timestamptz with DEFAULT NOW()');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }

  const after = await db.query(
    `SELECT data_type, udt_name, column_default
     FROM information_schema.columns
     WHERE table_name = 'leads' AND column_name = 'date'`
  );
  console.log('After:', after.rows[0]);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
