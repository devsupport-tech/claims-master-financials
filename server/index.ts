/**
 * Claims Master Financials — sidecar server (Supabase edition).
 *
 * Cross-base Airtable sync has been removed (single Supabase database now).
 * What remains:
 *   - Static SPA serving (built into ../dist).
 *   - A thin /api/sync/* surface kept ALIVE so the frontend's
 *     services/lifecycle-sync.ts client doesn't break. Each endpoint now
 *     just writes to the Supabase `modules` + `job_costing` rows directly
 *     (lifecycle/supplement fields live under fields_raw because the
 *     Supabase schema doesn't carry first-class columns for them yet).
 *   - A health stub at /api/health for the container healthcheck.
 *
 * The /api/airtable/* proxy and /api/bases discovery endpoint are gone.
 */
import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import { supabaseAdmin } from "./lib/supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3001);
const SHARED_SECRET = process.env.PROXY_SHARED_SECRET?.trim();

const app = express();
app.use(express.json({ limit: "2mb" }));

// -------- auth (stop-gap until real session auth lands) --------
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (!SHARED_SECRET) return next(); // local dev convenience
  if (req.path === "/health") return next();
  const provided = req.header("x-proxy-secret")?.trim();
  if (provided && provided === SHARED_SECRET) return next();
  res.status(401).json({ error: "Unauthorized" });
});

// -------- helpers --------

type FieldsRaw = Record<string, unknown>;

function mergeFieldsRaw(existing: unknown, patch: FieldsRaw): FieldsRaw {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as FieldsRaw) }
      : {};
  return { ...base, ...patch };
}

async function loadModule(moduleId: string) {
  const { data, error } = await supabaseAdmin
    .from("modules")
    .select("*")
    .eq("id", moduleId)
    .single();
  if (error) throw new Error(`load module ${moduleId}: ${error.message}`);
  if (!data) throw new Error(`module ${moduleId} not found`);
  return data;
}

async function loadOrCreateMainJobCosting(moduleId: string, claimId: string | null) {
  // Look up the "J" job_costing row for this module via fields_raw['Module
  // Record ID']. PostgREST jsonb path filtering on a key that contains a
  // space is finicky, so we scope by claim_id (cheap) and filter in JS.
  let q = supabaseAdmin.from("job_costing").select("*");
  if (claimId) q = q.eq("claim_id", claimId);
  const { data: existing, error: lookupErr } = await q;
  if (lookupErr) throw new Error(`lookup job_costing: ${lookupErr.message}`);
  const main = (existing ?? []).find((row) => {
    const mid = (row.fields_raw as FieldsRaw | null)?.["Module Record ID"];
    return typeof mid === "string" && mid === moduleId;
  });
  if (main) return main;
  const insert = {
    claim_id: claimId,
    fields_raw: { "Module Record ID": moduleId } as FieldsRaw,
  };
  const { data: created, error: insertErr } = await supabaseAdmin
    .from("job_costing")
    .insert(insert as never)
    .select()
    .single();
  if (insertErr) throw new Error(`create job_costing: ${insertErr.message}`);
  return created;
}

async function updateJobCostingRaw(jobCostingId: string, patch: FieldsRaw, scalarPatch?: Record<string, unknown>) {
  const { data: current, error: getErr } = await supabaseAdmin
    .from("job_costing")
    .select("fields_raw")
    .eq("id", jobCostingId)
    .single();
  if (getErr) throw new Error(`read job_costing ${jobCostingId}: ${getErr.message}`);
  const merged = mergeFieldsRaw(current?.fields_raw, patch);
  const { error: upErr } = await supabaseAdmin
    .from("job_costing")
    .update({ fields_raw: merged as never, ...(scalarPatch ?? {}) } as never)
    .eq("id", jobCostingId);
  if (upErr) throw new Error(`update job_costing ${jobCostingId}: ${upErr.message}`);
}

async function updateModuleRaw(moduleId: string, patch: FieldsRaw, scalarPatch?: Record<string, unknown>) {
  const { data: current, error: getErr } = await supabaseAdmin
    .from("modules")
    .select("fields_raw")
    .eq("id", moduleId)
    .single();
  if (getErr) throw new Error(`read module ${moduleId}: ${getErr.message}`);
  const merged = mergeFieldsRaw(current?.fields_raw, patch);
  const { error: upErr } = await supabaseAdmin
    .from("modules")
    .update({ fields_raw: merged as never, ...(scalarPatch ?? {}) } as never)
    .eq("id", moduleId);
  if (upErr) throw new Error(`update module ${moduleId}: ${upErr.message}`);
}

// -------- /api/sync/* — Supabase-backed lifecycle endpoints --------
function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const result = await handler(req, res);
      if (result !== undefined && !res.headersSent) res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  };
}

/**
 * POST /api/sync/services/:id/approve-estimate
 * Body: { approvedAmount, submittedAmount?, approvedDateISO? }
 *
 * Writes Approved Estimate Amount (+ Submitted Estimate Amount when given)
 * to the matching job_costing row's fields_raw. Also stamps the same
 * mirrors on the module row so the UI sees them on the next refresh.
 */
app.post(
  "/api/sync/services/:id/approve-estimate",
  asyncRoute(async (req) => {
    const moduleId = req.params.id;
    const approvedAmount = Number(req.body?.approvedAmount ?? 0);
    const submittedAmount =
      req.body?.submittedAmount != null ? Number(req.body.submittedAmount) : undefined;
    const moduleRow = await loadModule(moduleId);
    const claimId = (moduleRow as { claim_id?: string | null }).claim_id ?? null;
    const main = await loadOrCreateMainJobCosting(moduleId, claimId);
    const patch: FieldsRaw = {
      "Approved Estimate Amount": approvedAmount,
      ...(submittedAmount !== undefined ? { "Submitted Estimate Amount": submittedAmount } : {}),
    };
    await updateJobCostingRaw(main.id as string, patch);
    await updateModuleRaw(moduleId, {
      ...patch,
      "Estimate Status": "Approved",
    });
    return { ok: true, jobCostingId: main.id };
  }),
);

/**
 * POST /api/sync/services/:id/submitted-estimate
 * Body: { submittedAmount, approvedAmount? }
 *
 * Captures the carrier-bound Submitted Estimate Amount without marking the
 * estimate Approved. Writes to job_costing.fields_raw + module.fields_raw.
 */
app.post(
  "/api/sync/services/:id/submitted-estimate",
  asyncRoute(async (req) => {
    const moduleId = req.params.id;
    const submittedAmount = Number(req.body?.submittedAmount ?? 0);
    const approvedAmount =
      req.body?.approvedAmount != null ? Number(req.body.approvedAmount) : undefined;
    const moduleRow = await loadModule(moduleId);
    const claimId = (moduleRow as { claim_id?: string | null }).claim_id ?? null;
    const main = await loadOrCreateMainJobCosting(moduleId, claimId);
    const patch: FieldsRaw = {
      "Submitted Estimate Amount": submittedAmount,
      ...(approvedAmount !== undefined ? { "Approved Estimate Amount": approvedAmount } : {}),
    };
    await updateJobCostingRaw(main.id as string, patch);
    await updateModuleRaw(moduleId, patch);
    return { ok: true, jobCostingId: main.id };
  }),
);

/**
 * POST /api/sync/services/:id/supplement
 * Body: { hasSupplement, amount?, mode?, separateInvoiceLabel? }
 *
 * Toggle / set supplement on a service. Stored in fields_raw on both the
 * module row and its job_costing row. The supplement "J'" row split that
 * the legacy code maintained is collapsed into Append-mode behavior here;
 * if you need a separate row later, branch on `mode === 'Separate invoice'`
 * and create a sibling job_costing entry with `<moduleId>:supplement`.
 */
app.post(
  "/api/sync/services/:id/supplement",
  asyncRoute(async (req) => {
    const moduleId = req.params.id;
    const hasSupplement = Boolean(req.body?.hasSupplement);
    const amount = req.body?.amount != null ? Number(req.body.amount) : undefined;
    const mode = req.body?.mode as string | undefined;
    const separateInvoiceLabel = req.body?.separateInvoiceLabel as string | undefined;
    const moduleRow = await loadModule(moduleId);
    const claimId = (moduleRow as { claim_id?: string | null }).claim_id ?? null;
    const main = await loadOrCreateMainJobCosting(moduleId, claimId);
    const patch: FieldsRaw = {
      "Has Supplement": hasSupplement,
      ...(amount !== undefined ? { "Supplement Approved Amount": amount } : {}),
      ...(mode ? { "Supplement Invoice Mode": mode } : {}),
      ...(separateInvoiceLabel
        ? { "Supplement Separate Invoice Label": separateInvoiceLabel }
        : {}),
    };
    await updateJobCostingRaw(main.id as string, patch);
    await updateModuleRaw(moduleId, patch);
    const notification =
      hasSupplement && amount && amount > 0
        ? { service: moduleId, amount, mode: mode ?? "Append to invoice" }
        : null;
    return { ok: true, jobCostingId: main.id, notification };
  }),
);

/**
 * Compatibility no-ops for routes the old serviceLifecycleSync supported.
 * Keep them returning 200 so the UI flows that probe them don't error.
 */
app.post(
  "/api/sync/services",
  asyncRoute(async (req) => {
    // createService — would require a Claims Master id + service definition.
    // No call site invokes this on the Financials UI today. TODO: implement
    // if/when the create flow moves here.
    return { ok: true, todo: "createService not implemented in Supabase build", body: req.body };
  }),
);

app.patch(
  "/api/sync/services/:id",
  asyncRoute(async (req) => {
    // updateService — apply a generic patch to modules.fields_raw.
    await updateModuleRaw(req.params.id, req.body ?? {});
    return { ok: true };
  }),
);

app.delete(
  "/api/sync/services/:id",
  asyncRoute(async (req) => {
    const { error } = await supabaseAdmin.from("modules").delete().eq("id", req.params.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  }),
);

app.post(
  "/api/sync/payments",
  asyncRoute(async (req) => {
    // addPayment — write straight into financial_ledger as an Inflow against
    // the given claim id. Body shape mirrors the LedgerEntry form.
    const body = req.body ?? {};
    const insert = {
      claim_id: body.claimId ?? body.claim_id ?? null,
      entry_name: body.entryName ?? body["Entry Name"] ?? "Payment",
      entry_type: body.entryType ?? body["Entry Type"] ?? "Insurance Payment",
      direction: body.direction ?? body.Direction ?? "Inflow",
      amount: Number(body.amount ?? body.Amount ?? 0),
      date: body.date ?? body.Date ?? new Date().toISOString().slice(0, 10),
      category: body.category ?? body.Category ?? null,
    };
    const { data, error } = await supabaseAdmin
      .from("financial_ledger")
      .insert(insert as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, ledgerEntryId: (data as { id: string }).id };
  }),
);

app.post(
  "/api/sync/reconcile",
  asyncRoute(async () => {
    // Reconciliation was a cross-base sweep; in single-DB Supabase there is
    // nothing to reconcile. Kept so the startup ping still 200s.
    return { ok: true, reconciled: 0 };
  }),
);

// -------- health --------
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// -------- static SPA --------
const distDir = resolve(__dirname, "../dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(resolve(distDir, "index.html"));
  });
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[financials/sidecar] listening on :${PORT} — static=${existsSync(distDir) ? "on" : "off"}`,
  );
});
