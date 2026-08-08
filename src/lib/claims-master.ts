/**
 * Claims-Master wrappers — Supabase edition.
 *
 * In the single-Supabase setup the "Claims Master" base no longer exists as
 * a separate database — it's just the same `claims` table that this app
 * reads/writes. So these helpers are now thin convenience wrappers around
 * the same supabase client, returning data in the legacy "Claims Master"
 * PascalCase shape so existing components don't have to change.
 *
 * `ensureFinancialClaimRecord()` is now a no-op: a claim's id IS the
 * Supabase uuid, and there is no bridge to maintain. We keep the function
 * (returning `claim.id`) so call sites that capture the returned id don't
 * have to be rewritten.
 *
 * `syncFinancialSummaryToClaimsMaster()` is also effectively a no-op —
 * writing summary fields back to the same table that produced them would be
 * circular. We keep it as a function that writes a couple of denormalized
 * roll-ups to the claim row for the table view to read.
 */
import { supabase } from './supabase';
import type { ClaimMaster, FinancialSummary } from '@/types';
import { getClaimRowsFromApi } from '@/services/claims-api';

interface ClaimRow {
  id: string;
  claim_id?: string | null;
  last_name?: string | null;
  first_name?: string | null;
  address?: string | null;
  carrier?: string | null;
  carrier_claim_number?: string | null;
  policy_number?: string | null;
  loss_date?: string | null;
  loss_type?: string | null;
  status?: string | null;
  stage?: string | null;
  rcv?: number | null;
  acv?: number | null;
  deductible?: number | null;
  o_and_p?: number | null;
  depreciation?: number | null;
  adjuster_name?: string | null;
  adjuster_email?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  alternative_contact_name?: string | null;
  alternative_contact_relationship?: string | null;
  alternative_contact_phone?: string | null;
  alternative_contact_email?: string | null;
  referral_type?: string | null;
  referral_name?: string | null;
  referral_phone?: string | null;
  referral_email?: string | null;
  referral_notes?: string | null;
  contractor?: string | null;
  total_payout?: number | null;
  total_outstanding_payments?: number | null;
  net_claim_sum?: number | null;
  depreciation_recoverable?: number | null;
  total_approved_budget?: number | null;
  checklist?: unknown;
  mortgage?: unknown;
  fields_raw?: Record<string, unknown> | null;
}

function unwrap<T>(payload: { data: T | null; error: { message: string } | null }, op: string): T {
  if (payload.error) {
    throw new Error(`[supabase] ${op} failed: ${payload.error.message}`);
  }
  return (payload.data ?? ([] as unknown as T));
}

function rawObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

function mortgageCompanyFromJson(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'company' in value) {
    const v = (value as { company?: unknown }).company;
    return typeof v === 'string' ? v : '';
  }
  return '';
}

function checklistFromValue(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  // Supabase stores it as jsonb — stringify for the legacy callers that
  // expect a serialized blob.
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function mapClaimMaster(row: ClaimRow): ClaimMaster {
  const raw = rawObject(row.fields_raw);
  const carrierClaimNumber =
    (typeof raw['Carrier Claim #'] === 'string' ? (raw['Carrier Claim #'] as string) : '') ||
    row.carrier_claim_number ||
    '';
  return {
    id: row.id,
    'Claim ID': row.claim_id ?? '',
    'Carrier Claim #': carrierClaimNumber || undefined,
    'Last Name': row.last_name ?? '',
    'First Name': row.first_name ?? '',
    Address: row.address ?? '',
    Carrier: row.carrier ?? '',
    'Policy Number': row.policy_number ?? '',
    'Loss Date': row.loss_date ?? '',
    'Loss Type': row.loss_type ?? '',
    Status: row.status ?? '',
    Stage: row.stage ?? '',
    RCV: row.rcv ?? 0,
    ACV: row.acv ?? 0,
    Deductible: row.deductible ?? 0,
    'O&P': row.o_and_p ?? 0,
    Depreciation: row.depreciation ?? 0,
    'Adjuster Name': row.adjuster_name ?? '',
    'Adjuster Email': row.adjuster_email || undefined,
    'Customer Email': row.customer_email || undefined,
    'Customer Phone': row.customer_phone || undefined,
    'Alternative Contact Name': row.alternative_contact_name || undefined,
    'Alternative Contact Relationship': row.alternative_contact_relationship || undefined,
    'Alternative Contact Phone': row.alternative_contact_phone || undefined,
    'Alternative Contact Email': row.alternative_contact_email || undefined,
    'Referral Type': row.referral_type || undefined,
    'Referral Name': row.referral_name || undefined,
    'Referral Phone': row.referral_phone || undefined,
    'Referral Email': row.referral_email || undefined,
    'Referral Notes': row.referral_notes || undefined,
    Contractor: row.contractor || undefined,
    'Mortgage Company': mortgageCompanyFromJson(row.mortgage),
    'Total Payout': row.total_payout ?? 0,
    'Total Outstanding Payments': row.total_outstanding_payments ?? 0,
    'Net Claim Sum': row.net_claim_sum ?? 0,
    'Depreciation Recoverable': row.depreciation_recoverable ?? 0,
    'Total Approved Budget': row.total_approved_budget ?? 0,
    Checklist: checklistFromValue(row.checklist),
  };
}

export async function getAllClaimsMaster(): Promise<ClaimMaster[]> {
  const data = await getClaimRowsFromApi();
  return (data as unknown as ClaimRow[]).map(mapClaimMaster);
}

/**
 * In the single-DB world the "financial record" IS the claim — same row, same
 * id. Kept as a function so callers continue to compile without rewrites.
 */
export async function ensureFinancialClaimRecord(claim: ClaimMaster): Promise<string> {
  return claim.id;
}

export async function getClaimChecklist(claimsMasterRecordId: string): Promise<string> {
  const data = unwrap(
    await supabase.from('claims').select('checklist').eq('id', claimsMasterRecordId).single(),
    'getClaimChecklist',
  ) as { checklist?: unknown };
  return checklistFromValue(data.checklist);
}

export async function updateClaimChecklist(
  claimsMasterRecordId: string,
  checklistJson: string,
): Promise<void> {
  // Try to parse so Postgres jsonb gets a real object. Fall back to the
  // raw string if it isn't valid JSON.
  let payload: unknown = checklistJson;
  try {
    payload = JSON.parse(checklistJson);
  } catch {
    payload = checklistJson;
  }
  unwrap(
    await supabase
      .from('claims')
      .update({ checklist: payload as never })
      .eq('id', claimsMasterRecordId),
    'updateClaimChecklist',
  );
}

/**
 * A row from the Payments Log table.
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
  const data = unwrap(
    await supabase.from('payments_log').select('*'),
    'getPaymentsLog',
  ) as Array<{
    id: string;
    claim_id?: string | null;
    amount?: number | null;
    payment_date?: string | null;
    payment_due_date?: string | null;
    vendor?: string | null;
    notes?: string | null;
    payment_status?: string | null;
    created_at?: string | null;
    fields_raw?: Record<string, unknown> | null;
  }>;
  return data.map((p) => ({
    id: p.id,
    Claim: p.claim_id ? [p.claim_id] : [],
    Amount: p.amount ?? 0,
    'Payment Date': p.payment_date ?? '',
    'Due Date': p.payment_due_date ?? '',
    Vendor: p.vendor ?? '',
    Description:
      (rawObject(p.fields_raw)['Description'] as string | undefined) ?? p.notes ?? '',
    'Payment Status': p.payment_status ?? '',
    createdTime: p.created_at ?? '',
  }));
}

/**
 * A row from the Modules table.
 */
export interface ModuleRow {
  id: string;
  'Module Name': string;
  'Module Type': string;
  Claim: string[];
  Status: string;
  Vendor: string;
  'Payment Amount': number;
  // Per-service lifecycle mirrors. Optional because the Supabase modules
  // schema only carries some of these as first-class columns; the rest come
  // from fields_raw / job_costing fallbacks.
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

interface ModuleSupabaseRow {
  id: string;
  module_name?: string | null;
  module_type?: string | null;
  claim_id?: string | null;
  status?: string | null;
  vendor?: string | null;
  payment_amount?: number | null;
  bill_to?: string | null;
  job_costing_record_id?: string | null;
  restoration_project_record_id?: string | null;
  fields_raw?: Record<string, unknown> | null;
}

function readSelect(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'name' in value) {
    const named = (value as { name?: unknown }).name;
    return typeof named === 'string' ? named : undefined;
  }
  return undefined;
}

function mapModule(row: ModuleSupabaseRow): ModuleRow {
  const raw = rawObject(row.fields_raw);
  // Lifecycle mirrors live in fields_raw — schema gap noted in migration plan.
  const approvedRaw = raw['Approved Estimate Amount'];
  const hasSupRaw = raw['Has Supplement'];
  const supAmtRaw = raw['Supplement Approved Amount'];
  const supLabelRaw = raw['Supplement Separate Invoice Label'];
  return {
    id: row.id,
    'Module Name': row.module_name ?? row.module_type ?? '',
    'Module Type': row.module_type ?? '',
    Claim: row.claim_id ? [row.claim_id] : [],
    Status: readSelect(row.status) ?? '',
    Vendor: row.vendor ?? '',
    'Payment Amount': row.payment_amount ?? 0,
    'Bill To': row.bill_to ?? readSelect(raw['Bill To']),
    'Operation Status': readSelect(raw['Operation Status']),
    'Estimate Status': readSelect(raw['Estimate Status']),
    'Approved Estimate Amount':
      typeof approvedRaw === 'number'
        ? approvedRaw
        : typeof approvedRaw === 'string' && approvedRaw !== ''
          ? Number(approvedRaw)
          : undefined,
    'Has Supplement': hasSupRaw === undefined ? undefined : Boolean(hasSupRaw),
    'Supplement Approved Amount':
      typeof supAmtRaw === 'number'
        ? supAmtRaw
        : typeof supAmtRaw === 'string' && supAmtRaw !== ''
          ? Number(supAmtRaw)
          : undefined,
    'Supplement Invoice Mode': readSelect(raw['Supplement Invoice Mode']) as
      | 'Append to invoice'
      | 'Separate invoice'
      | undefined,
    'Supplement Separate Invoice Label':
      typeof supLabelRaw === 'string' ? (supLabelRaw as string) : undefined,
    'Job Costing Record ID': row.job_costing_record_id ?? '',
    'Restoration Project Record ID': row.restoration_project_record_id ?? '',
    'Service Status': typeof raw['Service Status'] === 'string' ? (raw['Service Status'] as string) : '',
  };
}

export async function getModulesForClaim(claimRecordId: string): Promise<ModuleRow[]> {
  const data = unwrap(
    await supabase.from('modules').select('*').eq('claim_id', claimRecordId),
    'getModulesForClaim',
  ) as ModuleSupabaseRow[];
  return data.map(mapModule);
}

/**
 * Persist a couple of summary roll-ups onto the claim row so the
 * portfolio/table views can read them without re-aggregating. With a
 * single Supabase DB this is no longer a cross-base "sync" — it's just an
 * in-place update on the same `claims` row.
 */
export async function syncFinancialSummaryToClaimsMaster(
  claimsMasterRecordId: string,
  summary: FinancialSummary,
): Promise<void> {
  unwrap(
    await supabase
      .from('claims')
      .update({
        rcv: summary.totalRCV,
        acv: summary.totalACV,
        deductible: summary.deductible,
        o_and_p: summary.totalOAndP,
        depreciation: summary.totalDepreciation,
        total_payout: summary.totalReceived,
        total_outstanding_payments: summary.totalOutstanding,
      } as never)
      .eq('id', claimsMasterRecordId),
    'syncFinancialSummaryToClaimsMaster',
  );
}
