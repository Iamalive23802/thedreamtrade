export type PackageTier = '' | 'Basic' | 'Advanced' | 'Premium';

/** Max approved payment total per client (₹). */
export const PAYMENT_LIMIT = 178000;

export function sumPaymentAmounts(
  entries: PaymentEntry[],
  opts?: { approvedOnly?: boolean }
): number {
  return entries.reduce((sum, entry) => {
    if (opts?.approvedOnly && !entry.approved) return sum;
    return sum + (Number(entry.amount) || 0);
  }, 0);
}

export function capPaymentTotal(total: number): number {
  return Math.min(Math.max(0, total), PAYMENT_LIMIT);
}

export interface PaymentEntry {
  amount: string;
  date: string;
  utr: string;
  approved: boolean;
  assigned_to?: string; // RM ID who gets credit for this payment (deprecated, kept for backward compatibility)
  assigned_to_name?: string; // RM name for display (deprecated, kept for backward compatibility)
  rm1?: string; // RM1 ID who gets credit for this payment
  rm1_name?: string; // RM1 name for display
  rm2?: string; // RM2 ID who gets credit for this payment
  rm2_name?: string; // RM2 name for display
  packageTier?: PackageTier;
  /**
   * Indicates the payment row has been added locally and not yet saved.
   * This flag is ignored when serializing and will not be sent to the server.
   */
  isNew?: boolean;
}

export function parsePaymentHistory(str?: string): PaymentEntry[] {
  if (!str) return [];
  return str.split('|||').map(entry => {
    const parts = entry.split('__');
    // Support both old format (assigned_to) and new format (rm1, rm2)
    // Format: amount__date__utr__approved__assigned_to__assigned_to_name__packageTier__rm1__rm1_name__rm2__rm2_name
    return {
      amount: parts[0] || '',
      date: parts[1] || new Date().toISOString(),
      utr: parts[2] || '',
      approved: parts[3] ? parts[3] === '1' || parts[3] === 'true' : true,
      assigned_to: parts[4] || '', // Keep for backward compatibility
      assigned_to_name: parts[5] || '', // Keep for backward compatibility
      packageTier: (parts[6] as PackageTier) || '',
      rm1: parts[7] || parts[4] || '', // Use old assigned_to if rm1 not present (migration)
      rm1_name: parts[8] || parts[5] || '', // Use old assigned_to_name if rm1_name not present
      rm2: parts[9] || '',
      rm2_name: parts[10] || '',
    } as PaymentEntry;
  });
}

export function serializePaymentHistory(entries: PaymentEntry[]): string {
  return entries
    .map(e => `${e.amount}__${e.date}__${e.utr || ''}__${e.approved ? '1' : '0'}__${e.assigned_to || ''}__${e.assigned_to_name || ''}__${e.packageTier || ''}__${e.rm1 || ''}__${e.rm1_name || ''}__${e.rm2 || ''}__${e.rm2_name || ''}`)
    .join('|||');
}
