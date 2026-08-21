export type PackageTier = '' | 'Basic' | 'Advanced' | 'Premium';

export interface PaymentEntry {
  amount: string;
  date: string;
  utr: string;
  approved: boolean;
  assigned_to?: string; // RM ID who gets credit for this payment
  assigned_to_name?: string; // RM name for display
  rm1?: string;
  rm1_name?: string;
  rm2?: string;
  rm2_name?: string;
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
    return {
      amount: parts[0] || '',
      date: parts[1] || new Date().toISOString(),
      utr: parts[2] || '',
      approved: parts[3] ? parts[3] === '1' || parts[3] === 'true' : true,
      assigned_to: parts[4] || '',
      assigned_to_name: parts[5] || '',
      packageTier: (parts[6] as PackageTier) || '',
      rm1: parts[7] || parts[4] || '',
      rm1_name: parts[8] || parts[5] || '',
      rm2: parts[9] || '',
      rm2_name: parts[10] || '',
    } as PaymentEntry;
  });
}

export function serializePaymentHistory(entries: PaymentEntry[]): string {
  return entries
    .map(e => `${e.amount}__${e.date}__${e.utr || ''}__${e.approved ? '1' : '0'}__${e.assigned_to || ''}__${e.assigned_to_name || ''}__${e.packageTier || ''}`)
    .join('|||');
}
