/**
 * Parts of a calendar date in Asia/Kolkata (IST) for Indian FY rules.
 */
function getIstParts(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return getIstParts(new Date());
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month), // 1-12
    day: Number(map.day),
  };
}

/**
 * Indian financial year code from a date (IST).
 * FY Apr 2026 – Mar 2027 → "2627"
 */
function getFinancialYearCode(input) {
  const { year, month } = getIstParts(input);
  // FY starts 1 April
  const startYear = month >= 4 ? year : year - 1;
  const yy1 = String(startYear).slice(-2).padStart(2, '0');
  const yy2 = String(startYear + 1).slice(-2).padStart(2, '0');
  return `${yy1}${yy2}`;
}

/**
 * Build customer id: DT + FY + 4-digit sequence
 * e.g. DT26270507
 */
function buildCustomerId(sequenceNumber, date = new Date()) {
  const seq = String(Number(sequenceNumber) || 0).padStart(4, '0');
  return `DT${getFinancialYearCode(date)}${seq}`;
}

/**
 * Earliest payment date from payment_history string, or null.
 */
function earliestPaymentDate(paymentHistory) {
  if (!paymentHistory || typeof paymentHistory !== 'string') return null;
  let earliest = null;
  for (const entry of paymentHistory.split('|||')) {
    if (!entry.trim()) continue;
    const datePart = entry.split('__')[1];
    if (!datePart) continue;
    const t = new Date(datePart).getTime();
    if (Number.isNaN(t)) continue;
    if (earliest == null || t < earliest) earliest = t;
  }
  return earliest == null ? null : new Date(earliest);
}

/**
 * Best date to use for FY on an existing paid client.
 */
function resolveCustomerIdDate({ paymentHistory, date, assignedAt, wonOn } = {}) {
  const candidates = [
    earliestPaymentDate(paymentHistory),
    wonOn ? new Date(wonOn) : null,
    assignedAt ? new Date(assignedAt) : null,
    date ? new Date(date) : null,
  ].filter((d) => d && !Number.isNaN(d.getTime()));
  return candidates[0] || new Date();
}

/**
 * Extract trailing 4-digit sequence from DT#### or DT######## ids.
 */
function extractCustomerSequence(customerId) {
  if (!customerId) return null;
  const m = String(customerId).match(/(\d{4})$/);
  return m ? Number(m[1]) : null;
}

module.exports = {
  getFinancialYearCode,
  buildCustomerId,
  earliestPaymentDate,
  resolveCustomerIdDate,
  extractCustomerSequence,
};
