/**
 * Canonical derived payment status for a service lifecycle row.
 *
 * Lives in `claims-master-financials/src/lib/payment-status.ts` because the
 * money truth is here. Thin re-exports in:
 *   - Claims-Master-VEC/dashboard/src/utils/paymentStatus.ts
 *   - restoration-ops-austin/src/lib/paymentStatus.ts
 *
 * Rule:
 *   approvedTotal = ApprovedEstimateAmount + (mode === 'Append' ? SupplementApprovedAmount : 0)
 *   paid          = Σ Inflow ledger entries whose Category matches the service
 *
 *   paid === 0                       → "No Payment"
 *   0 < paid < approvedTotal         → "Partial Payment"
 *   paid >= approvedTotal > 0        → "Payment Completed"
 *
 * When `Supplement Invoice Mode = 'Separate invoice'`, the supplement gets
 * its OWN derived status against `Supplement Approved Amount` and payments
 * tagged with the separate invoice label — call `derivePaymentStatus` twice,
 * once per row (J and J').
 */

export type DerivedPaymentStatus =
  | "No Payment"
  | "Partial Payment"
  | "Payment Completed";

export type SupplementInvoiceMode = "Append to invoice" | "Separate invoice";

export interface PaymentStatusInput {
  /** From Job Costing. */
  approvedEstimateAmount: number;
  /** Optional supplement approved amount on the same row. */
  supplementApprovedAmount?: number;
  /** Whether the supplement amount is rolled into this row or split off. */
  supplementInvoiceMode?: SupplementInvoiceMode;
  /** Has Supplement checkbox value. Treated as false if undefined. */
  hasSupplement?: boolean;
  /** Total Inflow paid so far against this service (ledger sum). */
  paidAmount: number;
}

export interface PaymentStatusResult {
  status: DerivedPaymentStatus;
  approvedTotal: number;
  paid: number;
  /** Convenience: approvedTotal - paid, never negative. */
  remaining: number;
  /** Convenience: paid / approvedTotal × 100, capped at 100. 0 when nothing approved. */
  percentPaid: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function derivePaymentStatus(input: PaymentStatusInput): PaymentStatusResult {
  const approved = Math.max(0, Number(input.approvedEstimateAmount) || 0);
  const supplement = Math.max(0, Number(input.supplementApprovedAmount) || 0);
  const includeSupplement =
    Boolean(input.hasSupplement) &&
    (input.supplementInvoiceMode ?? "Append to invoice") === "Append to invoice";

  const approvedTotal = round2(approved + (includeSupplement ? supplement : 0));
  const paid = round2(Math.max(0, Number(input.paidAmount) || 0));

  let status: DerivedPaymentStatus;
  if (paid === 0) {
    status = "No Payment";
  } else if (approvedTotal > 0 && paid >= approvedTotal) {
    status = "Payment Completed";
  } else {
    status = "Partial Payment";
  }

  const remaining = round2(Math.max(0, approvedTotal - paid));
  const percentPaid = approvedTotal > 0 ? Math.min(100, (paid / approvedTotal) * 100) : 0;

  return { status, approvedTotal, paid, remaining, percentPaid };
}

/**
 * Sum the Inflow amount of ledger entries whose Category matches one of the
 * given labels (typically the service's Trade Category, plus its supplement
 * label when the supplement is on a separate invoice).
 */
export interface LedgerEntryLike {
  Direction?: string;
  Amount?: number;
  Category?: string;
}

export function sumPaymentsFor(
  entries: ReadonlyArray<LedgerEntryLike>,
  categoryLabels: ReadonlyArray<string>,
): number {
  if (!entries?.length || !categoryLabels?.length) return 0;
  const set = new Set(categoryLabels.map((s) => s.trim().toLowerCase()));
  let total = 0;
  for (const e of entries) {
    if (e?.Direction !== "Inflow") continue;
    const cat = (e?.Category ?? "").trim().toLowerCase();
    if (!set.has(cat)) continue;
    const amt = Number(e?.Amount) || 0;
    if (amt > 0) total += amt;
  }
  return round2(total);
}

/**
 * Map status → tailwind/css color hint for badges. Apps may map to their own
 * design tokens; this is the fallback used by ServiceLifecycleCard.
 */
export function paymentStatusBadge(status: DerivedPaymentStatus): {
  label: string;
  tone: "neutral" | "warning" | "success";
} {
  switch (status) {
    case "No Payment":
      return { label: "No Payment", tone: "neutral" };
    case "Partial Payment":
      return { label: "Partial Payment", tone: "warning" };
    case "Payment Completed":
      return { label: "Payment Completed", tone: "success" };
  }
}
