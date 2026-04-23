/**
 * Frontend wrapper for the cross-app service lifecycle sidecar endpoints.
 *
 * The Financials app is now the canonical place to edit service-level $
 * fields — Approved Estimate Amount, Has Supplement, Supplement Approved
 * Amount, Supplement Invoice Mode, Supplement Separate Invoice Label.
 *
 * VEC and Restoration Ops display these values read-only; the sidecar's
 * /api/sync/* routes (mounted in server/index.ts) hold the PAT and write
 * across all three contractor bases.
 */

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
const SYNC_BASE = `${API_BASE_URL}/sync`;

async function syncRequest<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${SYNC_BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    const message =
      (parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : null) ?? `Sync ${method} ${path} → ${res.status}`;
    throw new Error(message);
  }
  return parsed as T;
}

export type SupplementInvoiceMode = 'Append to invoice' | 'Separate invoice';

export interface ApproveEstimatePayload {
  approvedAmount: number;
  /** Optional initial estimate the contractor submitted to the carrier. */
  submittedAmount?: number;
  approvedDateISO?: string;
}

export async function approveEstimate(
  moduleRecordId: string,
  payload: ApproveEstimatePayload,
): Promise<unknown> {
  return syncRequest('POST', `/services/${moduleRecordId}/approve-estimate`, payload);
}

export interface SetSupplementPayload {
  hasSupplement: boolean;
  amount?: number;
  mode?: SupplementInvoiceMode;
  separateInvoiceLabel?: string;
}

export async function setSupplement(
  moduleRecordId: string,
  payload: SetSupplementPayload,
): Promise<unknown> {
  return syncRequest('POST', `/services/${moduleRecordId}/supplement`, payload);
}
