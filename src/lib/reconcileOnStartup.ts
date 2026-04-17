/**
 * Debounced startup reconcile ping for the financials app.
 *
 * Hits the sidecar's /api/sync/reconcile endpoint at most once per tab session
 * (30-minute cooldown via sessionStorage). The sidecar then runs the same
 * three-sweep reconciliation across this contractor's three Airtable bases
 * — see serviceLifecycleSync.reconcileServiceLifecycle().
 *
 * Sibling copies in:
 *   - Claims-Master-VEC/dashboard/src/lib/reconcileOnStartup.ts
 *   - restoration-ops-austin/src/lib/reconcileOnStartup.ts
 */

const STORAGE_KEY = 'service-lifecycle-reconcile:lastRun';
const COOLDOWN_MS = 30 * 60 * 1000;

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

export function scheduleStartupReconcile(): void {
  if (typeof window === 'undefined') return;

  const last = Number(sessionStorage.getItem(STORAGE_KEY) ?? 0);
  if (Number.isFinite(last) && Date.now() - last < COOLDOWN_MS) return;

  sessionStorage.setItem(STORAGE_KEY, String(Date.now()));

  const run = () => {
    fetch(`${API_BASE}/sync/reconcile`, { method: 'POST' }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[startup reconcile] failed (best-effort):', err);
    });
  };

  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void })
      .requestIdleCallback(run);
  } else {
    setTimeout(run, 2000);
  }
}
