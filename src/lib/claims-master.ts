import Airtable from 'airtable';
import { getClaimByClaimId, createClaim } from './airtable';
import type { ClaimMaster, FinancialSummary } from '@/types';

const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY;
const CLAIMS_MASTER_BASE_ID = import.meta.env.VITE_CLAIMS_MASTER_BASE_ID;

if (!CLAIMS_MASTER_BASE_ID) {
  console.error('Missing VITE_CLAIMS_MASTER_BASE_ID configuration');
}

const claimsMasterBase = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(CLAIMS_MASTER_BASE_ID);

const TABLE_NAME = 'Claims';

export async function getAllClaimsMaster(): Promise<ClaimMaster[]> {
  const records = await claimsMasterBase(TABLE_NAME).select().all();
  return records.map(record => ({
    id: record.id,
    'Claim ID': (record.fields['Claim ID'] as string) || '',
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
