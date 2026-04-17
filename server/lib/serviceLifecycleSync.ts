/**
 * ============================================================================
 * Cross-App Service Lifecycle Sync — CRUD + cascade matrix (CANONICAL)
 * ============================================================================
 *
 * The three apps (Claims Master = M, Restoration Ops = P, Financials = J/J')
 * act as one. This module implements the contract that keeps them in sync.
 *
 * Linked entities:
 *   - M = Claims Master `Modules` row (the hub)
 *   - P = Restoration Ops `Projects` row (M.Restoration Project Record ID ↔ P.Module Record ID)
 *   - J = Financials `Job Costing` row (M.Job Costing Record ID ↔ J.Module Record ID)
 *   - J' = optional supplement Job Costing row when Supplement Invoice Mode = 'Separate invoice'
 *
 * | Action                                          | What also happens                                     |
 * |-------------------------------------------------|-------------------------------------------------------|
 * | createService                                   | M + P shell                                           |
 * | createProject (rare)                            | M shell                                               |
 * | updateService Bill To / Module Type             | mirror Module Type → P.Name and J.Trade Category      |
 * | updateProject Operation/Estimate Status         | recompose M.Service Status                            |
 * | Estimate Status → Approved + amount             | upsert J, stamp P.Estimate Approved Date, backfill M  |
 * | Has Supplement → true                           | if separate, create J'; fire notifySupplementAdded    |
 * | Has Supplement → false                          | if J', delete J' (refuses if payments tied)           |
 * | Approved/Supplement amount changes              | recompute derived payment status                       |
 * | Ledger Inflow tagged matching Category          | recompute derived payment status                       |
 * | deleteService                                   | cascade M + P + J + J'; refuses if ledger refs        |
 * | deleteProject                                   | refuses unless opt-in; then cascades                  |
 * | deleteJobCosting                                | refuses if ledger refs; clears M.Job Costing Record ID|
 * | deleteSupplementRow (J')                        | clears Has Supplement on J                            |
 * | deleteLedgerEntry                               | recompute derived payment status                       |
 *
 * Implementation rules:
 *   1. Cascading deletes are preceded by a referential check; refuse with
 *      typed error counts that the UI surfaces.
 *   2. Cascades are best-effort transactions: do local first, then remote;
 *      log partials so reconcile() can heal.
 *   3. UI must always confirm cascades — no silent multi-base deletes.
 *
 * Three copies of this file exist (financials = canonical, plus VEC and
 * restoration-ops). Keep them in sync — the matrix above travels with the
 * code so drift is visible at a glance.
 * ============================================================================
 */

import { airtablePat, baseIdFor, type AppKey } from "./bases.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BillTo = "Insurance" | "Client";
export type SupplementInvoiceMode = "Append to invoice" | "Separate invoice";
export type OperationStatus =
  | "Not Started"
  | "Work in Progress"
  | "On Hold"
  | "On Issues"
  | "Not Completed"
  | "Complete";
export type EstimateStatus =
  | "Draft"
  | "For Review"
  | "Submitted to Insurance"
  | "For Revision"
  | "Approved";

export interface ModuleRow {
  id: string;
  fields: {
    "Module Type"?: string;
    "Bill To"?: BillTo;
    "Restoration Project Record ID"?: string;
    "Job Costing Record ID"?: string;
    "Service Status"?: string;
    Status?: string;
    Claim?: string[];
    [k: string]: unknown;
  };
}

export interface ProjectRow {
  id: string;
  fields: {
    Name?: string;
    "Operation Status"?: OperationStatus;
    "Estimate Status"?: EstimateStatus;
    "Estimate Approved Date"?: string;
    "Module Record ID"?: string;
    "Claim ID"?: string;
    [k: string]: unknown;
  };
}

export interface JobCostingRow {
  id: string;
  fields: {
    "Cost Name"?: string;
    "Trade Category"?: string;
    "Approved Estimate Amount"?: number;
    "Has Supplement"?: boolean;
    "Supplement Approved Amount"?: number;
    "Supplement Invoice Mode"?: SupplementInvoiceMode;
    "Supplement Separate Invoice Label"?: string;
    "Module Record ID"?: string;
    "Payment Status"?: string;
    Claim?: string[];
    [k: string]: unknown;
  };
}

export interface LedgerRow {
  id: string;
  fields: {
    Direction?: "Inflow" | "Outflow";
    Amount?: number;
    Category?: string;
    Claim?: string[];
    [k: string]: unknown;
  };
}

export class CascadeRefusedError extends Error {
  constructor(message: string, public readonly counts: Record<string, number>) {
    super(message);
    this.name = "CascadeRefusedError";
  }
}

// ---------------------------------------------------------------------------
// Low-level Airtable HTTP helpers
// ---------------------------------------------------------------------------

const TABLE = {
  modules: "Modules",
  projects: "Projects",
  jobCosting: "Job Costing",
  ledger: "Financial Ledger",
  // Both the Claims Master base AND the Financials base have a "Claims" table.
  // They are *different* tables in different bases — Job Costing in Financials
  // links to the Financials Claims, not Claims Master's. ensureFinancialsClaim
  // bridges between them.
  claimsMaster: "Claims",
  financialsClaims: "Claims",
} as const;

async function airtable<T>(
  app: AppKey,
  path: string,
  init: RequestInit & { searchParams?: Record<string, string | undefined> } = {},
): Promise<T> {
  const baseId = baseIdFor(app);
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${path}`);
  for (const [k, v] of Object.entries(init.searchParams ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }
  const { searchParams: _omit, headers, ...rest } = init;
  const res = await fetch(url.toString(), {
    ...rest,
    headers: {
      Authorization: `Bearer ${airtablePat()}`,
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Airtable ${init.method ?? "GET"} ${url.pathname} → ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

async function findOneByFormula<T>(
  app: AppKey,
  table: string,
  formula: string,
): Promise<{ id: string; fields: T } | null> {
  const data = await airtable<{ records: Array<{ id: string; fields: T }> }>(app, encodeURIComponent(table), {
    method: "GET",
    searchParams: { filterByFormula: formula, maxRecords: "1" },
  });
  return data.records[0] ?? null;
}

async function listByFormula<T>(
  app: AppKey,
  table: string,
  formula: string,
): Promise<Array<{ id: string; fields: T }>> {
  const all: Array<{ id: string; fields: T }> = [];
  let offset: string | undefined;
  do {
    const data = await airtable<{ records: Array<{ id: string; fields: T }>; offset?: string }>(
      app,
      encodeURIComponent(table),
      { method: "GET", searchParams: { filterByFormula: formula, pageSize: "100", offset } },
    );
    all.push(...data.records);
    offset = data.offset;
  } while (offset);
  return all;
}

async function createRow<T>(app: AppKey, table: string, fields: T): Promise<{ id: string; fields: T }> {
  const data = await airtable<{ id: string; fields: T }>(app, encodeURIComponent(table), {
    method: "POST",
    body: JSON.stringify({ fields, typecast: true }),
  });
  return data;
}

async function updateRow<T>(
  app: AppKey,
  table: string,
  id: string,
  fields: Partial<T>,
): Promise<{ id: string; fields: T }> {
  const data = await airtable<{ id: string; fields: T }>(app, `${encodeURIComponent(table)}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
  return data;
}

async function deleteRow(app: AppKey, table: string, id: string): Promise<void> {
  await airtable(app, `${encodeURIComponent(table)}/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Lookup helpers (M ↔ P ↔ J)
// ---------------------------------------------------------------------------

async function getModule(moduleRecordId: string): Promise<ModuleRow | null> {
  try {
    const data = await airtable<{ id: string; fields: ModuleRow["fields"] }>(
      "CLAIMS_MASTER",
      `${encodeURIComponent(TABLE.modules)}/${moduleRecordId}`,
      { method: "GET" },
    );
    return { id: data.id, fields: data.fields };
  } catch {
    return null;
  }
}

async function findProjectByModule(moduleRecordId: string): Promise<ProjectRow | null> {
  return findOneByFormula<ProjectRow["fields"]>(
    "REST_OPS",
    TABLE.projects,
    `{Module Record ID} = '${moduleRecordId}'`,
  );
}

async function findJobCostingByModule(moduleRecordId: string): Promise<JobCostingRow | null> {
  return findOneByFormula<JobCostingRow["fields"]>(
    "FINANCIALS",
    TABLE.jobCosting,
    `AND({Module Record ID} = '${moduleRecordId}', NOT(FIND(':supplement', {Module Record ID})))`,
  );
}

async function findSupplementJobCosting(moduleRecordId: string): Promise<JobCostingRow | null> {
  return findOneByFormula<JobCostingRow["fields"]>(
    "FINANCIALS",
    TABLE.jobCosting,
    `{Module Record ID} = '${moduleRecordId}:supplement'`,
  );
}

async function listLedgerForCategories(
  claimRecordId: string,
  categories: string[],
): Promise<LedgerRow[]> {
  if (!categories.length) return [];
  const cats = categories
    .map((c) => `LOWER({Category}) = '${c.trim().toLowerCase().replace(/'/g, "\\'")}'`)
    .join(", ");
  const formula = `AND(FIND('${claimRecordId}', ARRAYJOIN({Claim})) > 0, OR(${cats}))`;
  return listByFormula<LedgerRow["fields"]>("FINANCIALS", TABLE.ledger, formula);
}

interface ClaimsMasterClaimFields {
  "Claim ID"?: string;
  "First Name"?: string;
  "Last Name"?: string;
  Address?: string;
  Carrier?: string;
  "Policy Number"?: string;
  RCV?: number;
  ACV?: number;
  Deductible?: number;
  "O&P"?: number;
  Depreciation?: number;
  "Loss Date"?: string;
  [k: string]: unknown;
}

/**
 * Job Costing.Claim is a linked-record field whose record IDs live in the
 * Financials base, not Claims Master. Before we upsert a Job Costing row we
 * have to make sure the Financials base has a Claim row with the matching
 * Claim ID, creating it (with a minimal bridge of safe text/number fields)
 * if not. Returns the Financials Claim record id.
 *
 * This is the same contract as financials/src/lib/claims-master.ts
 * `ensureFinancialClaimRecord` — duplicated here so the server-side sync
 * helpers don't have to depend on the browser-only Airtable JS SDK.
 */
async function ensureFinancialsClaim(
  claimsMasterRecordId: string,
): Promise<string> {
  // 1. Read the source claim from Claims Master.
  const cmClaim = await airtable<{
    id: string;
    fields: ClaimsMasterClaimFields;
  }>(
    "CLAIMS_MASTER",
    `${encodeURIComponent(TABLE.claimsMaster)}/${claimsMasterRecordId}`,
    { method: "GET" },
  );
  const claimId = cmClaim.fields["Claim ID"];
  if (!claimId) {
    throw new Error(
      `Claims Master record ${claimsMasterRecordId} is missing a Claim ID — cannot bridge to Financials.`,
    );
  }

  // 2. Look up the Financials base for an existing Claim with that Claim ID.
  const existing = await findOneByFormula<{ "Claim ID"?: string }>(
    "FINANCIALS",
    TABLE.financialsClaims,
    `{Claim ID} = '${claimId.replace(/'/g, "\\'")}'`,
  );
  if (existing) return existing.id;

  // 3. Create a bridge row with the safe text/number fields. We deliberately
  // skip select fields (Status / Stage) — option lists may diverge between
  // bases and would 422 the create.
  const bridge: Record<string, unknown> = {
    "Claim ID": claimId,
  };
  const safeKeys: Array<keyof ClaimsMasterClaimFields> = [
    "First Name",
    "Last Name",
    "Address",
    "Carrier",
    "Policy Number",
    "RCV",
    "ACV",
    "Deductible",
    "O&P",
    "Depreciation",
  ];
  for (const k of safeKeys) {
    const v = cmClaim.fields[k];
    if (v !== undefined && v !== null && v !== "") bridge[k] = v;
  }
  if (cmClaim.fields["Loss Date"]) {
    bridge["Date of Loss"] = cmClaim.fields["Loss Date"];
  }

  const created = await createRow("FINANCIALS", TABLE.financialsClaims, bridge);
  return created.id;
}

// ---------------------------------------------------------------------------
// Public API — see header matrix
// ---------------------------------------------------------------------------

export interface CreateServiceInput {
  claimRecordId: string;
  claimId: string;
  moduleType: string;
  billTo: BillTo;
}

export interface CreateServiceResult {
  module: ModuleRow;
  project: ProjectRow;
}

export async function createService(input: CreateServiceInput): Promise<CreateServiceResult> {
  // 1. Create M shell
  const module = await createRow<ModuleRow["fields"]>("CLAIMS_MASTER", TABLE.modules, {
    "Module Type": input.moduleType,
    "Bill To": input.billTo,
    Status: "Active",
    Claim: [input.claimRecordId],
  });

  // 2. Create P shell
  const project = await createRow<ProjectRow["fields"]>("REST_OPS", TABLE.projects, {
    Name: input.moduleType,
    "Operation Status": "Not Started",
    "Estimate Status": "Draft",
    "Module Record ID": module.id,
    "Claim ID": input.claimId,
  });

  // 3. Backfill M with the project pointer + composed Service Status text.
  // We deliberately do NOT denormalize Op/Est/Approved fields onto M — the
  // Modules table schema only carries Service Status (composed text) per plan.
  // The VEC service card parses Service Status for chips and fetches the J
  // row via the financials sidecar for the dollar amounts when expanded.
  await updateRow<ModuleRow["fields"]>("CLAIMS_MASTER", TABLE.modules, module.id, {
    "Restoration Project Record ID": project.id,
    "Service Status": composeServiceStatus("Not Started", "Draft", "No Payment"),
  });

  return {
    module: { ...module, fields: { ...module.fields, "Restoration Project Record ID": project.id } },
    project,
  };
}

export interface UpdateServiceInput {
  billTo?: BillTo;
  moduleType?: string;
  status?: string;
}

export async function updateService(
  moduleRecordId: string,
  patch: UpdateServiceInput,
): Promise<void> {
  const m = await getModule(moduleRecordId);
  if (!m) throw new Error(`Module ${moduleRecordId} not found`);

  const mPatch: Partial<ModuleRow["fields"]> = {};
  if (patch.billTo) mPatch["Bill To"] = patch.billTo;
  if (patch.moduleType) mPatch["Module Type"] = patch.moduleType;
  if (patch.status) mPatch.Status = patch.status;
  if (Object.keys(mPatch).length) {
    await updateRow("CLAIMS_MASTER", TABLE.modules, moduleRecordId, mPatch);
  }

  // Mirror Module Type → P.Name and J.Trade Category if it changed.
  if (patch.moduleType) {
    const p = await findProjectByModule(moduleRecordId);
    if (p) await updateRow("REST_OPS", TABLE.projects, p.id, { Name: patch.moduleType });
    const j = await findJobCostingByModule(moduleRecordId);
    if (j) await updateRow("FINANCIALS", TABLE.jobCosting, j.id, { "Trade Category": patch.moduleType });
  }
}

export interface ApproveEstimateInput {
  approvedAmount: number;
  /** Optional override for who paid; defaults to today. */
  approvedDateISO?: string;
}

export interface ApproveEstimateResult {
  project: ProjectRow;
  jobCosting: JobCostingRow;
}

export async function approveEstimate(
  moduleRecordId: string,
  input: ApproveEstimateInput,
): Promise<ApproveEstimateResult> {
  const m = await getModule(moduleRecordId);
  if (!m) throw new Error(`Module ${moduleRecordId} not found`);
  const moduleType = (m.fields["Module Type"] as string) ?? "Service";
  const claimsMasterRecord = m.fields.Claim?.[0];

  // 1. Stamp P
  let p = await findProjectByModule(moduleRecordId);
  if (!p) throw new Error(`Project for module ${moduleRecordId} not found — run createService first`);
  const today = (input.approvedDateISO ?? new Date().toISOString()).slice(0, 10);
  p = (await updateRow("REST_OPS", TABLE.projects, p.id, {
    "Estimate Status": "Approved",
    "Estimate Approved Date": today,
  })) as ProjectRow;

  // 2. Bridge: Job Costing.Claim links to a row in the FINANCIALS Claims
  // table, not Claims Master. Resolve (or create) the matching Financials
  // Claim row before we upsert J.
  const financialsClaimRecord = claimsMasterRecord
    ? await ensureFinancialsClaim(claimsMasterRecord)
    : undefined;

  // 3. Upsert J
  const existing = await findJobCostingByModule(moduleRecordId);
  let jobCosting: JobCostingRow;
  if (existing) {
    jobCosting = (await updateRow("FINANCIALS", TABLE.jobCosting, existing.id, {
      "Approved Estimate Amount": input.approvedAmount,
      "Trade Category": moduleType,
      "Module Record ID": moduleRecordId,
    })) as JobCostingRow;
  } else {
    // Stamp Invoice Date with the approval day so portfolio activity views
    // ("Recently Updated" etc.) have a date for the row. Job Costing rows
    // born from the lifecycle approve flow don't have a separate
    // approval-date field on the schema yet.
    const today = (input.approvedDateISO ?? new Date().toISOString()).slice(0, 10);
    jobCosting = (await createRow("FINANCIALS", TABLE.jobCosting, {
      "Cost Name": `${moduleType} — ${moduleRecordId.slice(-6)}`,
      "Trade Category": moduleType,
      "Approved Estimate Amount": input.approvedAmount,
      "Invoice Date": today,
      "Module Record ID": moduleRecordId,
      ...(financialsClaimRecord ? { Claim: [financialsClaimRecord] } : {}),
    })) as JobCostingRow;
  }

  // 4. Backfill M with the Job Costing pointer + recomposed Service Status.
  // (The dollar amount lives only on J — VEC reads it via the sidecar proxy.)
  await updateRow("CLAIMS_MASTER", TABLE.modules, moduleRecordId, {
    "Job Costing Record ID": jobCosting.id,
    "Service Status": composeServiceStatus(
      (p.fields["Operation Status"] as OperationStatus) ?? "Not Started",
      "Approved",
      "No Payment",
    ),
  });

  return { project: p, jobCosting };
}

export interface SetSupplementInput {
  hasSupplement: boolean;
  amount?: number;
  mode?: SupplementInvoiceMode;
  separateInvoiceLabel?: string;
}

export interface SetSupplementResult {
  jobCosting: JobCostingRow;
  supplementRow?: JobCostingRow;
  notification?: { service: string; amount: number; mode: SupplementInvoiceMode };
}

export async function setSupplement(
  moduleRecordId: string,
  input: SetSupplementInput,
): Promise<SetSupplementResult> {
  const j = await findJobCostingByModule(moduleRecordId);
  if (!j) throw new Error(`Job Costing for module ${moduleRecordId} not found — approve estimate first`);

  const m = await getModule(moduleRecordId);
  const moduleType = (m?.fields["Module Type"] as string) ?? "Service";
  const claimsMasterRecord = m?.fields.Claim?.[0];
  // Bridge: J'.Claim links to a Financials Claims row, not Claims Master.
  // Resolve once here so the J' create path doesn't 422.
  const financialsClaimRecord = claimsMasterRecord
    ? await ensureFinancialsClaim(claimsMasterRecord)
    : undefined;

  if (!input.hasSupplement) {
    // Toggle off — must remove J' if any (with refchecks).
    const supRow = await findSupplementJobCosting(moduleRecordId);
    if (supRow) {
      const refs = await refsForJobCosting(supRow);
      if (refs > 0) {
        throw new CascadeRefusedError(
          `Cannot remove supplement: ${refs} ledger entries reference it. Reassign first.`,
          { ledgerEntries: refs },
        );
      }
      await deleteRow("FINANCIALS", TABLE.jobCosting, supRow.id);
    }
    const updated = (await updateRow("FINANCIALS", TABLE.jobCosting, j.id, {
      "Has Supplement": false,
      "Supplement Approved Amount": undefined,
      "Supplement Invoice Mode": undefined,
      "Supplement Separate Invoice Label": undefined,
    })) as JobCostingRow;
    // Supplement state lives only on J — VEC reads it via the sidecar proxy.
    return { jobCosting: updated };
  }

  // Toggle on.
  const amount = input.amount ?? 0;
  const mode = input.mode ?? "Append to invoice";
  const label = input.separateInvoiceLabel ?? `${moduleType} Supplement`;

  const updated = (await updateRow("FINANCIALS", TABLE.jobCosting, j.id, {
    "Has Supplement": true,
    "Supplement Approved Amount": amount,
    "Supplement Invoice Mode": mode,
    "Supplement Separate Invoice Label": label,
  })) as JobCostingRow;

  let supplementRow: JobCostingRow | undefined;
  if (mode === "Separate invoice") {
    const existingSup = await findSupplementJobCosting(moduleRecordId);
    if (existingSup) {
      supplementRow = (await updateRow("FINANCIALS", TABLE.jobCosting, existingSup.id, {
        "Trade Category": label,
        "Approved Estimate Amount": amount,
      })) as JobCostingRow;
    } else {
      // Same Invoice Date stamp as the main approve flow — gives portfolio
      // activity a date to sort by.
      const today = new Date().toISOString().slice(0, 10);
      supplementRow = (await createRow("FINANCIALS", TABLE.jobCosting, {
        "Cost Name": `${label} — ${moduleRecordId.slice(-6)}`,
        "Trade Category": label,
        "Approved Estimate Amount": amount,
        "Invoice Date": today,
        "Module Record ID": `${moduleRecordId}:supplement`,
        ...(financialsClaimRecord ? { Claim: [financialsClaimRecord] } : {}),
      })) as JobCostingRow;
    }
  } else {
    // Mode flipped from Separate → Append: clean up J' if present.
    const stale = await findSupplementJobCosting(moduleRecordId);
    if (stale) {
      const refs = await refsForJobCosting(stale);
      if (refs > 0) {
        throw new CascadeRefusedError(
          `Cannot switch to Append: ${refs} payments are tied to the separate supplement invoice.`,
          { ledgerEntries: refs },
        );
      }
      await deleteRow("FINANCIALS", TABLE.jobCosting, stale.id);
    }
  }

  return {
    jobCosting: updated,
    supplementRow,
    notification: { service: moduleType, amount, mode },
  };
}

export interface DeleteServiceOptions {
  /** Required confirmation that the user accepted the cascade dialog. */
  confirmCascade: boolean;
}

export async function deleteService(
  moduleRecordId: string,
  options: DeleteServiceOptions,
): Promise<{ deleted: { M: boolean; P: boolean; J: boolean; "J'": boolean } }> {
  if (!options.confirmCascade) {
    throw new Error("Cascade delete must be confirmed by the caller (UI dialog).");
  }

  // Refchecks
  const j = await findJobCostingByModule(moduleRecordId);
  const jPrime = await findSupplementJobCosting(moduleRecordId);
  let totalRefs = 0;
  const counts: Record<string, number> = {};
  if (j) {
    const r = await refsForJobCosting(j);
    if (r) counts["Job Costing payments"] = r;
    totalRefs += r;
  }
  if (jPrime) {
    const r = await refsForJobCosting(jPrime);
    if (r) counts["Supplement payments"] = r;
    totalRefs += r;
  }
  if (totalRefs > 0) {
    throw new CascadeRefusedError(
      `Cannot delete service: ${totalRefs} payment(s) reference it. Reassign or remove those entries first.`,
      counts,
    );
  }

  const result = { M: false, P: false, J: false, "J'": false };

  if (jPrime) {
    await deleteRow("FINANCIALS", TABLE.jobCosting, jPrime.id);
    result["J'"] = true;
  }
  if (j) {
    await deleteRow("FINANCIALS", TABLE.jobCosting, j.id);
    result.J = true;
  }
  const p = await findProjectByModule(moduleRecordId);
  if (p) {
    await deleteRow("REST_OPS", TABLE.projects, p.id);
    result.P = true;
  }
  await deleteRow("CLAIMS_MASTER", TABLE.modules, moduleRecordId);
  result.M = true;

  return { deleted: result };
}

export interface AddPaymentInput {
  claimRecordId: string;
  amount: number;
  category: string; // service Trade Category or supplement label
  payerPayee: string;
  dateISO?: string;
  notes?: string;
}

export async function addPayment(input: AddPaymentInput): Promise<LedgerRow> {
  // Bridge: Financial Ledger.Claim links to a Financials Claims row, not
  // Claims Master. Resolve the matching Financials Claim record id first.
  const financialsClaimRecord = await ensureFinancialsClaim(input.claimRecordId);
  const row = (await createRow("FINANCIALS", TABLE.ledger, {
    "Entry Name": `${input.category} — payment`,
    "Entry Type": "Insurance Payment",
    Direction: "Inflow",
    Amount: input.amount,
    Date: (input.dateISO ?? new Date().toISOString()).slice(0, 10),
    "Payer/Payee": input.payerPayee,
    Category: input.category,
    Reconciled: false,
    Notes: input.notes,
    Claim: [financialsClaimRecord],
  })) as LedgerRow;
  return row;
}

/**
 * Recompose the M.Service Status text from the canonical statuses on P
 * plus the derived payment status from J + ledger.
 */
export async function mirrorOperationStatus(
  moduleRecordId: string,
  derivedPaymentStatus = "No Payment",
): Promise<void> {
  const p = await findProjectByModule(moduleRecordId);
  if (!p) return;
  const op = (p.fields["Operation Status"] as OperationStatus) ?? "Not Started";
  const est = (p.fields["Estimate Status"] as EstimateStatus) ?? "Draft";
  // M only stores the composed Service Status text — VEC parses it for chips.
  await updateRow("CLAIMS_MASTER", TABLE.modules, moduleRecordId, {
    "Service Status": composeServiceStatus(op, est, derivedPaymentStatus),
  });
}

/**
 * Out-of-band notifier hook. Implementations can post to Discord/Telegram/etc
 * via webhooks read from env (DISCORD_WEBHOOK, TELEGRAM_BOT_TOKEN, etc).
 * Default implementation just logs — override per deployment.
 */
export async function notifySupplementAdded(payload: {
  service: string;
  amount: number;
  mode: SupplementInvoiceMode;
  link?: string;
}): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK?.trim();
  const message = `Supplement added on ${payload.service} — $${payload.amount.toLocaleString()} additional. Mode: ${payload.mode}.${payload.link ? ` ${payload.link}` : ""}`;
  if (!url) {
    // eslint-disable-next-line no-console
    console.log(`[notifySupplementAdded] ${message}`);
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("notifySupplementAdded webhook failed:", (e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Reconciliation pass (safety net)
// ---------------------------------------------------------------------------

export interface ReconcileReport {
  forwardSyncFixed: number;
  orphansRemoved: number;
  staleStatusFixed: number;
  flagged: Array<{ kind: string; id: string; reason: string }>;
}

export async function reconcileServiceLifecycle(): Promise<ReconcileReport> {
  const report: ReconcileReport = {
    forwardSyncFixed: 0,
    orphansRemoved: 0,
    staleStatusFixed: 0,
    flagged: [],
  };

  // Sweep 1: forward sync (P.Approved without matching J)
  const approvedProjects = await listByFormula<ProjectRow["fields"]>(
    "REST_OPS",
    TABLE.projects,
    `{Estimate Status} = 'Approved'`,
  );
  for (const p of approvedProjects) {
    const moduleId = p.fields["Module Record ID"];
    if (!moduleId) continue;
    const j = await findJobCostingByModule(moduleId);
    if (!j) {
      try {
        await approveEstimate(moduleId, { approvedAmount: 0 });
        report.forwardSyncFixed++;
      } catch (e) {
        report.flagged.push({ kind: "forwardSync", id: moduleId, reason: (e as Error).message });
      }
    }
  }

  // Sweep 2: orphan P/J whose Module is gone
  const allProjects = await listByFormula<ProjectRow["fields"]>("REST_OPS", TABLE.projects, `{Module Record ID} != ''`);
  for (const p of allProjects) {
    const moduleId = p.fields["Module Record ID"]!;
    const m = await getModule(moduleId);
    if (m) continue;
    const j = await findJobCostingByModule(moduleId);
    const refs = j ? await refsForJobCosting(j) : 0;
    if (refs > 0) {
      report.flagged.push({ kind: "orphanedProject", id: p.id, reason: `${refs} ledger refs` });
      continue;
    }
    if (j) await deleteRow("FINANCIALS", TABLE.jobCosting, j.id);
    await deleteRow("REST_OPS", TABLE.projects, p.id);
    report.orphansRemoved++;
  }

  // Sweep 3: stale Service Status text
  const allModules = await listByFormula<ModuleRow["fields"]>(
    "CLAIMS_MASTER",
    TABLE.modules,
    `{Restoration Project Record ID} != ''`,
  );
  for (const m of allModules) {
    try {
      await mirrorOperationStatus(m.id);
      report.staleStatusFixed++;
    } catch {
      // best-effort
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function composeServiceStatus(
  op: OperationStatus | string,
  est: EstimateStatus | string,
  pay: string,
): string {
  return `${op} · ${est} · ${pay}`;
}

async function refsForJobCosting(j: JobCostingRow): Promise<number> {
  const claim = j.fields.Claim?.[0];
  const cat = (j.fields["Trade Category"] as string) ?? "";
  if (!claim || !cat) return 0;
  const list = await listLedgerForCategories(claim, [cat]);
  return list.length;
}
