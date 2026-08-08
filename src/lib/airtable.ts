/**
 * Data-layer wrapper — Supabase edition.
 *
 * File name is kept (`airtable.ts`) so the dozen+ call sites that import from
 * `@/lib/airtable` don't need to change their import paths. Internally this
 * is now a thin layer over the browser Supabase client: every call returns
 * rows that LOOK LIKE the old Airtable shape (PascalCase keys, a `Claim`
 * array that holds the linked claim id, plus the `id` from the row's uuid)
 * so components and forms keep working unchanged.
 *
 * Fields the Supabase schema doesn't carry as first-class columns
 * (Submitted/Approved Estimate Amount, Has Supplement, Supplement Approved
 * Amount, Supplement Invoice Mode, Supplement Separate Invoice Label,
 * Module Record ID, Billing Entity, Invoice Number on project_expenses,
 * Scope Notes, Project Expense link on cost_payments) are stashed in the
 * `fields_raw` jsonb on each row and merged back out by the read mappers
 * below. Writes do the reverse: snake_case columns go to their own slots,
 * everything else is folded into `fields_raw`.
 *
 * NOTE on Airtable bootstrap: `bootstrapBases()` and `baseIdOf()` are kept
 * as no-op stubs so older startup code that still calls them doesn't crash.
 * They're scheduled for removal once main.tsx no longer references them.
 */

import { supabase } from './supabase';
import type { ComparativeRow, ComparativesData } from '@/types';
import { getClaimRowsFromApi } from '@/services/claims-api';

// ────────────────────────────────────────────────────────────────────────────
// Legacy multi-base bootstrap shims — no-ops in the single-Supabase world.
// ────────────────────────────────────────────────────────────────────────────

interface BaseMap {
  CLAIMS_MASTER: string;
  FINANCIALS: string;
  REST_OPS: string;
}

export async function bootstrapBases(): Promise<BaseMap> {
  return { CLAIMS_MASTER: 'supabase', FINANCIALS: 'supabase', REST_OPS: 'supabase' };
}

export function baseIdOf(_app: keyof BaseMap): string {
  return 'supabase';
}

// ────────────────────────────────────────────────────────────────────────────
// Generic helpers — fold/unfold fields_raw, throw on error.
// ────────────────────────────────────────────────────────────────────────────

function unwrap<T>(payload: { data: T | null; error: { message: string } | null }, op: string): T {
  if (payload.error) {
    throw new Error(`[supabase] ${op} failed: ${payload.error.message}`);
  }
  // Supabase .delete() without a chained .select() returns data:null on
  // success. Callers that need the row chain .single() and check for
  // a real value themselves; for fire-and-forget ops we coerce to [] / {}.
  return (payload.data ?? ([] as unknown as T));
}

function rawObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

// ────────────────────────────────────────────────────────────────────────────
// CLAIMS
// ────────────────────────────────────────────────────────────────────────────

interface ClaimRow {
  id: string;
  claim_id?: string | null;
  last_name?: string | null;
  first_name?: string | null;
  address?: string | null;
  carrier?: string | null;
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
  fields_raw?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/** Maps a claims row to the PascalCase shape used by components. */
function mapClaim(row: ClaimRow) {
  const raw = rawObject(row.fields_raw);
  return {
    id: row.id,
    'Claim ID': row.claim_id ?? '',
    'Last Name': row.last_name ?? '',
    'First Name': row.first_name ?? '',
    Address: row.address ?? '',
    Carrier: row.carrier ?? '',
    'Policy Number': row.policy_number ?? '',
    'Date of Loss': row.loss_date ?? '',
    'Loss Date': row.loss_date ?? '',
    'Loss Type': row.loss_type ?? '',
    Status: row.status ?? '',
    Stage: row.stage ?? '',
    RCV: row.rcv ?? 0,
    ACV: row.acv ?? 0,
    Deductible: row.deductible ?? 0,
    'O&P': row.o_and_p ?? 0,
    Depreciation: row.depreciation ?? 0,
    ...raw,
  };
}

const PASCAL_TO_CLAIM_COLUMN: Record<string, string> = {
  'Claim ID': 'claim_id',
  'Last Name': 'last_name',
  'First Name': 'first_name',
  Address: 'address',
  Carrier: 'carrier',
  'Policy Number': 'policy_number',
  'Date of Loss': 'loss_date',
  'Loss Date': 'loss_date',
  'Loss Type': 'loss_type',
  Status: 'status',
  Stage: 'stage',
  RCV: 'rcv',
  ACV: 'acv',
  Deductible: 'deductible',
  'O&P': 'o_and_p',
  Depreciation: 'depreciation',
};

function unmapClaim(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k in PASCAL_TO_CLAIM_COLUMN) {
      out[PASCAL_TO_CLAIM_COLUMN[k]] = v;
    } else {
      raw[k] = v;
    }
  }
  if (Object.keys(raw).length) out.fields_raw = raw;
  return out;
}

export async function getAllClaims() {
  const data = await getClaimRowsFromApi();
  return (data as unknown as ClaimRow[]).map(mapClaim);
}

export async function getClaimByClaimId(claimId: string) {
  const data = unwrap(
    await supabase.from('claims').select('*').eq('claim_id', claimId).limit(1),
    'getClaimByClaimId',
  ) as ClaimRow[];
  if (!data.length) return null;
  return mapClaim(data[0]);
}

export async function createClaim(input: Record<string, unknown>) {
  const insert = unmapClaim(input);
  const data = unwrap(
    await supabase.from('claims').insert(insert as never).select().single(),
    'createClaim',
  ) as ClaimRow;
  return mapClaim(data);
}

export async function updateClaim(recordId: string, input: Record<string, unknown>) {
  const update = unmapClaim(input);
  const data = unwrap(
    await supabase.from('claims').update(update as never).eq('id', recordId).select().single(),
    'updateClaim',
  ) as ClaimRow;
  return mapClaim(data);
}

export async function deleteClaim(recordId: string) {
  unwrap(await supabase.from('claims').delete().eq('id', recordId), 'deleteClaim');
}

// ────────────────────────────────────────────────────────────────────────────
// FINANCIAL LEDGER
// ────────────────────────────────────────────────────────────────────────────

interface LedgerRow {
  id: string;
  claim_id?: string | null;
  module_id?: string | null;
  entry_name?: string | null;
  entry_type?: string | null;
  direction?: string | null;
  amount?: number | null;
  date?: string | null;
  check_number?: string | null;
  payer_payee?: string | null;
  category?: string | null;
  description?: string | null;
  reconciled?: boolean | null;
  reconciled_date?: string | null;
  fields_raw?: Record<string, unknown> | null;
}

function mapLedger(row: LedgerRow) {
  const raw = rawObject(row.fields_raw);
  return {
    id: row.id,
    'Entry Name': row.entry_name ?? '',
    'Entry Type': row.entry_type ?? '',
    Direction: row.direction ?? '',
    Amount: row.amount ?? 0,
    Date: row.date ?? '',
    'Check Number': row.check_number ?? '',
    'Payer/Payee': row.payer_payee ?? '',
    Category: row.category ?? '',
    Description: row.description ?? '',
    Reconciled: Boolean(row.reconciled),
    'Reconciled Date': row.reconciled_date ?? '',
    Claim: row.claim_id ? [row.claim_id] : [],
    'Module Record ID': row.module_id ?? undefined,
    ...raw,
  };
}

const PASCAL_TO_LEDGER_COLUMN: Record<string, string> = {
  'Entry Name': 'entry_name',
  'Entry Type': 'entry_type',
  Direction: 'direction',
  Amount: 'amount',
  Date: 'date',
  'Check Number': 'check_number',
  'Payer/Payee': 'payer_payee',
  Category: 'category',
  Description: 'description',
  Reconciled: 'reconciled',
  'Reconciled Date': 'reconciled_date',
};

function unmapLedger(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === 'Claim') {
      // Airtable form payload passes `Claim: [recId]`; store the first value as
      // the foreign-key uuid in claim_id.
      if (Array.isArray(v) && v.length > 0) out.claim_id = v[0];
      continue;
    }
    if (k === 'Module Record ID') {
      out.module_id = v || null;
      continue;
    }
    if (k in PASCAL_TO_LEDGER_COLUMN) {
      out[PASCAL_TO_LEDGER_COLUMN[k]] = v;
    } else {
      raw[k] = v;
    }
  }
  if (Object.keys(raw).length) out.fields_raw = raw;
  return out;
}

export async function getFinancialLedger(claimRecordId?: string) {
  let q = supabase.from('financial_ledger').select('*').order('date', { ascending: false });
  if (claimRecordId) q = q.eq('claim_id', claimRecordId);
  const data = unwrap(await q, 'getFinancialLedger') as LedgerRow[];
  return data.map(mapLedger);
}

export async function createLedgerEntry(input: Record<string, unknown>) {
  const insert = unmapLedger(input);
  const data = unwrap(
    await supabase.from('financial_ledger').insert(insert as never).select().single(),
    'createLedgerEntry',
  ) as LedgerRow;
  return mapLedger(data);
}

export async function updateLedgerEntry(recordId: string, input: Record<string, unknown>) {
  const update = unmapLedger(input);
  const data = unwrap(
    await supabase.from('financial_ledger').update(update as never).eq('id', recordId).select().single(),
    'updateLedgerEntry',
  ) as LedgerRow;
  return mapLedger(data);
}

export async function deleteLedgerEntry(recordId: string) {
  unwrap(await supabase.from('financial_ledger').delete().eq('id', recordId), 'deleteLedgerEntry');
}

// ────────────────────────────────────────────────────────────────────────────
// ADJUSTER REPORTS
// ────────────────────────────────────────────────────────────────────────────

interface AdjusterReportRow {
  id: string;
  claim_id?: string | null;
  report_name?: string | null;
  report_type?: string | null;
  version?: number | null;
  report_date?: string | null;
  adjuster_name?: string | null;
  rcv_amount?: number | null;
  acv_amount?: number | null;
  depreciation?: number | null;
  o_and_p_amount?: number | null;
  o_and_p_percent?: number | null;
  deductible?: number | null;
  line_items_count?: number | null;
  scope_changes?: string | null;
  status?: string | null;
  approval_date?: string | null;
  fields_raw?: Record<string, unknown> | null;
}

function mapAdjusterReport(row: AdjusterReportRow) {
  const raw = rawObject(row.fields_raw);
  return {
    id: row.id,
    'Report Name': row.report_name ?? '',
    'Report Type': row.report_type ?? '',
    Version: row.version ?? 1,
    'Report Date': row.report_date ?? '',
    'Adjuster Name': row.adjuster_name ?? '',
    'RCV Amount': row.rcv_amount ?? 0,
    'ACV Amount': row.acv_amount ?? 0,
    Depreciation: row.depreciation ?? 0,
    'O&P Amount': row.o_and_p_amount ?? 0,
    'O&P Percent': row.o_and_p_percent ?? 0,
    Deductible: row.deductible ?? 0,
    'Line Items Count': row.line_items_count ?? 0,
    'Scope Changes': row.scope_changes ?? '',
    Status: row.status ?? '',
    'Approval Date': row.approval_date ?? '',
    Claim: row.claim_id ? [row.claim_id] : [],
    ...raw,
  };
}

const PASCAL_TO_ADJUSTER_COLUMN: Record<string, string> = {
  'Report Name': 'report_name',
  'Report Type': 'report_type',
  Version: 'version',
  'Report Date': 'report_date',
  'Adjuster Name': 'adjuster_name',
  'RCV Amount': 'rcv_amount',
  'ACV Amount': 'acv_amount',
  Depreciation: 'depreciation',
  'O&P Amount': 'o_and_p_amount',
  'O&P Percent': 'o_and_p_percent',
  Deductible: 'deductible',
  'Line Items Count': 'line_items_count',
  'Scope Changes': 'scope_changes',
  Status: 'status',
  'Approval Date': 'approval_date',
};

function unmapAdjusterReport(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === 'Claim') {
      if (Array.isArray(v) && v.length > 0) out.claim_id = v[0];
      continue;
    }
    if (k in PASCAL_TO_ADJUSTER_COLUMN) {
      out[PASCAL_TO_ADJUSTER_COLUMN[k]] = v;
    } else {
      raw[k] = v;
    }
  }
  if (Object.keys(raw).length) out.fields_raw = raw;
  return out;
}

export async function getAdjusterReports(claimRecordId?: string) {
  let q = supabase.from('adjuster_reports').select('*').order('version', { ascending: true });
  if (claimRecordId) q = q.eq('claim_id', claimRecordId);
  const data = unwrap(await q, 'getAdjusterReports') as AdjusterReportRow[];
  return data.map(mapAdjusterReport);
}

export async function createAdjusterReport(input: Record<string, unknown>) {
  const insert = unmapAdjusterReport(input);
  const data = unwrap(
    await supabase.from('adjuster_reports').insert(insert as never).select().single(),
    'createAdjusterReport',
  ) as AdjusterReportRow;
  return mapAdjusterReport(data);
}

export async function updateAdjusterReport(recordId: string, input: Record<string, unknown>) {
  const update = unmapAdjusterReport(input);
  const data = unwrap(
    await supabase.from('adjuster_reports').update(update as never).eq('id', recordId).select().single(),
    'updateAdjusterReport',
  ) as AdjusterReportRow;
  return mapAdjusterReport(data);
}

export async function deleteAdjusterReport(recordId: string) {
  unwrap(
    await supabase.from('adjuster_reports').delete().eq('id', recordId),
    'deleteAdjusterReport',
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MORTGAGE RELEASES
// ────────────────────────────────────────────────────────────────────────────

interface MortgageReleaseRow {
  id: string;
  claim_id?: string | null;
  release_name?: string | null;
  mortgage_company?: string | null;
  loan_number?: string | null;
  total_held_by_mortgage?: number | null;
  release_number?: number | null;
  release_amount?: number | null;
  cumulative_released?: number | null;
  remaining_held?: number | null;
  request_date?: string | null;
  documents_submitted?: boolean | null;
  documents_submitted_date?: string | null;
  inspection_required?: boolean | null;
  inspection_status?: string | null;
  inspection_date?: string | null;
  inspection_company?: string | null;
  completion_percent?: number | null;
  release_status?: string | null;
  check_number?: string | null;
  check_date?: string | null;
  deposit_date?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  fields_raw?: Record<string, unknown> | null;
}

function mapMortgageRelease(row: MortgageReleaseRow) {
  const raw = rawObject(row.fields_raw);
  return {
    id: row.id,
    'Release Name': row.release_name ?? '',
    'Mortgage Company': row.mortgage_company ?? '',
    'Loan Number': row.loan_number ?? '',
    'Total Held by Mortgage': row.total_held_by_mortgage ?? 0,
    'Release Number': row.release_number ?? 0,
    'Release Amount': row.release_amount ?? 0,
    'Cumulative Released': row.cumulative_released ?? 0,
    'Remaining Held': row.remaining_held ?? 0,
    'Request Date': row.request_date ?? '',
    'Documents Submitted': Boolean(row.documents_submitted),
    'Documents Submitted Date': row.documents_submitted_date ?? '',
    'Inspection Required': Boolean(row.inspection_required),
    'Inspection Status': row.inspection_status ?? '',
    'Inspection Date': row.inspection_date ?? '',
    'Inspection Company': row.inspection_company ?? '',
    'Completion Percent': row.completion_percent ?? undefined,
    'Release Status': row.release_status ?? '',
    'Check Number': row.check_number ?? '',
    'Check Date': row.check_date ?? '',
    'Deposit Date': row.deposit_date ?? '',
    'Contact Name': row.contact_name ?? '',
    'Contact Phone': row.contact_phone ?? '',
    'Contact Email': row.contact_email ?? '',
    Claim: row.claim_id ? [row.claim_id] : [],
    ...raw,
  };
}

const PASCAL_TO_MORTGAGE_COLUMN: Record<string, string> = {
  'Release Name': 'release_name',
  'Mortgage Company': 'mortgage_company',
  'Loan Number': 'loan_number',
  'Total Held by Mortgage': 'total_held_by_mortgage',
  'Release Number': 'release_number',
  'Release Amount': 'release_amount',
  'Cumulative Released': 'cumulative_released',
  'Remaining Held': 'remaining_held',
  'Request Date': 'request_date',
  'Documents Submitted': 'documents_submitted',
  'Documents Submitted Date': 'documents_submitted_date',
  'Inspection Required': 'inspection_required',
  'Inspection Status': 'inspection_status',
  'Inspection Date': 'inspection_date',
  'Inspection Company': 'inspection_company',
  'Completion Percent': 'completion_percent',
  'Release Status': 'release_status',
  'Check Number': 'check_number',
  'Check Date': 'check_date',
  'Deposit Date': 'deposit_date',
  'Contact Name': 'contact_name',
  'Contact Phone': 'contact_phone',
  'Contact Email': 'contact_email',
};

function unmapMortgageRelease(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === 'Claim') {
      if (Array.isArray(v) && v.length > 0) out.claim_id = v[0];
      continue;
    }
    if (k in PASCAL_TO_MORTGAGE_COLUMN) {
      out[PASCAL_TO_MORTGAGE_COLUMN[k]] = v;
    } else {
      raw[k] = v;
    }
  }
  if (Object.keys(raw).length) out.fields_raw = raw;
  return out;
}

export async function getMortgageReleases(claimRecordId?: string) {
  let q = supabase
    .from('mortgage_releases')
    .select('*')
    .order('release_number', { ascending: true });
  if (claimRecordId) q = q.eq('claim_id', claimRecordId);
  const data = unwrap(await q, 'getMortgageReleases') as MortgageReleaseRow[];
  return data.map(mapMortgageRelease);
}

export async function createMortgageRelease(input: Record<string, unknown>) {
  const insert = unmapMortgageRelease(input);
  const data = unwrap(
    await supabase.from('mortgage_releases').insert(insert as never).select().single(),
    'createMortgageRelease',
  ) as MortgageReleaseRow;
  return mapMortgageRelease(data);
}

export async function updateMortgageRelease(recordId: string, input: Record<string, unknown>) {
  const update = unmapMortgageRelease(input);
  const data = unwrap(
    await supabase.from('mortgage_releases').update(update as never).eq('id', recordId).select().single(),
    'updateMortgageRelease',
  ) as MortgageReleaseRow;
  return mapMortgageRelease(data);
}

export async function deleteMortgageRelease(recordId: string) {
  unwrap(
    await supabase.from('mortgage_releases').delete().eq('id', recordId),
    'deleteMortgageRelease',
  );
}

// ────────────────────────────────────────────────────────────────────────────
// JOB COSTING
//
// Manual job-cost rows keep module_id null. The service-budget row is linked
// to exactly one module and uses the typed lifecycle columns below.
// ────────────────────────────────────────────────────────────────────────────

interface JobCostRow {
  id: string;
  claim_id?: string | null;
  module_id?: string | null;
  cost_name?: string | null;
  trade_category?: string | null;
  vendor_subcontractor?: string | null;
  xactimate_budget?: number | null;
  actual_cost?: number | null;
  variance?: number | null;
  variance_percent?: number | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  payment_status?: string | null;
  scope_description?: string | null;
  notes?: string | null;
  created_at?: string | null;
  submitted_estimate_amount?: number | null;
  approved_estimate_amount?: number | null;
  estimate_approved_date?: string | null;
  has_supplement?: boolean | null;
  supplement_approved_amount?: number | null;
  supplement_invoice_mode?: string | null;
  supplement_invoice_label?: string | null;
  fields_raw?: Record<string, unknown> | null;
}

function mapJobCost(row: JobCostRow) {
  const raw = rawObject(row.fields_raw);
  return {
    id: row.id,
    _createdTime: row.created_at ?? undefined,
    'Cost Name': row.cost_name ?? '',
    'Trade Category': row.trade_category ?? '',
    'Vendor/Subcontractor': row.vendor_subcontractor ?? '',
    'Xactimate Budget': row.xactimate_budget ?? 0,
    'Actual Cost': row.actual_cost ?? 0,
    Variance: row.variance ?? 0,
    'Variance Percent': row.variance_percent ?? 0,
    'Invoice Number': row.invoice_number ?? '',
    'Invoice Date': row.invoice_date ?? '',
    'Payment Status': row.payment_status ?? '',
    'Scope Description': row.scope_description ?? '',
    Notes: row.notes ?? '',
    Claim: row.claim_id ? [row.claim_id] : [],
    ...raw,
    'Submitted Estimate Amount': row.submitted_estimate_amount ?? raw['Submitted Estimate Amount'] ?? 0,
    'Approved Estimate Amount': row.approved_estimate_amount ?? raw['Approved Estimate Amount'] ?? row.xactimate_budget ?? 0,
    'Estimate Approved Date': row.estimate_approved_date ?? undefined,
    'Has Supplement': row.has_supplement ?? raw['Has Supplement'] ?? false,
    'Supplement Approved Amount': row.supplement_approved_amount ?? raw['Supplement Approved Amount'] ?? 0,
    'Supplement Invoice Mode': row.supplement_invoice_mode ?? raw['Supplement Invoice Mode'] ?? 'Append to invoice',
    'Supplement Separate Invoice Label': row.supplement_invoice_label ?? raw['Supplement Separate Invoice Label'] ?? undefined,
    'Module Record ID': row.module_id ?? raw['Module Record ID'] ?? undefined,
  };
}

const PASCAL_TO_JOB_COSTING_COLUMN: Record<string, string> = {
  'Cost Name': 'cost_name',
  'Trade Category': 'trade_category',
  'Vendor/Subcontractor': 'vendor_subcontractor',
  'Xactimate Budget': 'xactimate_budget',
  'Actual Cost': 'actual_cost',
  Variance: 'variance',
  'Variance Percent': 'variance_percent',
  'Invoice Number': 'invoice_number',
  'Invoice Date': 'invoice_date',
  'Payment Status': 'payment_status',
  'Scope Description': 'scope_description',
  Notes: 'notes',
};

function unmapJobCost(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === 'Claim') {
      if (Array.isArray(v) && v.length > 0) out.claim_id = v[0];
      continue;
    }
    if (k in PASCAL_TO_JOB_COSTING_COLUMN) {
      out[PASCAL_TO_JOB_COSTING_COLUMN[k]] = v;
    } else {
      raw[k] = v;
    }
  }
  if (Object.keys(raw).length) out.fields_raw = raw;
  return out;
}

export async function getJobCosting(claimRecordId?: string) {
  let q = supabase
    .from('job_costing')
    .select('*')
    .order('trade_category', { ascending: true });
  if (claimRecordId) q = q.eq('claim_id', claimRecordId);
  const data = unwrap(await q, 'getJobCosting') as JobCostRow[];
  return data.map(mapJobCost);
}

export async function createJobCost(input: Record<string, unknown>) {
  const insert = unmapJobCost(input);
  const data = unwrap(
    await supabase.from('job_costing').insert(insert as never).select().single(),
    'createJobCost',
  ) as JobCostRow;
  return mapJobCost(data);
}

export async function updateJobCost(recordId: string, input: Record<string, unknown>) {
  const update = unmapJobCost(input);
  const data = unwrap(
    await supabase.from('job_costing').update(update as never).eq('id', recordId).select().single(),
    'updateJobCost',
  ) as JobCostRow;
  return mapJobCost(data);
}

export async function deleteJobCost(recordId: string) {
  unwrap(await supabase.from('job_costing').delete().eq('id', recordId), 'deleteJobCost');
}

// ────────────────────────────────────────────────────────────────────────────
// PROJECT EXPENSES — per-service cost rows.
//
// Schema gap: project_expenses lacks columns for Billing Entity, Invoice
// Number, Scope Notes, Module Record ID. They live in fields_raw.
// ────────────────────────────────────────────────────────────────────────────

interface ProjectExpenseRow {
  id: string;
  claim_id?: string | null;
  module_id?: string | null;
  expense_name?: string | null;
  category?: string | null;
  amount?: number | null;
  date?: string | null;
  vendor?: string | null;
  payment_method?: string | null;
  reimbursable?: boolean | null;
  notes?: string | null;
  created_at?: string | null;
  fields_raw?: Record<string, unknown> | null;
}

function mapProjectExpense(row: ProjectExpenseRow) {
  const raw = rawObject(row.fields_raw);
  return {
    id: row.id,
    _createdTime: row.created_at ?? undefined,
    'Cost Name': row.expense_name ?? '',
    'Project Expense Category': row.category ?? '',
    Amount: row.amount ?? 0,
    'Invoice Date': row.date ?? '',
    Vendor: row.vendor ?? '',
    'Payment Method': row.payment_method ?? '',
    Reimbursable: Boolean(row.reimbursable),
    Notes: row.notes ?? '',
    Claim: row.claim_id ? [row.claim_id] : [],
    ...raw,
    'Module Record ID': row.module_id ?? raw['Module Record ID'] ?? undefined,
  };
}

function unmapProjectExpense(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    switch (k) {
      case 'Claim':
        if (Array.isArray(v) && v.length > 0) out.claim_id = v[0];
        break;
      case 'Module Record ID':
        out.module_id = v || null;
        break;
      case 'Cost Name':
        out.expense_name = v;
        break;
      case 'Project Expense Category':
        out.category = v;
        break;
      case 'Amount':
        out.amount = v;
        break;
      case 'Invoice Date':
        out.date = v;
        break;
      case 'Vendor':
        out.vendor = v;
        break;
      case 'Payment Method':
        out.payment_method = v;
        break;
      case 'Reimbursable':
        out.reimbursable = v;
        break;
      case 'Notes':
        out.notes = v;
        break;
      default:
        raw[k] = v;
    }
  }
  if (Object.keys(raw).length) out.fields_raw = raw;
  return out;
}

export async function getProjectExpenses(claimRecordId?: string) {
  let q = supabase.from('project_expenses').select('*').order('date', { ascending: false });
  if (claimRecordId) q = q.eq('claim_id', claimRecordId);
  const data = unwrap(await q, 'getProjectExpenses') as ProjectExpenseRow[];
  return data.map(mapProjectExpense);
}

export async function createProjectExpense(input: Record<string, unknown>) {
  const insert = unmapProjectExpense(input);
  const data = unwrap(
    await supabase.from('project_expenses').insert(insert as never).select().single(),
    'createProjectExpense',
  ) as ProjectExpenseRow;
  return mapProjectExpense(data);
}

export async function updateProjectExpense(recordId: string, input: Record<string, unknown>) {
  const update = unmapProjectExpense(input);
  const data = unwrap(
    await supabase.from('project_expenses').update(update as never).eq('id', recordId).select().single(),
    'updateProjectExpense',
  ) as ProjectExpenseRow;
  return mapProjectExpense(data);
}

export async function deleteProjectExpense(recordId: string) {
  unwrap(
    await supabase.from('project_expenses').delete().eq('id', recordId),
    'deleteProjectExpense',
  );
}

// ────────────────────────────────────────────────────────────────────────────
// COST PAYMENTS — per-expense payment history.
//
// Schema gap: cost_payments.job_costing_id is the FK column, NOT a
// project_expenses link. The UI today links payments to project_expenses
// (via the "Project Expense" array). To preserve UI semantics without
// schema changes, we stash the project_expense id in fields_raw under the
// `Project Expense` key and read it back the same way.
// ────────────────────────────────────────────────────────────────────────────

interface CostPaymentRow {
  id: string;
  claim_id?: string | null;
  job_costing_id?: string | null;
  payment_name?: string | null;
  amount?: number | null;
  date?: string | null;
  payment_method?: string | null;
  check_number?: string | null;
  notes?: string | null;
  status?: string | null;
  created_at?: string | null;
  fields_raw?: Record<string, unknown> | null;
}

function mapCostPayment(row: CostPaymentRow) {
  const raw = rawObject(row.fields_raw);
  return {
    id: row.id,
    _createdTime: row.created_at ?? undefined,
    'Payment Name': row.payment_name ?? '',
    Amount: row.amount ?? 0,
    'Payment Date': row.date ?? '',
    Method: row.payment_method ?? '',
    'Check Number': row.check_number ?? '',
    Notes: row.notes ?? '',
    // Surface a synthetic "Project Expense" array preserved in fields_raw so
    // the UI grouping (per-expense payment lists) continues to work without
    // a schema change.
    'Project Expense':
      Array.isArray(raw['Project Expense']) ? (raw['Project Expense'] as string[]) : [],
    ...raw,
  };
}

function unmapCostPayment(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    switch (k) {
      case 'Payment Name':
        out.payment_name = v;
        break;
      case 'Amount':
        out.amount = v;
        break;
      case 'Payment Date':
        out.date = v;
        break;
      case 'Method':
        out.payment_method = v;
        break;
      case 'Check Number':
        out.check_number = v;
        break;
      case 'Notes':
        out.notes = v;
        break;
      case 'Claim':
        if (Array.isArray(v) && v.length > 0) out.claim_id = v[0];
        break;
      case 'Project Expense':
        // Preserve in fields_raw — also drop in the FK column if it looks like
        // a job_costing id was passed in single-value form (no schema column
        // for project_expense; this is a UI-side concept today).
        raw['Project Expense'] = v;
        break;
      default:
        raw[k] = v;
    }
  }
  if (Object.keys(raw).length) out.fields_raw = raw;
  return out;
}

export async function getCostPayments(projectExpenseId?: string) {
  const data = unwrap(
    await supabase.from('cost_payments').select('*').order('date', { ascending: false }),
    'getCostPayments',
  ) as CostPaymentRow[];
  const mapped = data.map(mapCostPayment);
  if (!projectExpenseId) return mapped;
  return mapped.filter((r) =>
    Array.isArray(r['Project Expense']) && r['Project Expense'].includes(projectExpenseId),
  );
}

export async function createCostPayment(input: Record<string, unknown>) {
  const insert = unmapCostPayment(input);
  const data = unwrap(
    await supabase.from('cost_payments').insert(insert as never).select().single(),
    'createCostPayment',
  ) as CostPaymentRow;
  return mapCostPayment(data);
}

export async function deleteCostPayment(recordId: string) {
  unwrap(await supabase.from('cost_payments').delete().eq('id', recordId), 'deleteCostPayment');
}

// ────────────────────────────────────────────────────────────────────────────
// AGGREGATIONS — per-claim financial summary.
// ────────────────────────────────────────────────────────────────────────────

export async function getClaimFinancialSummary(claimRecordId: string) {
  const [claimRow, ledger, reports, releases, costs] = await Promise.all([
    (async () => {
      const data = unwrap(
        await supabase.from('claims').select('*').eq('id', claimRecordId).single(),
        'getClaimFinancialSummary.claim',
      );
      return mapClaim(data as unknown as ClaimRow);
    })(),
    getFinancialLedger(claimRecordId),
    getAdjusterReports(claimRecordId),
    getMortgageReleases(claimRecordId),
    getJobCosting(claimRecordId),
  ]);

  const claimData = claimRow;
  const latestReport = reports.length > 0 ? reports[reports.length - 1] : null;

  const insuranceIn = ledger
    .filter((e: any) => e['Entry Type'] === 'Insurance Payment' && e.Direction === 'Inflow')
    .reduce((sum: number, e: any) => sum + (e.Amount || 0), 0);

  const homeownerIn = ledger
    .filter((e: any) => e['Entry Type'] === 'Homeowner Payment' && e.Direction === 'Inflow')
    .reduce((sum: number, e: any) => sum + (e.Amount || 0), 0);

  const mortgageIn = ledger
    .filter((e: any) => e['Entry Type'] === 'Mortgage Release' && e.Direction === 'Inflow')
    .reduce((sum: number, e: any) => sum + (e.Amount || 0), 0);

  const vendorOut = ledger
    .filter((e: any) => e['Entry Type'] === 'Vendor Payment' && e.Direction === 'Outflow')
    .reduce((sum: number, e: any) => sum + (e.Amount || 0), 0);

  const totalMortgageHeld =
    releases.length > 0 ? (releases[0] as any)['Total Held by Mortgage'] || 0 : 0;
  const totalMortgageReleased = releases
    .filter((r: any) => ['Check Received', 'Deposited'].includes(r['Release Status']))
    .reduce((sum: number, r: any) => sum + (r['Release Amount'] || 0), 0);

  const totalBudget = costs.reduce((sum: number, c: any) => {
    const approved = Number(c['Approved Estimate Amount']) || Number(c['Xactimate Budget']) || 0;
    const sup = c['Has Supplement'] ? Number(c['Supplement Approved Amount']) || 0 : 0;
    return sum + approved + sup;
  }, 0);
  const totalActual = costs.reduce((sum: number, c: any) => sum + (c['Actual Cost'] || 0), 0);

  const totalRCV = (latestReport as any)?.['RCV Amount'] || claimData.RCV || 0;
  const totalDepreciation =
    (latestReport as any)?.Depreciation || claimData.Depreciation || 0;
  const totalACV = (latestReport as any)?.['ACV Amount'] || claimData.ACV || 0;
  const deductible = (latestReport as any)?.Deductible || claimData.Deductible || 0;

  const totalReceived = insuranceIn + homeownerIn + mortgageIn;
  const mortgageHeld = totalMortgageHeld - totalMortgageReleased;

  return {
    claimId: claimData['Claim ID'] || '',
    claimRecordId,
    customer: claimData['Last Name'] || '',
    address: claimData.Address || '',
    carrier: claimData.Carrier || '',

    totalRCV,
    totalDepreciation,
    totalACV,
    totalOAndP: (latestReport as any)?.['O&P Amount'] || claimData['O&P'] || 0,
    deductible,
    netToInsured: totalACV - deductible,

    insurancePaymentsReceived: insuranceIn,
    homeownerPaymentsReceived: homeownerIn,
    mortgageReleasesReceived: mortgageIn,
    totalReceived,

    insuranceOutstanding: Math.max(0, totalBudget - insuranceIn),
    depreciationRecoverable: totalDepreciation,
    mortgageHeld,
    homeownerOwed: Math.max(0, deductible - homeownerIn),
    totalOutstanding: Math.max(0, totalBudget - totalReceived),

    totalBudget,
    totalActualCosts: totalActual,
    totalVariance: totalBudget - totalActual,
    variancePercent:
      totalBudget > 0 ? ((totalBudget - totalActual) / totalBudget) * 100 : 0,

    grossProfit: totalReceived - vendorOut,
    profitMargin:
      totalReceived > 0 ? ((totalReceived - vendorOut) / totalReceived) * 100 : 0,

    adjusterReportCount: reports.length,
    mortgageReleaseCount: releases.length,
    pendingInspections: releases.filter((r: any) =>
      ['Pending Request', 'Requested', 'Scheduled'].includes(r['Inspection Status']),
    ).length,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// PORTFOLIO OVERVIEW — aggregate across all claims.
// ────────────────────────────────────────────────────────────────────────────

export interface RecentActivity {
  id: string;
  type: 'Ledger' | 'Report' | 'Release' | 'Cost' | 'Payment';
  date: string;
  name: string;
  amount: number;
  claimId: string;
}

export interface PortfolioOverviewData {
  totalClaims: number;
  claimsByStatus: Record<string, number>;

  totalRCV: number;
  totalACV: number;
  totalReceived: number;
  totalOutstanding: number;
  grossProfit: number;
  profitMargin: number;

  totalBudget: number;
  totalActualCosts: number;
  totalVariance: number;
  variancePercent: number;

  recentActivity: RecentActivity[];

  comparatives: ComparativesData;
}

export async function getPortfolioOverview(
  claimsMasterData?: any[],
  paymentsLogData?: any[],
): Promise<PortfolioOverviewData> {
  const [financialClaims, ledger, reports, releases, costs, expenses, costPayments] =
    await Promise.all([
      getAllClaims(),
      getFinancialLedger(),
      getAdjusterReports(),
      getMortgageReleases(),
      getJobCosting(),
      getProjectExpenses(),
      getCostPayments(),
    ]);

  // In the single-DB Supabase world the "Claims Master" and "Financials" are
  // the SAME claims table, so claimsMasterData is just the same set of claim
  // rows. Keep the fall-through to financialClaims so callers that don't
  // pass it still work.
  const claims = claimsMasterData && claimsMasterData.length ? claimsMasterData : financialClaims;

  const validClaimIds = new Set(claims.map((c: any) => c['Claim ID']).filter(Boolean));

  const claimIdMap: Record<string, string> = {};
  financialClaims.forEach((c: any) => {
    claimIdMap[c.id] = c['Claim ID'] || '';
  });

  function belongsToClaimsMaster(record: any): boolean {
    const linked = record.Claim;
    if (Array.isArray(linked) && linked.length > 0) {
      const claimId = claimIdMap[linked[0]];
      return claimId ? validClaimIds.has(claimId) : false;
    }
    return false;
  }

  function resolveClaimId(record: any): string {
    const linked = record.Claim;
    if (Array.isArray(linked) && linked.length > 0) {
      return claimIdMap[linked[0]] || '—';
    }
    return '—';
  }

  const filteredLedger = ledger.filter(belongsToClaimsMaster);
  const filteredReports = reports.filter(belongsToClaimsMaster);
  const filteredReleases = releases.filter(belongsToClaimsMaster);
  const filteredCosts = costs.filter(belongsToClaimsMaster);
  const filteredExpenses = expenses.filter(belongsToClaimsMaster);
  const filteredExpenseIds = new Set(filteredExpenses.map((e: any) => e.id));
  const filteredCostPayments = costPayments.filter(
    (p: any) =>
      Array.isArray(p['Project Expense']) &&
      p['Project Expense'].some((id: string) => filteredExpenseIds.has(id)),
  );

  const claimsByStatus: Record<string, number> = {};
  claims.forEach((c: any) => {
    const status = c.Status || c.Stage || 'Unknown';
    claimsByStatus[status] = (claimsByStatus[status] || 0) + 1;
  });

  const totalRCV = claims.reduce((sum: number, c: any) => sum + (c.RCV || 0), 0);
  const totalACV = claims.reduce((sum: number, c: any) => sum + (c.ACV || 0), 0);

  const masterIdToClaimId: Record<string, string> = {};
  claims.forEach((c: any) => {
    masterIdToClaimId[c.id] = c['Claim ID'] || '';
  });

  const totalReceived = filteredLedger
    .filter(
      (e: any) =>
        ['Insurance Payment', 'Homeowner Payment', 'Mortgage Release'].includes(e['Entry Type']) &&
        e.Direction === 'Inflow',
    )
    .reduce((sum: number, e: any) => sum + (e.Amount || 0), 0);

  const totalBudget = filteredCosts.reduce((sum: number, c: any) => {
    const base = Number(c['Approved Estimate Amount']) || Number(c['Xactimate Budget']) || 0;
    const supplement = c['Has Supplement'] ? Number(c['Supplement Approved Amount']) || 0 : 0;
    return sum + base + supplement;
  }, 0);

  const totalActual = filteredExpenses.reduce(
    (sum: number, e: any) => sum + (Number(e.Amount) || 0),
    0,
  );
  const totalVariance = totalBudget - totalActual;

  const totalOutstanding = Math.max(0, totalBudget - totalReceived);

  const ledgerOutflows = filteredLedger
    .filter((e: any) => e.Direction === 'Outflow')
    .reduce((sum: number, e: any) => sum + (Number(e.Amount) || 0), 0);
  const costPaymentsTotal = filteredCostPayments.reduce(
    (sum: number, p: any) => sum + (Number(p.Amount) || 0),
    0,
  );
  const totalOutflows = ledgerOutflows + costPaymentsTotal;

  const grossProfit = totalReceived - totalOutflows;

  const activity: RecentActivity[] = [];

  filteredLedger.forEach((e: any) => {
    activity.push({
      id: e.id,
      type: 'Ledger',
      date: e.Date || '',
      name: e['Entry Name'] || e['Entry Type'] || '—',
      amount: e.Amount || 0,
      claimId: resolveClaimId(e),
    });
  });

  filteredReports.forEach((r: any) => {
    activity.push({
      id: r.id,
      type: 'Report',
      date: r['Report Date'] || '',
      name: r['Report Name'] || r['Report Type'] || '—',
      amount: r['RCV Amount'] || 0,
      claimId: resolveClaimId(r),
    });
  });

  filteredReleases.forEach((r: any) => {
    activity.push({
      id: r.id,
      type: 'Release',
      date: r['Request Date'] || '',
      name: r['Release Name'] || `Release #${r['Release Number']}`,
      amount: r['Release Amount'] || 0,
      claimId: resolveClaimId(r),
    });
  });

  filteredCosts.forEach((c: any) => {
    const date = c['Invoice Date'] || (c._createdTime ? c._createdTime.slice(0, 10) : '');
    const supplement = c['Has Supplement'] ? Number(c['Supplement Approved Amount']) || 0 : 0;
    const amount =
      Number(c['Actual Cost']) ||
      Number(c['Xactimate Budget']) ||
      (Number(c['Approved Estimate Amount']) || 0) + supplement;
    activity.push({
      id: c.id,
      type: 'Cost',
      date,
      name: c['Cost Name'] || c['Trade Category'] || '—',
      amount,
      claimId: resolveClaimId(c),
    });
  });

  (paymentsLogData || []).forEach((p: any) => {
    const linkedMasterId = Array.isArray(p.Claim) && p.Claim.length > 0 ? p.Claim[0] : '';
    const claimId = masterIdToClaimId[linkedMasterId];
    if (!claimId || !validClaimIds.has(claimId)) return;
    const date = p['Payment Date'] || p['Due Date'] || p.createdTime || '';
    if (!date) return;
    const label = p.Vendor || p.Description || 'Payment';
    const statusLabel = p['Payment Status'] || p.Status || '';
    activity.push({
      id: `payment-${p.id}`,
      type: 'Payment',
      date,
      name: statusLabel ? `${label} (${statusLabel})` : label,
      amount: p.Amount || 0,
      claimId,
    });
  });

  activity.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const claimIdToCarrier: Record<string, string> = {};
  claims.forEach((c: any) => {
    if (c['Claim ID']) claimIdToCarrier[c['Claim ID']] = c.Carrier || '';
  });
  const finClaimRecordToCarrier: Record<string, string> = {};
  financialClaims.forEach((fc: any) => {
    const claimId = claimIdMap[fc.id] || '';
    finClaimRecordToCarrier[fc.id] = claimIdToCarrier[claimId] || fc.Carrier || '';
  });

  type Bucket = { submitted: number; approved: number; count: number };
  const carrierBuckets = new Map<string, Bucket>();
  const tradeBuckets = new Map<string, Bucket>();
  filteredCosts.forEach((j: any) => {
    const submitted = Number(j['Submitted Estimate Amount']) || 0;
    if (submitted <= 0) return;
    const approved =
      (Number(j['Approved Estimate Amount']) || 0) +
      (j['Has Supplement'] ? Number(j['Supplement Approved Amount']) || 0 : 0);

    const finClaimId = Array.isArray(j.Claim) && j.Claim.length > 0 ? j.Claim[0] : '';
    const carrier = finClaimRecordToCarrier[finClaimId] || 'Unknown';
    const carrierBucket = carrierBuckets.get(carrier) || { submitted: 0, approved: 0, count: 0 };
    carrierBucket.submitted += submitted;
    carrierBucket.approved += approved;
    carrierBucket.count += 1;
    carrierBuckets.set(carrier, carrierBucket);

    const trade = (j['Trade Category'] || 'Uncategorized').toString();
    const tradeBucket = tradeBuckets.get(trade) || { submitted: 0, approved: 0, count: 0 };
    tradeBucket.submitted += submitted;
    tradeBucket.approved += approved;
    tradeBucket.count += 1;
    tradeBuckets.set(trade, tradeBucket);
  });

  function bucketsToRows(buckets: Map<string, Bucket>): ComparativeRow[] {
    return Array.from(buckets.entries())
      .map(([key, b]) => {
        const variance = b.submitted - b.approved;
        const variancePercent = b.submitted > 0 ? (variance / b.submitted) * 100 : 0;
        const accuracyPercent =
          b.submitted > 0 ? Math.min(100, Math.max(0, (b.approved / b.submitted) * 100)) : 0;
        return {
          key,
          submittedEstimate: b.submitted,
          approvedEstimate: b.approved,
          variance,
          variancePercent,
          accuracyPercent,
          rowCount: b.count,
        } satisfies ComparativeRow;
      })
      .sort((a, b) => b.submittedEstimate - a.submittedEstimate);
  }

  const comparatives: ComparativesData = {
    byCarrier: bucketsToRows(carrierBuckets),
    byTradeCategory: bucketsToRows(tradeBuckets),
  };

  return {
    totalClaims: claims.length,
    claimsByStatus,
    totalRCV,
    totalACV,
    totalReceived,
    totalOutstanding: Math.max(0, totalOutstanding),
    grossProfit,
    profitMargin: totalReceived > 0 ? (grossProfit / totalReceived) * 100 : 0,
    totalBudget,
    totalActualCosts: totalActual,
    totalVariance,
    variancePercent: totalBudget > 0 ? (totalVariance / totalBudget) * 100 : 0,
    recentActivity: activity.slice(0, 10),
    comparatives,
  };
}
