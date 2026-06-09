/**
 * Startup reconciliation — no-op in the single-Supabase setup.
 *
 * The original implementation POSTed to /api/sync/reconcile, which kicked off
 * a three-base Airtable lifecycle sweep. With one database, there is no
 * cross-DB drift to heal, so this is a stub. Kept as an export so existing
 * call sites (App.tsx) don't need to change.
 */

export function scheduleStartupReconcile(): void {
  /* no-op */
}
