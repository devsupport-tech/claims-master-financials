import { getClaimByClaimId, createClaim, baseFor } from './airtable';
import type { ClaimMaster, FinancialSummary } from '@/types';

// Routed through the sidecar proxy. The Claims Master sibling base is
// resolved from the same /api/bases response that bootstrapped Financials.
const claimsMasterBase = ((tableName: string) => baseFor('CLAIMS_MASTER')(tableName)) as ReturnType<typeof baseFor>;

const TABLE_NAME = 'Claims';

export async function getAllClaimsMaster(): Promise<ClaimMaster[]> {
  const records = await claimsMasterBase(TABLE_NAME).select().all();
  return records.map(record => ({
    id: record.id,
    'Claim ID': (record.fields['Claim ID'] as string) || '',
    'Carrier Claim #': (record.fields['Carrier Claim #'] as string) || '',
    'Last Name': (record.fields['Last Name'] as string) || '',
    'First Name': (record.fields['First Name'] as string) || '',
    Address: (record.fields['Address'] as string) || '',
    Carrier: (record.fields['Carrier'] as string) || '',
    'Policy Number': (record.fields['Policy Number'] as string) || '',
    'Loss Date': (record.fields['Loss Date'] as string) || '',
    'Loss Type': (record.fields['Loss Type'] as string) || '',
    Status: (record.fields['Status'] as string) || '',
    Stage: (record.fields['Stage'] as string) || '',
    RCV: (record.fields['RCV'] as number) || 0,
    ACV: (record.fields['ACV'] as number) || 0,
    Deductible: (record.fields['Deductible'] as number) || 0,
    'O&P': (record.fields['O&P'] as number) || 0,
    Depreciation: (record.fields['Depreciation'] as number) || 0,
    'Adjuster Name': (record.fields['Adjuster Name'] as string) || '',
    'Adjuster Email': (record.fields['Adjuster Email'] as string) || undefined,
    'Customer Email': (record.fields['Customer Email'] as string) || undefined,
    'Customer Phone': (record.fields['Customer Phone'] as string) || undefined,
    'Alternative Contact Name': (record.fields['Alternative Contact Name'] as string) || undefined,
    'Alternative Contact Relationship': (record.fields['Alternative Contact Relationship'] as string) || undefined,
    'Alternative Contact Phone': (record.fields['Alternative Contact Phone'] as string) || undefined,
    'Alternative Contact Email': (record.fields['Alternative Contact Email'] as string) || undefined,
    'Referral Type': (record.fields['Referral Type'] as string) || undefined,
    'Referral Name': (record.fields['Referral Name'] as string) || undefined,
    'Referral Phone': (record.fields['Referral Phone'] as string) || undefined,
    'Referral Email': (record.fields['Referral Email'] as string) || undefined,
    'Referral Notes': (record.fields['Referral Notes'] as string) || undefined,
    'Mortgage Company': (record.fields['Mortgage Company'] as string) || '',
    'Total Payout': (record.fields['Total Payout'] as number) || 0,
    'Total Outstanding Payments': (record.fields['Total Outstanding Payments'] as number) || 0,
    'Net Claim Sum': (record.fields['Net Claim Sum'] as number) || 0,
    'Depreciation Recoverable': (record.fields['Depreciation Recoverable'] as number) || 0,
    'Total Approved Budget': (record.fields['Total Approved Budget'] as number) || 0,
    Checklist: (record.fields['Checklist'] as string) || '',
  }));
}

/**
 * Bridge function: looks up or creates a corresponding record in the Financials base
 * so that financial records (ledger, reports, etc.) can link to it.
 * Returns the Financials base record ID.
 */
export async function ensureFinancialClaimRecord(claim: ClaimMaster): Promise<string> {
  try {
    const existing = await getClaimByClaimId(claim['Claim ID']);
    if (existing) {
      return existing.id as string;
    }
  } catch (lookupErr: any) {
    console.error('Bridge lookup failed for Claim ID:', claim['Claim ID'], lookupErr?.message || lookupErr);
    throw lookupErr;
  }

  try {
    // Only include text/number fields that are safe across both bases.
    // Skip select fields (Status) — the Financials base may have different options.
    // Skip date fields if empty — Airtable rejects empty strings for date columns.
    const bridgeData: Record<string, any> = {
      'Claim ID': claim['Claim ID'],
      'Last Name': claim['Last Name'],
      'First Name': claim['First Name'],
      Address: claim.Address,
      Carrier: claim.Carrier,
      'Policy Number': claim['Policy Number'],
      RCV: claim.RCV,
      ACV: claim.ACV,
      Deductible: claim.Deductible,
      'O&P': claim['O&P'],
      Depreciation: claim.Depreciation,
    };

    if (claim['Loss Date']) {
      bridgeData['Date of Loss'] = claim['Loss Date'];
    }

    const created = await createClaim(bridgeData);

    return created.id as string;
  } catch (createErr: any) {
    console.error('Bridge create failed for Claim ID:', claim['Claim ID'], createErr?.message || createErr);
    throw createErr;
  }
}

/**
 * Read the Checklist JSON string from a Claims Master record.
 */
export async function getClaimChecklist(claimsMasterRecordId: string): Promise<string> {
  const record = await claimsMasterBase(TABLE_NAME).find(claimsMasterRecordId);
  return (record.fields['Checklist'] as string) || '';
}

/**
 * Write the Checklist JSON string to a Claims Master record.
 */
export async function updateClaimChecklist(
  claimsMasterRecordId: string,
  checklistJson: string
): Promise<void> {
  await claimsMasterBase(TABLE_NAME).update(claimsMasterRecordId, {
    Checklist: checklistJson,
  });
}

/**
 * Sync financial summary data back to the Claims Master record.
 * Updates Total Payout, Total Outstanding Payments, and RCV/ACV
 * on the Claims Master side so both bases stay in sync.
 */
/**
 * A row from the Claims Master "Payments Log" table.
 * Used to surface externally-logged payments on the Overview "Recently Updated" feed.
 */
export interface PaymentLogRow {
  id: string;
  Claim: string[];
  Amount: number;
  'Payment Date': string;
  'Due Date': string;
  Vendor: string;
  Description: string;
  'Payment Status': string;
  createdTime: string;
}

export async function getPaymentsLog(): Promise<PaymentLogRow[]> {
  const records = await claimsMasterBase('Payments Log').select().all();
  return records.map(r => ({
    id: r.id,
    Claim: (r.fields['Claim'] as string[]) || [],
    Amount: (r.fields['Amount'] as number) || 0,
    'Payment Date': (r.fields['Payment Date'] as string) || '',
    'Due Date': (r.fields['Due Date'] as string) || '',
    Vendor: (r.fields['Vendor'] as string) || '',
    Description: (r.fields['Description'] as string) || '',
    'Payment Status': (r.fields['Payment Status'] as string) || '',
    // Fallback date so rows without Payment Date / Due Date still surface in
    // the Recently Updated feed, ordered by when they were logged.
    createdTime: ((r as any)._rawJson?.createdTime as string) || '',
  }));
}

/**
 * A row from the Claims Master "Modules" table.
 * Used to dynamically drive the Submissions tab instead of hardcoded services.
 */
export interface ModuleRow {
  id: string;
  'Module Name': string;
  'Module Type': string;
  Claim: string[];
  Status: string;
  Vendor: string;
  'Payment Amount': number;
  // Per-service lifecycle mirrors (added by airtable-schema-sync). Optional so
  // older rows without the new fields still parse cleanly.
  // Bill To holds a carrier display name ("Allstate", …) or the literal "Client".
  'Bill To'?: string;
  'Operation Status'?: string;
  'Estimate Status'?: string;
  'Approved Estimate Amount'?: number;
  'Has Supplement'?: boolean;
  'Supplement Approved Amount'?: number;
  'Supplement Invoice Mode'?: 'Append to invoice' | 'Separate invoice';
  'Supplement Separate Invoice Label'?: string;
  'Job Costing Record ID'?: string;
  'Restoration Project Record ID'?: string;
  'Service Status'?: string;
}

function readSelect(field: unknown): string | undefined {
  if (!field) return undefined;
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && field !== null && 'name' in field) {
    return (field as { name?: string }).name;
  }
  return undefined;
}

export async function getModulesForClaim(claimRecordId: string): Promise<ModuleRow[]> {
  const records = await claimsMasterBase('Modules').select().all();
  return records
    .filter(r => {
      const claims = (r.fields['Claim'] as string[]) || [];
      return claims.includes(claimRecordId);
    })
    .map(r => ({
      id: r.id,
      // Fall back to Module Type when Module Name is empty
      'Module Name': (r.fields['Module Name'] as string) || (r.fields['Module Type'] as string) || '',
      'Module Type': (r.fields['Module Type'] as string) || '',
      Claim: (r.fields['Claim'] as string[]) || [],
      Status: readSelect(r.fields['Status']) || '',
      Vendor: (r.fields['Vendor'] as string) || '',
      'Payment Amount': (r.fields['Payment Amount'] as number) || 0,
      'Bill To': readSelect(r.fields['Bill To']),
      'Operation Status': readSelect(r.fields['Operation Status']),
      'Estimate Status': readSelect(r.fields['Estimate Status']),
      // IMPORTANT: keep these as undefined when Airtable doesn't return the
      // field. Modules schema doesn't carry the $ mirrors (canonical source
      // is Job Costing in Financials). buildLifecycleViews uses `??` to fall
      // through to the J value — collapsing to 0 here defeats that fallback.
      'Approved Estimate Amount': r.fields['Approved Estimate Amount'] as number | undefined,
      'Has Supplement':
        r.fields['Has Supplement'] === undefined ? undefined : Boolean(r.fields['Has Supplement']),
      'Supplement Approved Amount': r.fields['Supplement Approved Amount'] as number | undefined,
      'Supplement Invoice Mode': readSelect(r.fields['Supplement Invoice Mode']) as 'Append to invoice' | 'Separate invoice' | undefined,
      'Supplement Separate Invoice Label': r.fields['Supplement Separate Invoice Label'] as string | undefined,
      'Job Costing Record ID': (r.fields['Job Costing Record ID'] as string) || '',
      'Restoration Project Record ID': (r.fields['Restoration Project Record ID'] as string) || '',
      'Service Status': (r.fields['Service Status'] as string) || '',
    }));
}

export async function syncFinancialSummaryToClaimsMaster(
  claimsMasterRecordId: string,
  summary: FinancialSummary
): Promise<void> {
  await claimsMasterBase(TABLE_NAME).update(claimsMasterRecordId, {
    'RCV': summary.totalRCV,
    'ACV': summary.totalACV,
    'Deductible': summary.deductible,
    'O&P': summary.totalOAndP,
    'Depreciation': summary.totalDepreciation,
    'Total Payout': summary.totalReceived,
    'Total Outstanding Payments': summary.totalOutstanding,
  });
}
