/**
 * Claims Master Financials — sidecar server.
 *
 * One process serves both:
 *   - the static SPA (built into ../dist)
 *   - /api/airtable/* — proxies to api.airtable.com with the PAT injected,
 *     restricted to this contractor's three sibling base IDs
 *   - /api/sync/*    — invokes serviceLifecycleSync helpers (CRUD across
 *     the three bases)
 *
 * The Vite client never sees the PAT or the base IDs directly. It calls
 * `${VITE_API_BASE_URL}/airtable/...` which lands here.
 */
import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import {
  airtablePat,
  baseIdFor,
  allowedBaseIds,
  assertNoPatInClientEnv,
  logResolvedBases,
} from "./lib/bases.js";
import {
  approveEstimate,
  createService,
  deleteService,
  setSupplement,
  updateService,
  addPayment,
  reconcileServiceLifecycle,
  notifySupplementAdded,
  CascadeRefusedError,
} from "./lib/serviceLifecycleSync.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

assertNoPatInClientEnv();
logResolvedBases("[financials/sidecar]");

const PORT = Number(process.env.PORT ?? 3001);
const SHARED_SECRET = process.env.PROXY_SHARED_SECRET?.trim();

const app = express();
app.use(express.json({ limit: "2mb" }));

// -------- auth (stop-gap until real session auth lands) --------
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (!SHARED_SECRET) return next(); // local dev convenience
  const provided = req.header("x-proxy-secret")?.trim();
  if (provided && provided === SHARED_SECRET) return next();
  res.status(401).json({ error: "Unauthorized" });
});

// -------- whitelisted Airtable proxy --------
// Express 5 / path-to-regexp v8 require named splats (`*name`) — bare `*` no
// longer parses. The catch-all segments land on req.params[name] as an array.
//
// Two paths share one handler:
//   /api/airtable/v0/:base/...  ← what the Airtable JS SDK sends (it always
//                                   appends `v0/{base}/{table}` to endpointUrl)
//   /api/airtable/:base/...     ← what bare curl / fetch calls send
app.all(["/api/airtable/v0/:base/*rest", "/api/airtable/:base/*rest"], async (req: Request, res: Response) => {
  try {
    const baseId = req.params.base as string;
    const allowed = allowedBaseIds();
    if (!allowed.has(baseId)) {
      return res.status(403).json({
        error: "Base not in whitelist",
        baseId,
        allowed: Array.from(allowed),
      });
    }
    const restParam = (req.params as { rest?: string | string[] }).rest;
    const restPath = Array.isArray(restParam) ? restParam.join("/") : (restParam ?? "");
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${restPath}`);
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === "string") url.searchParams.set(k, v);
    }
    const init: RequestInit = {
      method: req.method,
      headers: {
        Authorization: `Bearer ${airtablePat()}`,
        "Content-Type": "application/json",
      },
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = JSON.stringify(req.body ?? {});
    }
    const upstream = await fetch(url.toString(), init);
    const body = await upstream.text();
    res
      .status(upstream.status)
      .type(upstream.headers.get("content-type") ?? "application/json")
      .send(body);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// -------- sync helpers --------
function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const result = await handler(req, res);
      if (result !== undefined && !res.headersSent) res.json(result);
    } catch (e) {
      if (e instanceof CascadeRefusedError) {
        return res.status(409).json({ error: e.message, counts: e.counts });
      }
      res.status(500).json({ error: (e as Error).message });
    }
  };
}

app.post("/api/sync/services", asyncRoute(async (req) => createService(req.body)));
app.patch("/api/sync/services/:id", asyncRoute(async (req) => {
  await updateService(req.params.id, req.body);
  return { ok: true };
}));
app.post("/api/sync/services/:id/approve-estimate", asyncRoute(async (req) =>
  approveEstimate(req.params.id, req.body),
));
app.post("/api/sync/services/:id/supplement", asyncRoute(async (req) => {
  const result = await setSupplement(req.params.id, req.body);
  if (result.notification) {
    await notifySupplementAdded({
      service: result.notification.service,
      amount: result.notification.amount,
      mode: result.notification.mode,
    });
  }
  return result;
}));
app.delete("/api/sync/services/:id", asyncRoute(async (req) =>
  deleteService(req.params.id, { confirmCascade: req.body?.confirmCascade === true }),
));
app.post("/api/sync/payments", asyncRoute(async (req) => addPayment(req.body)));
app.post("/api/sync/reconcile", asyncRoute(async () => reconcileServiceLifecycle()));

// -------- bases discovery (read-only, for client header chips) --------
app.get("/api/bases", (_req: Request, res: Response) => {
  try {
    res.json({
      CLAIMS_MASTER: baseIdFor("CLAIMS_MASTER"),
      FINANCIALS: baseIdFor("FINANCIALS"),
      REST_OPS: baseIdFor("REST_OPS"),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
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
  console.log(`[financials/sidecar] listening on :${PORT} — static=${existsSync(distDir) ? "on" : "off"}`);
});
