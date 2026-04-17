/**
 * Single seam for resolving any of the three Airtable bases this deployment
 * can reach (own + the two sibling apps for the same contractor).
 *
 * IMPORTANT: this lives in the server-side sidecar — the PAT and base IDs
 * never reach the browser bundle. The Vite client talks to /api/airtable/*
 * which is proxied by this sidecar.
 *
 * The deployment's `.env` carries the three values:
 *
 *   AIRTABLE_CLAIMS_MASTER_BASE   // sibling: Claims Master for same contractor
 *   AIRTABLE_FINANCIALS_BASE      // own (this app)
 *   AIRTABLE_REST_OPS_BASE        // sibling: Restoration Ops for same contractor
 *
 * Plus the single PAT that can read/write all three:
 *
 *   AIRTABLE_PAT
 */

export type AppKey = "CLAIMS_MASTER" | "FINANCIALS" | "REST_OPS";

const BASE_ENV: Record<AppKey, string> = {
  CLAIMS_MASTER: "AIRTABLE_CLAIMS_MASTER_BASE",
  FINANCIALS: "AIRTABLE_FINANCIALS_BASE",
  REST_OPS: "AIRTABLE_REST_OPS_BASE",
};

export function baseIdFor(app: AppKey): string {
  const key = BASE_ENV[app];
  const id = process.env[key]?.trim();
  if (!id) {
    throw new Error(
      `Missing env ${key}. Add it to .env (own + the 2 sibling app base IDs for this contractor).`,
    );
  }
  return id;
}

export function airtablePat(): string {
  const pat = process.env.AIRTABLE_PAT?.trim();
  if (!pat) {
    throw new Error(
      "Missing env AIRTABLE_PAT. The single PAT writes to all 3 sibling bases for this contractor.",
    );
  }
  return pat;
}

/**
 * Whitelist of base IDs the proxy will forward to. Anything outside the
 * three sibling bases is rejected — even with a valid session — so a
 * compromised client can't pivot to other Airtable workspaces.
 */
export function allowedBaseIds(): Set<string> {
  return new Set([baseIdFor("CLAIMS_MASTER"), baseIdFor("FINANCIALS"), baseIdFor("REST_OPS")]);
}

/**
 * Hard-fail at boot if any VITE_AIRTABLE_* var still carries a PAT — that
 * was the legacy pattern and exposes the secret to the browser bundle.
 */
export function assertNoPatInClientEnv(): void {
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("VITE_AIRTABLE")) continue;
    if (typeof v === "string" && v.startsWith("pat")) {
      throw new Error(
        `${k} appears to hold an Airtable PAT. The PAT must only live in server-side env (AIRTABLE_PAT). ` +
          `Remove ${k} from this deployment's environment.`,
      );
    }
  }
}

let logged = false;
export function logResolvedBases(label = "[bases]"): void {
  if (logged) return;
  logged = true;
  try {
    const cm = baseIdFor("CLAIMS_MASTER");
    const fin = baseIdFor("FINANCIALS");
    const ops = baseIdFor("REST_OPS");
    // eslint-disable-next-line no-console
    console.log(
      `${label} resolved bases: CLAIMS_MASTER=${cm} FINANCIALS=${fin} REST_OPS=${ops}`,
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`${label} could not resolve all bases:`, (e as Error).message);
  }
}
