import { Router, type Request, type Response } from "express";

/* Settlement tables are deployed additively and generated DB types may land
 * independently, so this route intentionally uses the service client loosely. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabaseAdmin } from "../lib/supabase.js";
import {
  calculateSettlement,
  type CompensationType,
  type SettlementCalculationInput,
  type SettlementTerms,
} from "../lib/settlement-calculations.js";
import {
  buildSettlementSeedRows,
  type ExpenseSource,
  type PriorSettlementLine,
  type RevenueSource,
} from "../lib/settlement-snapshots.js";
import { buildThirdPartyObligations } from "../lib/settlement-obligations.js";

type AnyRow = Record<string, any>;
type JsonObject = Record<string, unknown>;

const db = supabaseAdmin as any;
const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPENSATION_TYPES = new Set(["Production Partner", "Commission Contractor", "Referral Only"]);
const COMMISSION_BASES = new Set([
  "Collected Revenue", "Revenue After Admin", "Net Split Pool", "Gross Profit Before Fees", "Fixed Amount",
]);
const REFERRAL_BASES = new Set([
  "Collected Revenue", "Revenue After Admin", "Net Split Pool", "Contractor Share", "Fixed Amount",
]);
const REFERRAL_PAYERS = new Set(["Company", "Contractor", "Split"]);
const MANUAL_LINE_TYPES = new Set(["Contractor Deduction", "Contractor Reimbursement", "Prior Advance"]);
const SETTLEMENT_TERM_KEYS = [
  "compensationType", "companyName", "contractorName", "referralName", "adminRatePercent",
  "adminFixedAmount", "contractorSplitPercent", "companySplitPercent", "commissionCalculationMode",
  "commissionBasis", "commissionRatePercent", "commissionFixedAmount", "referralApplicable",
  "referralBasis", "referralRatePercent", "referralFixedAmount", "referralPaidBy",
  "referralContractorSharePercent",
];

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function handler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const result = await fn(req, res);
      if (!res.headersSent) res.json(result);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      res.status(status).json({ error: error instanceof Error ? error.message : "Unexpected settlement error" });
    }
  };
}

function routeParam(value: string | string[]): string {
  return (Array.isArray(value) ? value[0] : value ?? "").trim();
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function requiredText(value: unknown, label: string): string {
  const result = text(value);
  if (!result) throw new HttpError(400, `${label} is required`);
  return result;
}

function amount(value: unknown, label: string): number {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result) || result < 0) throw new HttpError(400, `${label} must be a non-negative number`);
  return Math.round((result + Number.EPSILON) * 100) / 100;
}

function percent(value: unknown, label: string): number {
  const result = amount(value, label);
  if (result > 100) throw new HttpError(400, `${label} must be between 0 and 100`);
  return result;
}

function choice(value: unknown, choices: Set<string>, label: string): string {
  const result = requiredText(value, label);
  if (!choices.has(result)) throw new HttpError(400, `${label} is invalid`);
  return result;
}

function unwrap<T extends AnyRow>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (!result.data) throw new HttpError(404, `${label} was not found`);
  return result.data;
}

async function findClaim(claimRef: string): Promise<AnyRow> {
  const query = db.from("claims").select("*");
  const result = UUID.test(claimRef)
    ? await query.eq("id", claimRef).maybeSingle()
    : await query.eq("claim_id", claimRef).maybeSingle();
  return unwrap(result, "Claim");
}

function templatePayload(body: JsonObject) {
  const compensationType = choice(body.compensationType, COMPENSATION_TYPES, "Compensation type");
  const contractorSplit = percent(body.contractorSplitPercent ?? 50, "Contractor split");
  const companySplit = percent(body.companySplitPercent ?? 50, "Company split");
  if (compensationType === "Production Partner" && contractorSplit + companySplit !== 100) {
    throw new HttpError(400, "Contractor and company split percentages must total 100");
  }
  const referralPaidBy = choice(body.referralPaidBy ?? "Company", REFERRAL_PAYERS, "Referral paid by");
  const referralContractorShare = referralPaidBy === "Contractor"
    ? 100
    : referralPaidBy === "Company"
      ? 0
      : percent(body.referralContractorSharePercent ?? 50, "Contractor referral share");
  return {
    contractor_name: requiredText(body.contractorName, "Contractor name"),
    label: requiredText(body.label, "Template name"),
    compensation_type: compensationType,
    company_name: requiredText(body.companyName ?? "CBRS Group", "Company name"),
    admin_rate_percent: percent(body.adminRatePercent ?? 0, "Admin rate"),
    admin_fixed_amount: amount(body.adminFixedAmount ?? 0, "Fixed admin fee"),
    contractor_split_percent: contractorSplit,
    company_split_percent: companySplit,
    commission_calculation_mode: choice(body.commissionCalculationMode ?? "Percentage", new Set(["Percentage", "Flat"]), "Commission mode"),
    commission_basis: choice(body.commissionBasis ?? "Collected Revenue", COMMISSION_BASES, "Commission basis"),
    commission_rate_percent: percent(body.commissionRatePercent ?? 0, "Commission rate"),
    commission_fixed_amount: amount(body.commissionFixedAmount ?? 0, "Fixed commission"),
    referral_applicable: Boolean(body.referralApplicable) || compensationType === "Referral Only",
    referral_basis: choice(body.referralBasis ?? "Collected Revenue", REFERRAL_BASES, "Referral basis"),
    referral_rate_percent: percent(body.referralRatePercent ?? 0, "Referral rate"),
    referral_fixed_amount: amount(body.referralFixedAmount ?? 0, "Fixed referral"),
    referral_paid_by: referralPaidBy,
    referral_contractor_share_percent: referralContractorShare,
    active: body.active === undefined ? true : Boolean(body.active),
    notes: text(body.notes),
    updated_at: new Date().toISOString(),
  };
}

function mapTemplate(row: AnyRow) {
  return {
    id: row.id,
    contractorName: row.contractor_name,
    label: row.label,
    compensationType: row.compensation_type,
    companyName: row.company_name,
    adminRatePercent: Number(row.admin_rate_percent ?? 0),
    adminFixedAmount: Number(row.admin_fixed_amount ?? 0),
    contractorSplitPercent: Number(row.contractor_split_percent ?? 0),
    companySplitPercent: Number(row.company_split_percent ?? 0),
    commissionCalculationMode: row.commission_calculation_mode,
    commissionBasis: row.commission_basis,
    commissionRatePercent: Number(row.commission_rate_percent ?? 0),
    commissionFixedAmount: Number(row.commission_fixed_amount ?? 0),
    referralApplicable: Boolean(row.referral_applicable),
    referralBasis: row.referral_basis,
    referralRatePercent: Number(row.referral_rate_percent ?? 0),
    referralFixedAmount: Number(row.referral_fixed_amount ?? 0),
    referralPaidBy: row.referral_paid_by,
    referralContractorSharePercent: Number(row.referral_contractor_share_percent ?? 0),
    active: Boolean(row.active),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowTerms(row: AnyRow): SettlementTerms {
  return {
    compensationType: row.compensation_type,
    companyName: row.company_name,
    contractorName: row.contractor_name,
    referralName: row.referral_name,
    adminRatePercent: Number(row.admin_rate_percent ?? 0),
    adminFixedAmount: Number(row.admin_fixed_amount ?? 0),
    contractorSplitPercent: Number(row.contractor_split_percent ?? 0),
    companySplitPercent: Number(row.company_split_percent ?? 0),
    commissionCalculationMode: row.commission_calculation_mode,
    commissionBasis: row.commission_basis,
    commissionRatePercent: Number(row.commission_rate_percent ?? 0),
    commissionFixedAmount: Number(row.commission_fixed_amount ?? 0),
    referralApplicable: Boolean(row.referral_applicable),
    referralBasis: row.referral_basis,
    referralRatePercent: Number(row.referral_rate_percent ?? 0),
    referralFixedAmount: Number(row.referral_fixed_amount ?? 0),
    referralPaidBy: row.referral_paid_by,
    referralContractorSharePercent: Number(row.referral_contractor_share_percent ?? 0),
  } as SettlementTerms;
}

function termsColumns(terms: SettlementTerms) {
  return {
    compensation_type: terms.compensationType,
    company_name: terms.companyName,
    contractor_name: text(terms.contractorName),
    referral_name: text(terms.referralName),
    admin_rate_percent: percent(terms.adminRatePercent, "Admin rate"),
    admin_fixed_amount: amount(terms.adminFixedAmount, "Fixed admin fee"),
    contractor_split_percent: percent(terms.contractorSplitPercent, "Contractor split"),
    company_split_percent: percent(terms.companySplitPercent, "Company split"),
    commission_calculation_mode: terms.commissionCalculationMode,
    commission_basis: terms.commissionBasis,
    commission_rate_percent: percent(terms.commissionRatePercent, "Commission rate"),
    commission_fixed_amount: amount(terms.commissionFixedAmount, "Fixed commission"),
    referral_applicable: Boolean(terms.referralApplicable),
    referral_basis: terms.referralBasis,
    referral_rate_percent: percent(terms.referralRatePercent, "Referral rate"),
    referral_fixed_amount: amount(terms.referralFixedAmount, "Fixed referral"),
    referral_paid_by: terms.referralPaidBy,
    referral_contractor_share_percent: percent(terms.referralContractorSharePercent, "Contractor referral share"),
  };
}

function mapLine(row: AnyRow, lockedSourceIds: Set<string>) {
  const metadata = object(row.metadata);
  return {
    id: row.id,
    settlementId: row.settlement_id,
    lineType: row.line_type,
    sourceTable: row.source_table,
    sourceId: row.source_id,
    description: row.description,
    category: row.category,
    payerName: row.payer_name,
    payeeName: row.payee_name,
    amount: Number(row.amount ?? 0),
    included: Boolean(row.included),
    exclusionReason: row.exclusion_reason,
    sortOrder: Number(row.sort_order ?? 0),
    metadata,
    lockedByPriorSettlement: Boolean(row.included) && (
      Boolean(metadata.carriedFromSettlementId)
      || (row.source_id ? lockedSourceIds.has(row.source_id) : false)
    ),
  };
}

function mapSettlement(row: AnyRow) {
  return {
    id: row.id,
    claimId: row.claim_id,
    templateId: row.template_id,
    settlementNumber: row.settlement_number,
    status: row.status,
    asOfDate: row.as_of_date,
    ...rowTerms(row),
    notes: row.notes,
    finalizedAt: row.finalized_at,
    voidedAt: row.voided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function priorSettlementData(row: AnyRow) {
  const result = await db.from("claim_settlements").select("*")
    .eq("claim_id", row.claim_id).lt("settlement_number", row.settlement_number)
    .in("status", ["Finalized", "Paid"]).order("settlement_number");
  if (result.error) throw new Error(result.error.message);
  const prior = result.data ?? [];
  return {
    rows: prior,
    distributions: {
      contractor: prior.reduce((sum: number, item: AnyRow) => sum + Number(item.final_contractor_payment ?? 0), 0),
      company: prior.reduce((sum: number, item: AnyRow) => sum + Number(item.company_distribution ?? 0), 0),
      thirdParty: prior.reduce((sum: number, item: AnyRow) => sum + Number(item.third_party_payments ?? 0), 0),
    },
  };
}

async function unresolvedLegacyFees(claimId: string) {
  const result = await db.from("project_expenses").select("id, expense_name, expense_kind, billing_entity, amount, fee_state")
    .eq("claim_id", claimId).in("expense_kind", ["Commission", "Referral Fee"])
    .is("source_settlement_id", null).neq("fee_state", "Waived");
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []).map((row: AnyRow) => ({
    id: row.id,
    name: row.expense_name,
    expenseKind: row.expense_kind,
    payeeName: row.billing_entity,
    amount: Number(row.amount ?? 0),
    feeState: row.fee_state,
  }));
}

async function buildSettlementDetail(settlementId: string) {
  const settlement = unwrap(await db.from("claim_settlements").select("*").eq("id", settlementId).maybeSingle(), "Settlement");
  const [claimResult, linesResult, priorData, legacyFees] = await Promise.all([
    db.from("claims").select("id, claim_id, first_name, last_name, address, contractor, referral_name").eq("id", settlement.claim_id).maybeSingle(),
    db.from("claim_settlement_lines").select("*").eq("settlement_id", settlement.id).order("sort_order").order("created_at"),
    priorSettlementData(settlement),
    unresolvedLegacyFees(settlement.claim_id),
  ]);
  if (linesResult.error) throw new Error(linesResult.error.message);
  const claim = unwrap(claimResult, "Claim");
  const priorIds = priorData.rows.map((row: AnyRow) => row.id);
  let priorSourceRows: AnyRow[] = [];
  if (priorIds.length > 0) {
    const sourceResult = await db.from("claim_settlement_lines").select("source_id")
      .in("settlement_id", priorIds).eq("included", true).not("source_id", "is", null);
    if (sourceResult.error) throw new Error(sourceResult.error.message);
    priorSourceRows = sourceResult.data ?? [];
  }
  const lockedSourceIds = new Set(priorSourceRows.map((item: AnyRow) => item.source_id));
  const lines = (linesResult.data ?? []).map((line: AnyRow) => mapLine(line, lockedSourceIds));
  const deductions = lines.filter((line: AnyRow) => line.lineType === "Contractor Deduction").map((line: AnyRow) => ({
    ...line,
    payeeRole: line.metadata.payeeRole === "Third Party" ? "Third Party" : "Company",
  }));
  const calculationInput: SettlementCalculationInput = {
    terms: rowTerms(settlement),
    revenue: lines.filter((line: AnyRow) => line.lineType === "Revenue"),
    companyExpenses: lines.filter((line: AnyRow) => line.lineType === "Company Expense"),
    contractorDeductions: deductions,
    contractorReimbursements: lines.filter((line: AnyRow) => line.lineType === "Contractor Reimbursement"),
    priorAdvances: lines.filter((line: AnyRow) => line.lineType === "Prior Advance"),
    priorDistributions: priorData.distributions,
  };
  const calculated = calculateSettlement(calculationInput);
  const companyName = String(settlement.company_name ?? "").trim().toLocaleLowerCase();
  const validationErrors = [
    ...lines.filter((line: AnyRow) => line.included && line.lineType === "Company Expense"
      && String(line.payerName ?? "").trim().toLocaleLowerCase() !== companyName)
      .map((line: AnyRow) => `${line.description} is not documented as paid or advanced by ${settlement.company_name}`),
    ...deductions.filter((line: AnyRow) => line.included && line.payeeRole === "Third Party" && !String(line.payeeName ?? "").trim())
      .map((line: AnyRow) => `Third-party recipient is required for deduction: ${line.description}`),
    ...(legacyFees.length > 0 ? ["Resolve or waive existing manual commission/referral obligations before finalizing"] : []),
  ];
  const calculation = validationErrors.length === 0 ? calculated : {
    ...calculated,
    errors: [...calculated.errors, ...validationErrors],
    validForFinalization: false,
  };
  return {
    settlement: mapSettlement(settlement),
    claim: {
      id: claim.id,
      claimCode: claim.claim_id,
      customerName: [claim.first_name, claim.last_name].filter(Boolean).join(" "),
      address: claim.address,
      contractor: claim.contractor,
      referralName: claim.referral_name,
    },
    lines,
    calculation,
    priorSettlements: priorData.rows.map(mapSettlement),
    legacyFeeConflicts: legacyFees,
  };
}

async function defaultSettlementTerms(claim: AnyRow, requestedTemplateId?: string | null) {
  const previousResult = await db.from("claim_settlements").select("*")
    .eq("claim_id", claim.id).in("status", ["Finalized", "Paid"]).order("settlement_number", { ascending: false }).limit(1).maybeSingle();
  if (previousResult.error) throw new Error(previousResult.error.message);
  if (previousResult.data) return { templateId: previousResult.data.template_id, terms: rowTerms(previousResult.data) };

  let template: AnyRow | null = null;
  if (requestedTemplateId) {
    template = unwrap(await db.from("contractor_settlement_templates").select("*")
      .eq("id", requestedTemplateId).eq("active", true).maybeSingle(), "Settlement template");
  } else if (text(claim.contractor)) {
    const result = await db.from("contractor_settlement_templates").select("*")
      .ilike("contractor_name", text(claim.contractor)).eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    template = result.data;
  }
  if (template) {
    return {
      templateId: template.id,
      terms: {
        ...rowTerms(template),
        contractorName: text(claim.contractor) ?? template.contractor_name,
        referralName: text(claim.referral_name),
      },
    };
  }
  return {
    templateId: null,
    terms: {
      compensationType: "Production Partner" as CompensationType,
      companyName: "CBRS Group",
      contractorName: text(claim.contractor),
      referralName: text(claim.referral_name),
      adminRatePercent: 0,
      adminFixedAmount: 0,
      contractorSplitPercent: 50,
      companySplitPercent: 50,
      commissionCalculationMode: "Percentage" as const,
      commissionBasis: "Collected Revenue" as const,
      commissionRatePercent: 0,
      commissionFixedAmount: 0,
      referralApplicable: false,
      referralBasis: "Collected Revenue" as const,
      referralRatePercent: 0,
      referralFixedAmount: 0,
      referralPaidBy: "Company" as const,
      referralContractorSharePercent: 0,
    },
  };
}

async function seedSettlementLines(claim: AnyRow, settlementId: string, companyName: string) {
  const priorSettlementsResult = await db.from("claim_settlements").select("id")
    .eq("claim_id", claim.id).in("status", ["Finalized", "Paid"])
    .order("settlement_number", { ascending: false }).limit(1).maybeSingle();
  if (priorSettlementsResult.error) throw new Error(priorSettlementsResult.error.message);
  let priorLines: PriorSettlementLine[] = [];
  if (priorSettlementsResult.data) {
    const priorLinesResult = await db.from("claim_settlement_lines").select("*")
      .eq("settlement_id", priorSettlementsResult.data.id).order("sort_order").order("created_at");
    if (priorLinesResult.error) throw new Error(priorLinesResult.error.message);
    priorLines = (priorLinesResult.data ?? []) as PriorSettlementLine[];
  }
  const [ledgerResult, expensesResult] = await Promise.all([
    db.from("financial_ledger").select("*").eq("claim_id", claim.id).eq("direction", "Inflow").order("date"),
    db.from("project_expenses").select("*").eq("claim_id", claim.id)
      .not("expense_kind", "in", "(Commission,Referral Fee,Contractor Settlement)").order("date"),
  ]);
  if (ledgerResult.error ?? expensesResult.error) throw new Error((ledgerResult.error ?? expensesResult.error).message);
  const rows = buildSettlementSeedRows({
    settlementId,
    companyName,
    contractorName: text(claim.contractor),
    priorLines,
    revenueSources: (ledgerResult.data ?? []) as RevenueSource[],
    expenseSources: (expensesResult.data ?? []) as ExpenseSource[],
  });
  if (rows.length === 0) return;
  const insert = await db.from("claim_settlement_lines").insert(rows);
  if (insert.error) throw new Error(insert.error.message);
}

router.get("/settlement-templates", handler(async () => {
  const result = await db.from("contractor_settlement_templates").select("*").order("contractor_name").order("created_at");
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []).map(mapTemplate);
}));

router.post("/settlement-templates", handler(async (req) => {
  const result = await db.from("contractor_settlement_templates").insert(templatePayload(object(req.body))).select().single();
  return mapTemplate(unwrap(result, "Settlement template"));
}));

router.patch("/settlement-templates/:id", handler(async (req) => {
  const result = await db.from("contractor_settlement_templates").update(templatePayload(object(req.body)))
    .eq("id", routeParam(req.params.id)).select().maybeSingle();
  return mapTemplate(unwrap(result, "Settlement template"));
}));

router.delete("/settlement-templates/:id", handler(async (req) => {
  const result = await db.from("contractor_settlement_templates").update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", routeParam(req.params.id)).select("id").maybeSingle();
  return { ok: true, id: unwrap(result, "Settlement template").id };
}));

router.get("/claims/:claimRef/settlements", handler(async (req) => {
  const claim = await findClaim(routeParam(req.params.claimRef));
  const result = await db.from("claim_settlements").select("*").eq("claim_id", claim.id).order("settlement_number", { ascending: false });
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []).map(mapSettlement);
}));

router.post("/claims/:claimRef/settlements", handler(async (req) => {
  const claim = await findClaim(routeParam(req.params.claimRef));
  const existingResult = await db.from("claim_settlements").select("id").eq("claim_id", claim.id).eq("status", "Draft").maybeSingle();
  if (existingResult.error) throw new Error(existingResult.error.message);
  if (existingResult.data) return buildSettlementDetail(existingResult.data.id);

  const lastResult = await db.from("claim_settlements").select("settlement_number").eq("claim_id", claim.id)
    .order("settlement_number", { ascending: false }).limit(1).maybeSingle();
  if (lastResult.error) throw new Error(lastResult.error.message);
  const defaults = await defaultSettlementTerms(claim, text(req.body?.templateId));
  const insert = await db.from("claim_settlements").insert({
    claim_id: claim.id,
    template_id: defaults.templateId,
    settlement_number: Number(lastResult.data?.settlement_number ?? 0) + 1,
    status: "Draft",
    as_of_date: text(req.body?.asOfDate) ?? new Date().toISOString().slice(0, 10),
    ...termsColumns(defaults.terms),
    terms_snapshot: defaults.terms,
  }).select("id").single();
  if (insert.error?.code === "23505") {
    const concurrent = await db.from("claim_settlements").select("id")
      .eq("claim_id", claim.id).eq("status", "Draft").maybeSingle();
    if (!concurrent.error && concurrent.data) return buildSettlementDetail(concurrent.data.id);
  }
  const settlement = unwrap(insert, "Settlement draft");
  await seedSettlementLines(claim, settlement.id, defaults.terms.companyName);
  return buildSettlementDetail(settlement.id);
}));

router.get("/settlements/:id", handler(async (req) => buildSettlementDetail(routeParam(req.params.id))));

router.patch("/settlements/:id", handler(async (req) => {
  const id = routeParam(req.params.id);
  const current = unwrap(await db.from("claim_settlements").select("*").eq("id", id).maybeSingle(), "Settlement");
  if (current.status !== "Draft") throw new HttpError(409, "Finalized settlements are immutable");
  const body = object(req.body);
  const prior = await priorSettlementData(current);
  const termChanges = SETTLEMENT_TERM_KEYS.some((key) => body[key] !== undefined);
  if (prior.rows.length > 0 && termChanges) throw new HttpError(409, "Settlement terms are locked after the first finalized settlement");

  const update: AnyRow = {
    as_of_date: body.asOfDate === undefined ? current.as_of_date : requiredText(body.asOfDate, "As-of date"),
    notes: body.notes === undefined ? current.notes : text(body.notes),
    updated_at: new Date().toISOString(),
  };
  if (termChanges) {
    const terms: SettlementTerms = {
      ...rowTerms(current),
      ...Object.fromEntries(SETTLEMENT_TERM_KEYS.filter((key) => body[key] !== undefined).map((key) => [key, body[key]])),
    } as SettlementTerms;
    if (!COMPENSATION_TYPES.has(terms.compensationType)) throw new HttpError(400, "Compensation type is invalid");
    if (!COMMISSION_BASES.has(terms.commissionBasis)) throw new HttpError(400, "Commission basis is invalid");
    if (!REFERRAL_BASES.has(terms.referralBasis)) throw new HttpError(400, "Referral basis is invalid");
    if (!REFERRAL_PAYERS.has(terms.referralPaidBy)) throw new HttpError(400, "Referral paid by is invalid");
    Object.assign(update, termsColumns(terms), { terms_snapshot: terms });
  }
  const updateResult = await db.from("claim_settlements").update(update).eq("id", id).eq("status", "Draft").select("id").maybeSingle();
  unwrap(updateResult, "Settlement draft");

  const requestedLines = Array.isArray(body.lines) ? body.lines.map(object) : [];
  for (const requested of requestedLines) {
    const lineId = requiredText(requested.id, "Settlement line ID");
    const line = unwrap(await db.from("claim_settlement_lines").select("*").eq("id", lineId).eq("settlement_id", id).maybeSingle(), "Settlement line");
    const priorSourceIds = new Set<string>();
    if (prior.rows.length > 0 && line.source_id) {
      const priorLineResult = await db.from("claim_settlement_lines").select("id").in("settlement_id", prior.rows.map((row: AnyRow) => row.id))
        .eq("source_id", line.source_id).eq("included", true).limit(1);
      if (priorLineResult.error) throw new Error(priorLineResult.error.message);
      if ((priorLineResult.data ?? []).length > 0) priorSourceIds.add(line.source_id);
    }
    const carriedAndIncluded = Boolean(line.included && object(line.metadata).carriedFromSettlementId);
    if (carriedAndIncluded || (line.source_id && priorSourceIds.has(line.source_id))) {
      throw new HttpError(409, "Lines included in cumulative settlement history are immutable");
    }
    const included = requested.included === undefined ? line.included : Boolean(requested.included);
    const exclusionReason = included ? null : requiredText(requested.exclusionReason ?? line.exclusion_reason, "Exclusion reason");
    if (requested.lineType !== undefined && requested.lineType !== line.line_type) {
      throw new HttpError(409, "Settlement line types cannot be changed after creation");
    }
    const lineUpdate = {
      line_type: line.line_type,
      amount: requested.amount === undefined ? line.amount : amount(requested.amount, "Line amount"),
      included,
      exclusion_reason: exclusionReason,
      payer_name: requested.payerName === undefined ? line.payer_name : text(requested.payerName),
      payee_name: requested.payeeName === undefined ? line.payee_name : text(requested.payeeName),
      metadata: requested.metadata === undefined ? line.metadata : object(requested.metadata),
      updated_at: new Date().toISOString(),
    };
    const lineResult = await db.from("claim_settlement_lines").update(lineUpdate).eq("id", lineId).eq("settlement_id", id).select("id").maybeSingle();
    unwrap(lineResult, "Settlement line");
  }
  return buildSettlementDetail(id);
}));

router.post("/settlements/:id/lines", handler(async (req) => {
  const id = routeParam(req.params.id);
  const current = unwrap(await db.from("claim_settlements").select("id, status").eq("id", id).maybeSingle(), "Settlement");
  if (current.status !== "Draft") throw new HttpError(409, "Finalized settlements are immutable");
  const body = object(req.body);
  const included = body.included === undefined ? true : Boolean(body.included);
  const insert = await db.from("claim_settlement_lines").insert({
    settlement_id: id,
    line_type: choice(body.lineType, MANUAL_LINE_TYPES, "Line type"),
    description: requiredText(body.description, "Description"),
    category: text(body.category),
    payer_name: text(body.payerName),
    payee_name: text(body.payeeName),
    amount: amount(body.amount, "Line amount"),
    included,
    exclusion_reason: included ? null : requiredText(body.exclusionReason, "Exclusion reason"),
    metadata: object(body.metadata),
  }).select("id").single();
  unwrap(insert, "Settlement line");
  return buildSettlementDetail(id);
}));

router.delete("/settlement-lines/:id", handler(async (req) => {
  const id = routeParam(req.params.id);
  const line = unwrap(await db.from("claim_settlement_lines").select("settlement_id, source_id, included, metadata").eq("id", id).maybeSingle(), "Settlement line");
  const settlement = unwrap(await db.from("claim_settlements").select("status").eq("id", line.settlement_id).maybeSingle(), "Settlement");
  if (settlement.status !== "Draft") throw new HttpError(409, "Finalized settlements are immutable");
  if (line.source_id) throw new HttpError(409, "Sourced settlement lines may be excluded but not deleted");
  if (line.included && object(line.metadata).carriedFromSettlementId) {
    throw new HttpError(409, "Lines included in cumulative settlement history are immutable");
  }
  const deleted = await db.from("claim_settlement_lines").delete().eq("id", id).select("id").maybeSingle();
  unwrap(deleted, "Settlement line");
  return buildSettlementDetail(line.settlement_id);
}));

router.delete("/settlements/:id", handler(async (req) => {
  const id = routeParam(req.params.id);
  const current = unwrap(await db.from("claim_settlements").select("status").eq("id", id).maybeSingle(), "Settlement");
  if (current.status !== "Draft") throw new HttpError(409, "Only draft settlements can be deleted");
  const deleted = await db.from("claim_settlements").delete().eq("id", id).eq("status", "Draft").select("id").maybeSingle();
  unwrap(deleted, "Settlement draft");
  return { ok: true, id };
}));

router.post("/settlements/:id/finalize", handler(async (req) => {
  const id = routeParam(req.params.id);
  const current = unwrap(await db.from("claim_settlements").select("*").eq("id", id).maybeSingle(), "Settlement");
  if (current.status !== "Draft") return buildSettlementDetail(id);
  const detail = await buildSettlementDetail(id);
  if (!detail.calculation.validForFinalization) {
    throw new HttpError(409, detail.calculation.errors.join("; "));
  }
  const obligations: AnyRow[] = [];
  if (detail.calculation.finalContractorPayment > 0) {
    obligations.push({
      expense_name: `Settlement #${detail.settlement.settlementNumber} · ${detail.settlement.contractorName}`,
      category: "Contractor Settlement",
      expense_kind: "Contractor Settlement",
      payer_name: detail.settlement.companyName,
      billing_entity: detail.settlement.contractorName,
      amount: detail.calculation.finalContractorPayment,
      date: detail.settlement.asOfDate,
      basis_amount: detail.calculation.cumulativeContractorEntitlement,
      notes: `Locked contractor payment from finalized settlement #${detail.settlement.settlementNumber}`,
    });
  }
  const priorThirdPartyResult = await db.from("project_expenses").select("billing_entity, amount")
    .eq("claim_id", current.claim_id).eq("expense_kind", "Referral Fee").not("source_settlement_id", "is", null);
  if (priorThirdPartyResult.error) throw new Error(priorThirdPartyResult.error.message);
  const thirdParty = buildThirdPartyObligations({
    settlementNumber: detail.settlement.settlementNumber,
    asOfDate: detail.settlement.asOfDate,
    companyName: detail.settlement.companyName,
    contractorName: detail.settlement.contractorName,
    referralName: detail.settlement.referralName,
    referralPaidBy: detail.settlement.referralPaidBy,
    referralCommission: detail.calculation.referralCommission,
    deductions: detail.lines
      .filter((line: AnyRow) => line.lineType === "Contractor Deduction")
      .map((line: AnyRow) => ({
        amount: line.amount,
        included: line.included,
        description: line.description,
        payerName: line.payerName,
        payeeName: line.payeeName,
        payeeRole: line.metadata.payeeRole === "Third Party" ? "Third Party" as const : "Company" as const,
      })),
    priorObligations: (priorThirdPartyResult.data ?? []).map((row: AnyRow) => ({ payeeName: row.billing_entity, amount: Number(row.amount ?? 0) })),
    expectedCurrentTotal: detail.calculation.thirdPartyPayments,
  });
  if (thirdParty.errors.length > 0) throw new HttpError(409, thirdParty.errors.join("; "));
  obligations.push(...thirdParty.obligations);
  const finalized = await db.rpc("finalize_claim_settlement", {
    p_settlement_id: id,
    p_terms_snapshot: detail.settlement,
    p_calculation_snapshot: detail.calculation,
    p_obligations: obligations,
  });
  if (finalized.error) throw new Error(finalized.error.message);
  return buildSettlementDetail(id);
}));

router.post("/settlements/:id/void", handler(async (req) => {
  const id = routeParam(req.params.id);
  const current = unwrap(await db.from("claim_settlements").select("*").eq("id", id).maybeSingle(), "Settlement");
  if (current.status === "Void") return buildSettlementDetail(id);
  if (current.status === "Draft") throw new HttpError(409, "Delete or continue editing the draft instead of voiding it");
  const result = await db.rpc("void_claim_settlement", { p_settlement_id: id });
  if (result.error) throw new HttpError(409, result.error.message);
  return buildSettlementDetail(id);
}));

export async function refreshSettlementPaymentStatus(settlementId: string | null | undefined) {
  if (!settlementId) return;
  const settlementResult = await db.from("claim_settlements").select("id, status").eq("id", settlementId).maybeSingle();
  if (settlementResult.error || !settlementResult.data || settlementResult.data.status === "Void") return;
  const expensesResult = await db.from("project_expenses").select("id, amount").eq("source_settlement_id", settlementId);
  if (expensesResult.error) throw new Error(expensesResult.error.message);
  const expenses = expensesResult.data ?? [];
  if (expenses.length === 0) return;
  const paymentsResult = await db.from("cost_payments").select("project_expense_id, amount").in("project_expense_id", expenses.map((row: AnyRow) => row.id));
  if (paymentsResult.error) throw new Error(paymentsResult.error.message);
  const paid = new Map<string, number>();
  for (const payment of paymentsResult.data ?? []) {
    paid.set(payment.project_expense_id, (paid.get(payment.project_expense_id) ?? 0) + Number(payment.amount ?? 0));
  }
  const complete = expenses.every((expense: AnyRow) => (paid.get(expense.id) ?? 0) >= Number(expense.amount ?? 0));
  const nextStatus = complete ? "Paid" : "Finalized";
  await db.from("claim_settlements").update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", settlementId).in("status", ["Finalized", "Paid"]);
}

export { router as settlementRouter };
