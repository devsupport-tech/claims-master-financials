/**
 * Frontend wrapper for the cross-app service lifecycle sidecar endpoints.
 *
 * Both connected applications edit the same typed lifecycle fields through
 * server endpoints backed by transactional PostgreSQL functions.
 */

import type { ServiceLifecycleView } from '@/types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
const SYNC_BASE = `${API_BASE_URL}/sync`;

async function syncRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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
  return syncRequest('POST', `/services/${moduleRecordId}/estimate`, {
    estimateStatus: 'Approved',
    ...payload,
  });
}

export interface SetSubmittedEstimatePayload {
  submittedAmount: number;
  /** Optional approved amount; will be written to J if provided. */
  approvedAmount?: number;
}

/**
 * Save Submitted Estimate Amount on a service WITHOUT marking the estimate
 * as Approved on Restoration Ops. Use when the carrier hasn't approved yet
 * but the user wants to capture what was first submitted.
 */
export async function setSubmittedEstimate(
  moduleRecordId: string,
  payload: SetSubmittedEstimatePayload,
): Promise<unknown> {
  return syncRequest('POST', `/services/${moduleRecordId}/estimate`, payload);
}

export interface SetSupplementPayload {
  hasSupplement: boolean;
  amount?: number;
  mode?: SupplementInvoiceMode;
  separateInvoiceLabel?: string;
  supplementStatus?: 'Draft' | 'For Review' | 'Submitted' | 'Approved';
}

export async function setSupplement(
  moduleRecordId: string,
  payload: SetSupplementPayload,
): Promise<unknown> {
  return syncRequest('POST', `/services/${moduleRecordId}/supplement`, payload);
}

export async function getClaimServiceLifecycle(claimRef: string): Promise<ServiceLifecycleView[]> {
  const result = await syncRequest<{ services: ServiceLifecycleView[] }>(
    'GET',
    `/claims/${encodeURIComponent(claimRef)}/services`,
  );
  return result.services ?? [];
}

export async function removeService(moduleRecordId: string) {
  return syncRequest<{ ok: true; action: 'deleted' | 'archived' }>(
    'DELETE',
    `/services/${moduleRecordId}`,
  );
}

export async function restoreService(moduleRecordId: string) {
  return syncRequest('POST', `/services/${moduleRecordId}/restore`);
}

export async function addServicePayment(payload: {
  claimId: string;
  moduleId?: string;
  amount: number;
  category?: string;
  date?: string;
  entryName?: string;
  entryType?: string;
}) {
  return syncRequest('POST', '/payments', payload);
}
