import { Router, type Request, type Response } from "express";

/* The Supabase client is intentionally loosened in this route module because
 * live generated types and the additive migration are deployed separately. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabaseAdmin } from "../lib/supabase.js";
import {
  calculateFinancialPlan,
  feeBasisAmount,
  feePreviewAmount,
  isFeeKind,
  money,
} from "../lib/financial-calculations.js";

type JsonObject = Record<string, unknown>;
type AnyRow = Record<string, any>;

const db = supabaseAdmin as any;
const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUDGET_CATEGORIES = new Set(["Labor", "Materials", "Subcontractors", "Other"]);
const EXPENSE_KINDS = new Set([
  "Labor", "Materials", "Subcontractor", "General", "Commission", "Referral Fee", "Other",
]);
const CALCULATION_MODES = new Set(["Percentage", "Flat", "Manual"]);
const CALCULATION_BASES = new Set([
  "Approved Revenue", "Collected Revenue", "Gross Profit Before Fees",
]);
const PARTY_ROLES = new Set(["CBRS Group", "Contractor", "Referral", "Fixed"]);

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function routeParam(value: string | string[]): string {
  return (Array.isArray(value) ? value[0] : value ?? "").trim();
}

function handler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const result = await fn(req, res);
      if (!res.headersSent) res.json(result);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Unexpected financial-planning error";
      res.status(status).json({ error: message });
    }
  };
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

function nonnegative(value: unknown, label: string): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) {
    throw new HttpError(400, `${label} must be a non-negative number`);
  }
  return money(result);
}

function percentage(value: unknown): number {
  const result = nonnegative(value, "Rate");
  if (result > 100) throw new HttpError(400, "Rate must be between 0 and 100");
  return result;
}

function oneOf(value: unknown, allowed: Set<string>, label: string): string {
  const result = requiredText(value, label);
  if (!allowed.has(result)) throw new HttpError(400, `${label} is invalid`);
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

async function assertModule(claimId: string, moduleId: unknown): Promise<string | null> {
  const id = text(moduleId);
  if (!id) return null;
  const result = await db.from("modules").select("id").eq("id", id).eq("claim_id", claimId).maybeSingle();
  unwrap(result, "Service");
  return id;
}

function mapBudget(row: AnyRow) {
  return {
    id: row.id,
    claimId: row.claim_id,
    moduleId: row.module_id,
    category: row.category,
    description: row.description,
    budgetAmount: money(row.budget_amount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPayment(row: AnyRow) {
  return {
    id: row.id,
    claimId: row.claim_id,
    projectExpenseId: row.project_expense_id,
    paymentName: row.payment_name,
    amount: money(row.amount),
    paymentDate: row.date,
    method: row.payment_method,
    checkNumber: row.check_number,
    notes: row.notes,
  };
}

function mapTemplate(row: AnyRow) {
  return {
    id: row.id,
    contractorName: row.contractor_name,
    label: row.label,
    feeType: row.fee_type,
    payerRole: row.payer_role,
    payeeRole: row.payee_role,
    fixedPayerName: row.fixed_payer_name,
    fixedPayeeName: row.fixed_payee_name,
    calculationMode: row.calculation_mode,
    calculationBasis: row.calculation_basis,
    ratePercent: row.rate_percent == null ? null : money(row.rate_percent),
    defaultAmount: row.default_amount == null ? null : money(row.default_amount),
    active: row.active,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolveParty(role: string, fixed: string | null, claim: AnyRow): string | null {
  if (role === "CBRS Group") return "CBRS Group";
  if (role === "Contractor") return text(claim.contractor);
  if (role === "Referral") return text(claim.referral_name);
  return fixed;
}

function expenseCategory(kind: string): string {
  return {
    Labor: "Labor Cost",
    Materials: "Materials",
    Subcontractor: "Third party contractors",
    General: "General Expenses and Outflows",
    Other: "Others",
  }[kind] ?? kind;
}

function calculationInput(
  claim: AnyRow,
  jobs: AnyRow[],
  budgets: AnyRow[],
  ledger: AnyRow[],
  expenses: AnyRow[],
  payments: AnyRow[],
) {
  return {
    claim: { totalApprovedBudget: claim.total_approved_budget, rcv: claim.rcv },
    services: jobs.map((row) => ({
      approvedEstimateAmount: row.approved_estimate_amount,
      hasSupplement: row.has_supplement,
      supplementApprovedAmount: row.supplement_approved_amount,
    })),
    budgets: budgets.map((row) => ({ budgetAmount: row.budget_amount })),
    ledger: ledger.map((row) => ({
      amount: row.amount,
      direction: row.direction,
      fieldsRaw: row.fields_raw,
    })),
    expenses: expenses.map((row) => ({
      id: row.id,
      amount: row.amount,
      expenseKind: row.expense_kind,
      calculationMode: row.calculation_mode,
      calculationBasis: row.calculation_basis,
      ratePercent: row.rate_percent,
      basisAmount: row.basis_amount,
      feeState: row.fee_state,
    })),
    payments: payments.map((row) => ({
      projectExpenseId: row.project_expense_id,
      amount: row.amount,
    })),
  };
}

async function buildPlan(claimRef: string) {
  const claim = await findClaim(claimRef);
  const [modulesResult, jobsResult, budgetsResult, ledgerResult, expensesResult, paymentsResult] = await Promise.all([
    db.from("modules").select("*").eq("claim_id", claim.id).order("created_at"),
    db.from("job_costing").select("*").eq("claim_id", claim.id),
    db.from("cost_budget_lines").select("*").eq("claim_id", claim.id).order("created_at"),
    db.from("financial_ledger").select("*").eq("claim_id", claim.id),
    db.from("project_expenses").select("*").eq("claim_id", claim.id).order("created_at"),
    db.from("cost_payments").select("*").eq("claim_id", claim.id).order("date"),
  ]);
  const failure = [modulesResult, jobsResult, budgetsResult, ledgerResult, expensesResult, paymentsResult]
    .find((result) => result.error)?.error;
  if (failure) throw new Error(failure.message);

  const modules = modulesResult.data ?? [];
  const jobs = jobsResult.data ?? [];
  const budgets = budgetsResult.data ?? [];
  const ledger = ledgerResult.data ?? [];
  const expenses = expensesResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const calculation = calculateFinancialPlan(calculationInput(claim, jobs, budgets, ledger, expenses, payments));
  const moduleName = new Map(modules.map((row: AnyRow) => [row.id, row.module_type ?? row.module_name ?? "Service"]));
  const mappedExpenses = expenses.map((row: AnyRow) => ({
    id: row.id,
    claimId: row.claim_id,
    moduleId: row.module_id,
    moduleName: row.module_id ? moduleName.get(row.module_id) ?? "Service" : null,
    name: row.expense_name,
    expenseKind: row.expense_kind,
    payerName: row.payer_name,
    payeeName: row.billing_entity ?? row.vendor,
    amount: money(row.amount),
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date ?? row.date,
    dueDate: row.due_date,
    scopeNotes: row.scope_notes ?? row.notes,
    calculationMode: row.calculation_mode,
    calculationBasis: row.calculation_basis,
    ratePercent: row.rate_percent == null ? null : money(row.rate_percent),
    basisAmount: row.basis_amount == null ? null : money(row.basis_amount),
    feeState: row.fee_state,
    lockedAt: row.locked_at,
    sourceTemplateId: row.source_template_id,
    sourceContractorName: row.source_contractor_name,
    ...calculation.expenses[row.id],
  }));

  let availableTemplates: ReturnType<typeof mapTemplate>[] = [];
  if (text(claim.contractor)) {
    const result = await db.from("contractor_fee_templates")
      .select("*")
      .ilike("contractor_name", text(claim.contractor))
      .eq("active", true)
      .order("created_at");
    if (result.error) throw new Error(result.error.message);
    availableTemplates = (result.data ?? []).map(mapTemplate);
  }
  const appliedIds = new Set(expenses.map((row: AnyRow) => row.source_template_id).filter(Boolean));

  return {
    claim: {
      id: claim.id,
      claimCode: claim.claim_id,
      customerName: [claim.first_name, claim.last_name].filter(Boolean).join(" "),
      contractor: claim.contractor,
      referralName: claim.referral_name,
      rcv: money(claim.rcv),
      totalApprovedBudget: money(claim.total_approved_budget),
    },
    modules: modules.map((row: AnyRow) => ({
      id: row.id,
      name: row.module_type ?? row.module_name ?? "Service",
      archivedAt: row.archived_at,
    })),
    budgets: budgets.map(mapBudget),
    expenses: mappedExpenses,
    payments: payments.map(mapPayment),
    metrics: calculation.metrics,
    availableTemplates: availableTemplates.map((template) => ({
      ...template,
      alreadyApplied: appliedIds.has(template.id),
    })),
    contractorDefaultsOutdated: mappedExpenses.some((row: AnyRow) =>
      row.sourceContractorName && row.sourceContractorName.toLowerCase() !== String(claim.contractor ?? "").toLowerCase(),
    ),
  };
}

function templatePayload(body: JsonObject) {
  const contractorName = requiredText(body.contractorName, "Contractor name");
  const label = requiredText(body.label, "Rule name");
  const feeType = oneOf(body.feeType, new Set(["Commission", "Referral Fee"]), "Fee type");
  const payerRole = oneOf(body.payerRole, PARTY_ROLES, "Payer role");
  const payeeRole = oneOf(body.payeeRole, PARTY_ROLES, "Payee role");
  const calculationMode = oneOf(body.calculationMode, CALCULATION_MODES, "Calculation mode");
  const calculationBasis = calculationMode === "Percentage"
    ? oneOf(body.calculationBasis, CALCULATION_BASES, "Calculation basis")
    : null;
  const ratePercent = calculationMode === "Percentage" ? percentage(body.ratePercent) : null;
  const defaultAmount = calculationMode === "Percentage" ? null : nonnegative(body.defaultAmount, "Default amount");
  const fixedPayerName = payerRole === "Fixed" ? requiredText(body.fixedPayerName, "Fixed payer") : null;
  const fixedPayeeName = payeeRole === "Fixed" ? requiredText(body.fixedPayeeName, "Fixed payee") : null;
  return {
    contractor_name: contractorName,
    label,
    fee_type: feeType,
    payer_role: payerRole,
    payee_role: payeeRole,
    fixed_payer_name: fixedPayerName,
    fixed_payee_name: fixedPayeeName,
    calculation_mode: calculationMode,
    calculation_basis: calculationBasis,
    rate_percent: ratePercent,
    default_amount: defaultAmount,
    active: body.active === undefined ? true : Boolean(body.active),
    notes: text(body.notes),
    updated_at: new Date().toISOString(),
  };
}

router.get("/claims/:claimRef", handler(async (req) => buildPlan(routeParam(req.params.claimRef))));

router.get("/templates", handler(async () => {
  const result = await db.from("contractor_fee_templates").select("*").order("contractor_name").order("created_at");
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []).map(mapTemplate);
}));

router.post("/templates", handler(async (req) => {
  const result = await db.from("contractor_fee_templates").insert(templatePayload(object(req.body))).select().single();
  return mapTemplate(unwrap(result, "Contractor fee template"));
}));

router.patch("/templates/:id", handler(async (req) => {
  const result = await db.from("contractor_fee_templates")
    .update(templatePayload(object(req.body)))
    .eq("id", routeParam(req.params.id)).select().maybeSingle();
  return mapTemplate(unwrap(result, "Contractor fee template"));
}));

router.delete("/templates/:id", handler(async (req) => {
  const result = await db.from("contractor_fee_templates")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", routeParam(req.params.id)).select("id").maybeSingle();
  return { ok: true, id: unwrap(result, "Contractor fee template").id };
}));

router.post("/claims/:claimRef/apply-template", handler(async (req) => {
  const claim = await findClaim(routeParam(req.params.claimRef));
  const contractor = text(claim.contractor);
  if (!contractor) throw new HttpError(400, "This claim does not have a contractor");
  const requestedIds = Array.isArray(req.body?.templateIds)
    ? new Set(req.body.templateIds.map(String))
    : null;
  const [templatesResult, existingResult] = await Promise.all([
    db.from("contractor_fee_templates").select("*").ilike("contractor_name", contractor).eq("active", true),
    db.from("project_expenses").select("source_template_id").eq("claim_id", claim.id).not("source_template_id", "is", null),
  ]);
  if (templatesResult.error ?? existingResult.error) {
    throw new Error((templatesResult.error ?? existingResult.error).message);
  }
  const existing = new Set((existingResult.data ?? []).map((row: AnyRow) => row.source_template_id));
  const plan = await buildPlan(claim.id);
  const inserts: AnyRow[] = [];
  const skipped: Array<{ templateId: string; reason: string }> = [];
  for (const template of templatesResult.data ?? []) {
    if (requestedIds && !requestedIds.has(template.id)) continue;
    if (existing.has(template.id)) {
      skipped.push({ templateId: template.id, reason: "Already applied" });
      continue;
    }
    const payer = resolveParty(template.payer_role, template.fixed_payer_name, claim);
    const payee = resolveParty(template.payee_role, template.fixed_payee_name, claim);
    if (!payer || !payee) {
      skipped.push({ templateId: template.id, reason: "Payer or payee is missing on the claim" });
      continue;
    }
    const source = {
      id: template.id,
      amount: template.default_amount,
      expenseKind: template.fee_type,
      calculationMode: template.calculation_mode,
      calculationBasis: template.calculation_basis,
      ratePercent: template.rate_percent,
      feeState: "Projected",
    };
    const amount = feePreviewAmount(source, plan.metrics);
    const basisAmount = template.calculation_mode === "Percentage"
      ? feeBasisAmount(template.calculation_basis, plan.metrics)
      : null;
    inserts.push({
      claim_id: claim.id,
      module_id: null,
      expense_name: template.label,
      category: template.fee_type,
      expense_kind: template.fee_type,
      payer_name: payer,
      billing_entity: payee,
      vendor: payee,
      amount,
      date: new Date().toISOString().slice(0, 10),
      calculation_mode: template.calculation_mode,
      calculation_basis: template.calculation_basis,
      rate_percent: template.rate_percent,
      basis_amount: basisAmount,
      fee_state: "Projected",
      source_template_id: template.id,
      source_contractor_name: contractor,
      fields_raw: { "Billing Entity": payee, "Expense Kind": template.fee_type },
    });
  }
  if (inserts.length > 0) {
    const result = await db.from("project_expenses").insert(inserts);
    if (result.error) {
      if (result.error.code === "23505") throw new HttpError(409, "One or more contractor defaults were already applied");
      throw new Error(result.error.message);
    }
  }
  return { applied: inserts.length, skipped, plan: await buildPlan(claim.id) };
}));

router.post("/claims/:claimRef/budgets", handler(async (req) => {
  const claim = await findClaim(routeParam(req.params.claimRef));
  const body = object(req.body);
  const moduleId = await assertModule(claim.id, body.moduleId);
  const result = await db.from("cost_budget_lines").insert({
    claim_id: claim.id,
    module_id: moduleId,
    category: oneOf(body.category, BUDGET_CATEGORIES, "Budget category"),
    description: text(body.description),
    budget_amount: nonnegative(body.budgetAmount, "Budget amount"),
  }).select().single();
  return mapBudget(unwrap(result, "Budget line"));
}));

router.patch("/budgets/:id", handler(async (req) => {
  const body = object(req.body);
  const current = unwrap(await db.from("cost_budget_lines").select("*").eq("id", routeParam(req.params.id)).maybeSingle(), "Budget line");
  const moduleId = body.moduleId === undefined ? current.module_id : await assertModule(current.claim_id, body.moduleId);
  const result = await db.from("cost_budget_lines").update({
    module_id: moduleId,
    category: body.category === undefined ? current.category : oneOf(body.category, BUDGET_CATEGORIES, "Budget category"),
    description: body.description === undefined ? current.description : text(body.description),
    budget_amount: body.budgetAmount === undefined ? current.budget_amount : nonnegative(body.budgetAmount, "Budget amount"),
    updated_at: new Date().toISOString(),
  }).eq("id", current.id).select().single();
  return mapBudget(unwrap(result, "Budget line"));
}));

router.delete("/budgets/:id", handler(async (req) => {
  const result = await db.from("cost_budget_lines").delete().eq("id", routeParam(req.params.id)).select("id").maybeSingle();
  return { ok: true, id: unwrap(result, "Budget line").id };
}));

async function newExpensePayload(claim: AnyRow, body: JsonObject) {
  const expenseKind = oneOf(body.expenseKind, EXPENSE_KINDS, "Expense kind");
  const isFee = isFeeKind(expenseKind);
  const moduleId = await assertModule(claim.id, body.moduleId);
  const payerName = text(body.payerName) ?? "CBRS Group";
  const payeeName = requiredText(body.payeeName, "Payee");
  let amount = nonnegative(body.amount ?? 0, "Amount");
  let calculationMode: string | null = null;
  let calculationBasis: string | null = null;
  let ratePercent: number | null = null;
  let basisAmount: number | null = null;
  let feeState: string | null = null;
  if (isFee) {
    calculationMode = oneOf(body.calculationMode, CALCULATION_MODES, "Calculation mode");
    calculationBasis = calculationMode === "Percentage"
      ? oneOf(body.calculationBasis, CALCULATION_BASES, "Calculation basis")
      : null;
    ratePercent = calculationMode === "Percentage" ? percentage(body.ratePercent) : null;
    feeState = "Projected";
    if (calculationMode === "Percentage") {
      const plan = await buildPlan(claim.id);
      basisAmount = feeBasisAmount(calculationBasis, plan.metrics);
      amount = money(basisAmount * (ratePercent ?? 0) / 100);
    }
  }
  const invoiceDate = text(body.invoiceDate);
  const scopeNotes = text(body.scopeNotes);
  return {
    claim_id: claim.id,
    module_id: moduleId,
    expense_name: requiredText(body.name, isFee ? "Fee name" : "Cost name"),
    category: expenseCategory(expenseKind),
    expense_kind: expenseKind,
    payer_name: payerName,
    billing_entity: payeeName,
    vendor: payeeName,
    amount,
    invoice_number: text(body.invoiceNumber),
    invoice_date: invoiceDate,
    date: invoiceDate ?? new Date().toISOString().slice(0, 10),
    due_date: text(body.dueDate),
    scope_notes: scopeNotes,
    notes: scopeNotes,
    calculation_mode: calculationMode,
    calculation_basis: calculationBasis,
    rate_percent: ratePercent,
    basis_amount: basisAmount,
    fee_state: feeState,
    fields_raw: {
      "Billing Entity": payeeName,
      "Invoice #": text(body.invoiceNumber),
      "Invoice Date": invoiceDate,
      "Scope/Notes": scopeNotes,
      "Module Record ID": moduleId,
      "Expense Kind": expenseKind,
    },
  };
}

router.post("/claims/:claimRef/expenses", handler(async (req) => {
  const claim = await findClaim(routeParam(req.params.claimRef));
  const payload = await newExpensePayload(claim, object(req.body));
  const result = await db.from("project_expenses").insert(payload).select("id").single();
  const row = unwrap(result, "Project expense");
  return { id: row.id, plan: await buildPlan(claim.id) };
}));

router.patch("/expenses/:id", handler(async (req) => {
  const id = routeParam(req.params.id);
  const current = unwrap(await db.from("project_expenses").select("*").eq("id", id).maybeSingle(), "Project expense");
  const body = object(req.body);
  const paymentResult = await db.from("cost_payments").select("id, amount").eq("project_expense_id", id);
  if (paymentResult.error) throw new Error(paymentResult.error.message);
  const paidAmount = money((paymentResult.data ?? []).reduce(
    (sum: number, row: AnyRow) => sum + money(row.amount), 0,
  ));
  const hasPayments = paidAmount > 0;
  const locked = current.fee_state === "Due" || Boolean(current.locked_at);
  const financialKeys = ["expenseKind", "amount", "calculationMode", "calculationBasis", "ratePercent"];
  if (locked && financialKeys.some((key) => body[key] !== undefined)) {
    throw new HttpError(409, "A Due fee is locked; its basis and amount cannot be changed");
  }
  if (hasPayments && body.feeState === "Waived") {
    throw new HttpError(409, "A fee with payments cannot be waived");
  }
  const moduleId = body.moduleId === undefined ? current.module_id : await assertModule(current.claim_id, body.moduleId);
  const expenseKind = body.expenseKind === undefined
    ? current.expense_kind
    : oneOf(body.expenseKind, EXPENSE_KINDS, "Expense kind");
  if (hasPayments && isFeeKind(expenseKind) !== isFeeKind(current.expense_kind)) {
    throw new HttpError(409, "A cost with payments cannot be converted to or from a fee obligation");
  }
  const next: AnyRow = {
    module_id: moduleId,
    expense_name: body.name === undefined ? current.expense_name : requiredText(body.name, "Name"),
    expense_kind: expenseKind,
    category: expenseCategory(expenseKind),
    payer_name: body.payerName === undefined ? current.payer_name : requiredText(body.payerName, "Payer"),
    billing_entity: body.payeeName === undefined ? current.billing_entity : requiredText(body.payeeName, "Payee"),
    vendor: body.payeeName === undefined ? current.vendor : requiredText(body.payeeName, "Payee"),
    invoice_number: body.invoiceNumber === undefined ? current.invoice_number : text(body.invoiceNumber),
    invoice_date: body.invoiceDate === undefined ? current.invoice_date : text(body.invoiceDate),
    due_date: body.dueDate === undefined ? current.due_date : text(body.dueDate),
    scope_notes: body.scopeNotes === undefined ? current.scope_notes : text(body.scopeNotes),
    notes: body.scopeNotes === undefined ? current.notes : text(body.scopeNotes),
    updated_at: new Date().toISOString(),
  };
  if (!locked) {
    next.amount = body.amount === undefined ? current.amount : nonnegative(body.amount, "Amount");
    if (!isFeeKind(expenseKind) && money(next.amount) < paidAmount) {
      throw new HttpError(409, "Amount cannot be lower than payments already recorded");
    }
    if (isFeeKind(expenseKind)) {
      next.calculation_mode = body.calculationMode === undefined
        ? current.calculation_mode
        : oneOf(body.calculationMode, CALCULATION_MODES, "Calculation mode");
      next.calculation_basis = next.calculation_mode === "Percentage"
        ? body.calculationBasis === undefined
          ? current.calculation_basis
          : oneOf(body.calculationBasis, CALCULATION_BASES, "Calculation basis")
        : null;
      next.rate_percent = next.calculation_mode === "Percentage"
        ? body.ratePercent === undefined ? current.rate_percent : percentage(body.ratePercent)
        : null;
      const plan = await buildPlan(current.claim_id);
      if (next.calculation_mode === "Percentage") {
        next.basis_amount = feeBasisAmount(next.calculation_basis, plan.metrics);
        next.amount = money(next.basis_amount * money(next.rate_percent) / 100);
      }
      next.fee_state = body.feeState === "Waived" ? "Waived" : "Projected";
    } else {
      next.calculation_mode = null;
      next.calculation_basis = null;
      next.rate_percent = null;
      next.basis_amount = null;
      next.fee_state = null;
    }
  }
  const result = await db.from("project_expenses").update(next).eq("id", id).select("id").single();
  unwrap(result, "Project expense");
  return { id, plan: await buildPlan(current.claim_id) };
}));

router.post("/expenses/:id/mark-due", handler(async (req) => {
  const id = routeParam(req.params.id);
  const expense = unwrap(await db.from("project_expenses").select("*").eq("id", id).maybeSingle(), "Project expense");
  if (!isFeeKind(expense.expense_kind)) throw new HttpError(400, "Only commission and referral fees can be marked Due");
  if (expense.fee_state === "Waived") throw new HttpError(409, "A waived fee cannot be marked Due");
  if (expense.fee_state === "Due") return { id, plan: await buildPlan(expense.claim_id) };
  const plan = await buildPlan(expense.claim_id);
  const amount = feePreviewAmount({
    id: expense.id,
    amount: expense.amount,
    expenseKind: expense.expense_kind,
    calculationMode: expense.calculation_mode,
    calculationBasis: expense.calculation_basis,
    ratePercent: expense.rate_percent,
    feeState: expense.fee_state,
  }, plan.metrics);
  const basisAmount = expense.calculation_mode === "Percentage"
    ? feeBasisAmount(expense.calculation_basis, plan.metrics)
    : null;
  const result = await db.from("project_expenses").update({
    amount,
    basis_amount: basisAmount,
    fee_state: "Due",
    locked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("fee_state", "Projected").select("id").maybeSingle();
  unwrap(result, "Projected fee");
  return { id, plan: await buildPlan(expense.claim_id) };
}));

router.delete("/expenses/:id", handler(async (req) => {
  const id = routeParam(req.params.id);
  const expense = unwrap(await db.from("project_expenses").select("*").eq("id", id).maybeSingle(), "Project expense");
  const paymentResult = await db.from("cost_payments").select("id", { count: "exact", head: true }).eq("project_expense_id", id);
  if (paymentResult.error) throw new Error(paymentResult.error.message);
  if (Number(paymentResult.count ?? 0) > 0) throw new HttpError(409, "An obligation with payments cannot be deleted");
  if (expense.fee_state === "Due" || expense.locked_at) throw new HttpError(409, "A Due fee is locked and cannot be deleted");
  const result = await db.from("project_expenses").delete().eq("id", id).select("id").maybeSingle();
  unwrap(result, "Project expense");
  return { ok: true, id, plan: await buildPlan(expense.claim_id) };
}));

router.post("/expenses/:id/payments", handler(async (req) => {
  const id = routeParam(req.params.id);
  const expense = unwrap(await db.from("project_expenses").select("*").eq("id", id).maybeSingle(), "Project expense");
  if (isFeeKind(expense.expense_kind) && expense.fee_state !== "Due") {
    throw new HttpError(409, "Mark this fee Due before recording a payment");
  }
  const body = object(req.body);
  const amount = nonnegative(body.amount, "Payment amount");
  if (amount <= 0) throw new HttpError(400, "Payment amount must be greater than zero");
  const plan = await buildPlan(expense.claim_id);
  const calculated = plan.expenses.find((row: AnyRow) => row.id === id);
  if (!calculated) throw new HttpError(404, "Project expense was not found");
  if (amount > money(calculated.balance)) throw new HttpError(400, "Payment exceeds the remaining balance");
  const paymentDate = text(body.paymentDate) ?? new Date().toISOString().slice(0, 10);
  const result = await db.from("cost_payments").insert({
    claim_id: expense.claim_id,
    project_expense_id: id,
    payment_name: text(body.paymentName) ?? `${expense.billing_entity ?? expense.expense_name} · ${paymentDate}`,
    amount,
    date: paymentDate,
    payment_method: text(body.method),
    check_number: text(body.checkNumber),
    notes: text(body.notes),
    fields_raw: { "Project Expense": [id] },
  }).select("id").single();
  const payment = unwrap(result, "Cost payment");
  return { id: payment.id, plan: await buildPlan(expense.claim_id) };
}));

router.delete("/payments/:id", handler(async (req) => {
  const id = routeParam(req.params.id);
  const payment = unwrap(await db.from("cost_payments").select("*").eq("id", id).maybeSingle(), "Cost payment");
  const result = await db.from("cost_payments").delete().eq("id", id).select("id").maybeSingle();
  unwrap(result, "Cost payment");
  return { ok: true, id, plan: payment.claim_id ? await buildPlan(payment.claim_id) : null };
}));

router.get("/contractors", handler(async () => {
  const claimsResult = await db.from("claims").select("id").not("contractor", "is", null);
  if (claimsResult.error) throw new Error(claimsResult.error.message);
  const plans = await Promise.all((claimsResult.data ?? []).map((claim: AnyRow) => buildPlan(claim.id)));
  const grouped = new Map<string, AnyRow>();
  for (const plan of plans) {
    const contractor = text(plan.claim.contractor) ?? "Unassigned";
    const key = contractor.toLowerCase();
    const row = grouped.get(key) ?? {
      contractor,
      projectCount: 0,
      approvedRevenue: 0,
      collectedRevenue: 0,
      budget: 0,
      committedCosts: 0,
      paidCosts: 0,
      feesOwedByContractor: 0,
      feesOwedToContractor: 0,
      referralBalance: 0,
      projectedProfit: 0,
      expectedProfit: 0,
      claims: [],
    };
    row.projectCount += 1;
    row.approvedRevenue = money(row.approvedRevenue + plan.metrics.approvedRevenue);
    row.collectedRevenue = money(row.collectedRevenue + plan.metrics.collectedRevenue);
    row.budget = money(row.budget + plan.metrics.budgetedDirectCost);
    row.committedCosts = money(row.committedCosts + plan.metrics.committedDirectCost);
    row.paidCosts = money(row.paidCosts + plan.metrics.paidDirectCost);
    row.projectedProfit = money(row.projectedProfit + plan.metrics.projectedProfit);
    row.expectedProfit = money(row.expectedProfit + plan.metrics.expectedProfit);
    for (const expense of plan.expenses) {
      if (!isFeeKind(expense.expenseKind) || expense.status === "Waived") continue;
      if (String(expense.payerName ?? "").toLowerCase() === key) {
        row.feesOwedByContractor = money(row.feesOwedByContractor + expense.balance);
      }
      if (String(expense.payeeName ?? "").toLowerCase() === key) {
        row.feesOwedToContractor = money(row.feesOwedToContractor + expense.balance);
      }
      if (expense.expenseKind === "Referral Fee") {
        row.referralBalance = money(row.referralBalance + expense.balance);
      }
    }
    row.claims.push({
      id: plan.claim.id,
      claimCode: plan.claim.claimCode,
      customerName: plan.claim.customerName,
      approvedRevenue: plan.metrics.approvedRevenue,
      projectedProfit: plan.metrics.projectedProfit,
      expectedProfit: plan.metrics.expectedProfit,
    });
    grouped.set(key, row);
  }
  return [...grouped.values()].sort((a, b) => a.contractor.localeCompare(b.contractor));
}));

export { router as financialPlanningRouter };
