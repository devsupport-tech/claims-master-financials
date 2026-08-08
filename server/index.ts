/**
 * Claims Master Financials sidecar.
 *
 * Service lifecycle writes are delegated to transactional PostgreSQL
 * functions through the server-side Supabase service-role client. The SPA
 * never executes those functions or assembles lifecycle joins itself.
 */
import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import { supabaseAdmin } from "./lib/supabase.js";
import { financialPlanningRouter } from "./routes/financial-planning.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const SHARED_SECRET = process.env.PROXY_SHARED_SECRET?.trim();

const app = express();
app.use(express.json({ limit: "2mb" }));

app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (!SHARED_SECRET) return next();
  if (req.path === "/health") return next();
  const provided = req.header("x-proxy-secret")?.trim();
  if (provided && provided === SHARED_SECRET) return next();
  res.status(401).json({ error: "Unauthorized" });
});

type JsonObject = Record<string, unknown>;

function rawObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function optionalAmount(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} must be a non-negative number`);
  return amount;
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const result = await handler(req, res);
      if (result !== undefined && !res.headersSent) res.json(result);
    } catch (e) {
      const message = (e as Error).message;
      const badInput = /must|invalid|negative|greater than zero/i.test(message);
      res.status(badInput ? 400 : 500).json({ error: message });
    }
  };
}

async function runEstimate(
  moduleId: string,
  body: JsonObject,
  forcedStatus?: string,
) {
  const { data, error } = await supabaseAdmin.rpc("save_service_estimate", {
    p_module_id: moduleId,
    p_estimate_status: forcedStatus ?? (body.estimateStatus as string | undefined),
    p_submitted_amount: optionalAmount(body.submittedAmount, "Submitted estimate"),
    p_approved_amount: optionalAmount(body.approvedAmount, "Approved estimate"),
    p_approved_date: (body.approvedDate ?? body.approvedDateISO ?? undefined) as string | undefined,
  });
  if (error) throw new Error(error.message);
  return data;
}

async function runSupplement(moduleId: string, body: JsonObject) {
  if (typeof body.hasSupplement !== "boolean") throw new Error("hasSupplement must be a boolean");
  const { data, error } = await supabaseAdmin.rpc("save_service_supplement", {
    p_module_id: moduleId,
    p_has_supplement: body.hasSupplement,
    p_amount: optionalAmount(body.amount, "Supplement amount"),
    p_mode: (body.mode as string | undefined) ?? undefined,
    p_label: (body.label ?? body.separateInvoiceLabel ?? undefined) as string | undefined,
    p_supplement_status: (body.supplementStatus as string | undefined) ?? undefined,
  });
  if (error) throw new Error(error.message);
  return data;
}

app.post("/api/sync/services/:id/estimate", asyncRoute(async (req) =>
  runEstimate(routeParam(req.params.id), req.body ?? {}),
));

// Compatibility aliases during the two-deployment rollout. They execute the
// same transaction and can be removed after both Coolify apps are healthy.
app.post("/api/sync/services/:id/approve-estimate", asyncRoute(async (req) =>
  runEstimate(routeParam(req.params.id), req.body ?? {}, "Approved"),
));
app.post("/api/sync/services/:id/submitted-estimate", asyncRoute(async (req) =>
  runEstimate(routeParam(req.params.id), req.body ?? {}),
));

app.post("/api/sync/services/:id/supplement", asyncRoute(async (req) =>
  runSupplement(routeParam(req.params.id), req.body ?? {}),
));

app.delete("/api/sync/services/:id", asyncRoute(async (req) => {
  const { data, error } = await supabaseAdmin.rpc("remove_or_archive_service", {
    p_module_id: routeParam(req.params.id),
  });
  if (error) throw new Error(error.message);
  return data;
}));

app.post("/api/sync/services/:id/restore", asyncRoute(async (req) => {
  const { data, error } = await supabaseAdmin.rpc("restore_service", {
    p_module_id: routeParam(req.params.id),
  });
  if (error) throw new Error(error.message);
  return data;
}));

/**
 * Joined service lifecycle view for one claim. `claimRef` may be the claim
 * UUID or the human-readable claim_id. Only rows for that claim are read.
 */
app.get("/api/sync/claims/:claimRef/services", asyncRoute(async (req) => {
  const claimRef = routeParam(req.params.claimRef).trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claimRef);
  const claimQuery = supabaseAdmin.from("claims").select("id, claim_id");
  const { data: claim, error: claimError } = isUuid
    ? await claimQuery.eq("id", claimRef).maybeSingle()
    : await claimQuery.eq("claim_id", claimRef).maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claim) {
    return { claimId: null, services: [] };
  }

  const [modulesResult, jobsResult, ledgerResult, expensesResult] = await Promise.all([
    supabaseAdmin.from("modules").select("*").eq("claim_id", claim.id).order("created_at"),
    supabaseAdmin.from("job_costing").select("*").eq("claim_id", claim.id),
    supabaseAdmin.from("financial_ledger").select("*").eq("claim_id", claim.id),
    supabaseAdmin.from("project_expenses").select("*").eq("claim_id", claim.id),
  ]);
  const firstError = modulesResult.error ?? jobsResult.error ?? ledgerResult.error ?? expensesResult.error;
  if (firstError) throw new Error(firstError.message);

  const jobs = jobsResult.data ?? [];
  const ledger = ledgerResult.data ?? [];
  const expenses = expensesResult.data ?? [];
  const services = (modulesResult.data ?? []).map((module) => {
    const moduleRaw = rawObject(module.fields_raw);
    const job = jobs.find((row) => row.module_id === module.id) ?? jobs.find((row) =>
      rawObject(row.fields_raw)["Module Record ID"] === module.id,
    );
    const jobRaw = rawObject(job?.fields_raw);
    const serviceName = String(module.module_type ?? module.module_name ?? "Service");
    const tradeCategory = String(job?.trade_category ?? serviceName);
    const supplementLabel = String(
      job?.supplement_invoice_label ??
      jobRaw["Supplement Separate Invoice Label"] ??
      `${serviceName} Supplement`,
    );
    const linkedPayments = ledger.filter((row) => {
      if (row.module_id) return row.module_id === module.id;
      const legacyModule = rawObject(row.fields_raw)["Module Record ID"];
      if (legacyModule) return legacyModule === module.id;
      return row.direction === "Inflow" && [tradeCategory, supplementLabel].includes(String(row.category ?? ""));
    });
    const linkedExpenses = expenses.filter((row) =>
      row.module_id === module.id || rawObject(row.fields_raw)["Module Record ID"] === module.id,
    );

    return {
      moduleRecordId: module.id,
      serviceName,
      billTo: module.bill_to ?? undefined,
      operationStatus: module.status ?? (moduleRaw["Operation Status"] as string | undefined),
      estimateStatus: module.estimate_status ?? moduleRaw["Estimate Status"] ?? "Draft",
      estimateApprovedDate: job?.estimate_approved_date ?? undefined,
      submittedEstimateAmount: Number(job?.submitted_estimate_amount ?? jobRaw["Submitted Estimate Amount"] ?? 0),
      approvedEstimateAmount: Number(job?.approved_estimate_amount ?? jobRaw["Approved Estimate Amount"] ?? job?.xactimate_budget ?? 0),
      hasSupplement: Boolean(job?.has_supplement ?? jobRaw["Has Supplement"] ?? false),
      supplementApprovedAmount: Number(job?.supplement_approved_amount ?? jobRaw["Supplement Approved Amount"] ?? 0),
      supplementInvoiceMode: job?.supplement_invoice_mode ?? jobRaw["Supplement Invoice Mode"] ?? "Append to invoice",
      supplementSeparateInvoiceLabel: supplementLabel,
      supplementStatus: module.supplement_status ?? "Draft",
      archivedAt: module.archived_at ?? undefined,
      paidAmount: linkedPayments.reduce((sum, row) => sum + (row.direction === "Inflow" ? Number(row.amount ?? 0) : 0), 0),
      expenseAmount: linkedExpenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
      jobCosting: job ? {
        id: job.id,
        "Trade Category": tradeCategory,
        "Submitted Estimate Amount": Number(job.submitted_estimate_amount ?? 0),
        "Approved Estimate Amount": Number(job.approved_estimate_amount ?? 0),
        "Has Supplement": Boolean(job.has_supplement),
        "Supplement Approved Amount": Number(job.supplement_approved_amount ?? 0),
        "Supplement Invoice Mode": job.supplement_invoice_mode,
        "Supplement Separate Invoice Label": supplementLabel,
        "Module Record ID": module.id,
      } : undefined,
      payments: linkedPayments.map((row) => ({
        id: row.id,
        Direction: row.direction,
        Amount: Number(row.amount ?? 0),
        Category: row.category ?? undefined,
        Date: row.date ?? undefined,
        "Entry Name": row.entry_name ?? undefined,
        "Entry Type": row.entry_type ?? undefined,
        "Module Record ID": row.module_id ?? undefined,
      })),
    };
  });

  return { claimId: claim.id, claimCode: claim.claim_id, services };
}));

app.post("/api/sync/payments", asyncRoute(async (req) => {
  const body = req.body ?? {};
  const insert = {
    claim_id: body.claimId ?? body.claim_id ?? null,
    module_id: body.moduleId ?? body.module_id ?? null,
    entry_name: body.entryName ?? body["Entry Name"] ?? "Payment",
    entry_type: body.entryType ?? body["Entry Type"] ?? "Insurance Payment",
    direction: body.direction ?? body.Direction ?? "Inflow",
    amount: optionalAmount(body.amount ?? body.Amount ?? 0, "Payment amount") ?? 0,
    date: body.date ?? body.Date ?? new Date().toISOString().slice(0, 10),
    category: body.category ?? body.Category ?? null,
  };
  const { data, error } = await supabaseAdmin.from("financial_ledger").insert(insert).select().single();
  if (error) throw new Error(error.message);
  return { ok: true, ledgerEntryId: data.id };
}));

app.post("/api/sync/reconcile", asyncRoute(async () => ({ ok: true, reconciled: 0 })));

app.get("/api/claims", asyncRoute(async () => {
  const { data, error } = await supabaseAdmin.from("claims").select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}));

app.use("/api/financial-planning", financialPlanningRouter);

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

const distDir = resolve(__dirname, "../dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(resolve(distDir, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`[financials/sidecar] listening on :${PORT} — static=${existsSync(distDir) ? "on" : "off"}`);
});
