#!/usr/bin/env node
/**
 * One-shot / cron entry for 24-hour Not Connected auto-reassignment.
 * Usage: node scripts/runTwentyFourHourReassignment.js
 */
require('dotenv').config();
const pool = require('../db');
const { processTwentyFourHourReassignments } = require('../utils/autoReassign');

(async () => {
  try {
    console.log(`[24h-reassign] Starting at ${new Date().toISOString()}`);
    const results = await processTwentyFourHourReassignments(pool);
    const ok = results.filter((r) => r.ok).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => r.failure || r.error).length;
    console.log(`[24h-reassign] Done. processed=${results.length} reassigned=${ok} skipped=${skipped} failed=${failed}`);
    process.exit(0);
  } catch (err) {
    console.error('[24h-reassign] Fatal:', err);
    process.exit(1);
  }
})();
