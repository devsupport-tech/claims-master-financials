/**
 * Per-claim Financial Report — one ServiceLifecycleCard per service Module.
 *
 * Pulls:
 *   - Modules from Claims Master (the service catalog for this claim)
 *   - Job Costing rows from this base, joined by Module Record ID
 *   - Financial Ledger entries from this base, filtered to Inflows whose
 *     Category matches the Trade Category (or supplement separate-invoice label)
 *
 * Surfaces a "Supplement added" banner when the user toggles a Has Supplement
 * via the lifecycle endpoints; the banner is dismissed after acknowledgement.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getModulesForClaim, type ModuleRow } from '@/lib/claims-master';
import { formatCurrency } from '@/lib/utils';
import { getFinancialLedger, getJobCosting } from '@/lib/airtable';
import type { JobCost, LedgerEntry, ServiceLifecycleView } from '@/types';

interface Props {
  claimsMasterRecordId: string;
  /** Optional handler that opens the FinancialLedger Add Entry form pre-filled. */
  onAddPayment?: (defaults: { category: string; suggestedAmount?: number }) => void;
  /** Bubbles the freshly-built lifecycle views up so a parent can render
   *  per-service tabs without re-fetching. */
  onViewsChange?: (views: ServiceLifecycleView[]) => void;
  /** Bumping this number triggers a re-fetch — used by parents that just
   *  wrote new approved/submitted/supplement values and want the views to
   *  refresh without the user clicking the Refresh button. */
  refreshSignal?: number;
}

interface SupplementSnapshot {
  moduleId: string;
  hasSupplement: boolean;
  amount: number;
  mode: string;
  label?: string;
}

function snapshotKey(claimsMasterRecordId: string) {
  return `financial-report:supplement-snapshot:${claimsMasterRecordId}`;
}

function loadSnapshot(claimsMasterRecordId: string): SupplementSnapshot[] {
  try {
    const raw = sessionStorage.getItem(snapshotKey(claimsMasterRecordId));
    return raw ? (JSON.parse(raw) as SupplementSnapshot[]) : [];
  } catch {
    return [];
  }
}

function saveSnapshot(claimsMasterRecordId: string, snapshot: SupplementSnapshot[]) {
  try {
    sessionStorage.setItem(snapshotKey(claimsMasterRecordId), JSON.stringify(snapshot));
  } catch {
    /* no-op */
  }
}

function buildLifecycleViews(
  modules: ModuleRow[],
  jobCosts: JobCost[],
  ledger: LedgerEntry[],
): ServiceLifecycleView[] {
  // Index Job Costing rows by Module Record ID for fast join. The supplement
  // J' row uses a synthetic key `<moduleId>:supplement` written by
  // serviceLifecycleSync; recognize both shapes.
  const mainByModule = new Map<string, JobCost>();
  const supByModule = new Map<string, JobCost>();
  for (const j of jobCosts) {
    const mid = j['Module Record ID'];
    if (!mid) continue;
    if (mid.endsWith(':supplement')) {
      supByModule.set(mid.replace(':supplement', ''), j);
    } else {
      mainByModule.set(mid, j);
    }
  }

  return modules.map((m) => {
    const j = mainByModule.get(m.id);
    const jPrime = supByModule.get(m.id);

    const tradeCategory = j?.['Trade Category'] || m['Module Type'] || m['Module Name'];
    const supplementLabel =
      jPrime?.['Trade Category'] ||
      m['Supplement Separate Invoice Label'] ||
      `${tradeCategory} Supplement`;

    // Match payments by Category. For "Append" mode, only main category counts.
    // For "Separate" mode, the J' has its own ledger entries against the label.
    const mode = (m['Supplement Invoice Mode'] ??
      j?.['Supplement Invoice Mode'] ??
      'Append to invoice') as 'Append to invoice' | 'Separate invoice';
    const matchCategories = new Set<string>([tradeCategory]);
    if (mode === 'Separate invoice') matchCategories.add(supplementLabel);
    else matchCategories.add(supplementLabel); // Append mode: still credit explicit supplement payments

    const payments = ledger.filter(
      (e) => e.Direction === 'Inflow' && e.Category && matchCategories.has(e.Category),
    );
    const paidAmount = payments.reduce((sum, e) => sum + (Number(e.Amount) || 0), 0);

    return {
      moduleRecordId: m.id,
      serviceName: tradeCategory,
      billTo: m['Bill To'],
      operationStatus: m['Operation Status'],
      estimateStatus: m['Estimate Status'],
      submittedEstimateAmount: Number(j?.['Submitted Estimate Amount'] ?? 0),
      approvedEstimateAmount:
        Number(m['Approved Estimate Amount'] ?? j?.['Approved Estimate Amount'] ?? 0),
      hasSupplement: Boolean(m['Has Supplement'] ?? j?.['Has Supplement']),
      supplementApprovedAmount: Number(
        m['Supplement Approved Amount'] ?? j?.['Supplement Approved Amount'] ?? 0,
      ),
      supplementInvoiceMode: mode,
      supplementSeparateInvoiceLabel: supplementLabel,
      paidAmount,
      jobCosting: j,
      supplementJobCosting: jPrime,
      payments,
    } satisfies ServiceLifecycleView;
  });
}

export function FinancialReportTab({ claimsMasterRecordId, onAddPayment, onViewsChange, refreshSignal }: Props) {
  const [views, setViews] = useState<ServiceLifecycleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bannerEvents, setBannerEvents] = useState<
    { moduleId: string; serviceName: string; amount: number; mode: string; label?: string }[]
  >([]);
  const previousSnapshotRef = useRef<SupplementSnapshot[]>(loadSnapshot(claimsMasterRecordId));

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      // BOTH getJobCosting and getFinancialLedger filter by .Claim, but that
      // field links to the FINANCIALS Claim record, not Claims Master — so
      // passing the CM record id always returns 0 rows. Fetch unfiltered and
      // join client-side: Job Costing by Module Record ID, Ledger by the
      // Financials Claim id we discover from the matching Job Costing rows.
      const [modules, allLedgerRows, allJobCostRows] = await Promise.all([
        getModulesForClaim(claimsMasterRecordId),
        getFinancialLedger() as Promise<LedgerEntry[]>,
        getJobCosting() as Promise<JobCost[]>,
      ]);
      const moduleIdSet = new Set(modules.map((m) => m.id));
      const jobCostRows = allJobCostRows.filter((j) => {
        const mid = (j['Module Record ID'] ?? '').toString();
        // Strip the synthetic ":supplement" suffix when matching against M.
        const baseMid = mid.endsWith(':supplement') ? mid.slice(0, -':supplement'.length) : mid;
        return moduleIdSet.has(baseMid);
      });
      // Ledger rows share the same Financials Claim id as our matched J rows.
      // Collect those ids and keep only ledger entries that link to the same
      // claim — scopes the join correctly without depending on the broken
      // Claims-Master-id filter.
      const financialsClaimIds = new Set(
        jobCostRows
          .flatMap((j) => (Array.isArray(j.Claim) ? j.Claim : []))
          .filter((id): id is string => typeof id === 'string'),
      );
      const ledgerRows: LedgerEntry[] =
        financialsClaimIds.size > 0
          ? allLedgerRows.filter(
              (e) =>
                Array.isArray((e as { Claim?: unknown }).Claim) &&
                ((e as { Claim: string[] }).Claim).some((id) => financialsClaimIds.has(id)),
            )
          : [];
      const built = buildLifecycleViews(modules, jobCostRows, ledgerRows);
      setViews(built);
      onViewsChange?.(built);

      // Diff supplement state vs last snapshot to surface "supplement added" banners.
      const previous = previousSnapshotRef.current;
      const previousByModule = new Map(previous.map((p) => [p.moduleId, p]));
      const newEvents: typeof bannerEvents = [];
      const nextSnapshot: SupplementSnapshot[] = built.map((v) => {
        const prev = previousByModule.get(v.moduleRecordId);
        const becameSupp =
          v.hasSupplement && (!prev || !prev.hasSupplement || prev.amount !== v.supplementApprovedAmount);
        if (becameSupp && v.supplementApprovedAmount > 0) {
          newEvents.push({
            moduleId: v.moduleRecordId,
            serviceName: v.serviceName,
            amount: v.supplementApprovedAmount,
            mode: v.supplementInvoiceMode,
            label: v.supplementSeparateInvoiceLabel,
          });
        }
        return {
          moduleId: v.moduleRecordId,
          hasSupplement: v.hasSupplement,
          amount: v.supplementApprovedAmount,
          mode: v.supplementInvoiceMode,
          label: v.supplementSeparateInvoiceLabel,
        };
      });
      if (newEvents.length) setBannerEvents((b) => [...b, ...newEvents]);
      saveSnapshot(claimsMasterRecordId, nextSnapshot);
      previousSnapshotRef.current = nextSnapshot;
    } catch (e: any) {
      console.error('FinancialReportTab load failed:', e);
      setError(e?.message ?? 'Failed to load financial report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimsMasterRecordId, refreshSignal]);

  const totals = useMemo(() => {
    const approved = views.reduce(
      (sum, v) =>
        sum +
        v.approvedEstimateAmount +
        (v.hasSupplement ? v.supplementApprovedAmount : 0),
      0,
    );
    const paid = views.reduce((sum, v) => sum + v.paidAmount, 0);
    return { approved, paid, remaining: Math.max(0, approved - paid) };
  }, [views]);

  const dismissBanner = (moduleId: string) =>
    setBannerEvents((b) => b.filter((evt) => evt.moduleId !== moduleId));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Financial Report
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Per-service approved budget, paid ledger entries, and supplement state.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Approved</p>
            <p className="text-2xl font-bold">{formatCurrency(totals.approved)}</p>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Payments Received</p>
            <p className="text-2xl font-bold text-emerald-700">
              {formatCurrency(totals.paid)}
            </p>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending Payments</p>
            <p className="text-2xl font-bold text-orange-600">{formatCurrency(totals.remaining)}</p>
          </div>
        </CardContent>
      </Card>

      {bannerEvents.map((evt) => (
        <Card key={evt.moduleId} className="border-amber-300 bg-amber-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-start gap-2 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  Supplement added on {evt.serviceName} — {formatCurrency(evt.amount)} additional.
                </p>
                <p className="text-xs">
                  Mode: {evt.mode}
                  {evt.mode === 'Separate invoice' && evt.label ? ` · Invoice: ${evt.label}` : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onAddPayment?.({
                    category: evt.mode === 'Separate invoice' && evt.label ? evt.label : evt.serviceName,
                    suggestedAmount: evt.amount,
                  })
                }
                disabled={!onAddPayment}
              >
                Create Invoice Draft
              </Button>
              <Button size="sm" variant="ghost" onClick={() => dismissBanner(evt.moduleId)}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {error && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-3 text-sm text-red-800">{error}</CardContent>
        </Card>
      )}

      {loading && views.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading services…
          </CardContent>
        </Card>
      )}

      {!loading && views.length === 0 && !error && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No services on this claim yet. Add a service from Claims Master to see its financial
            report here.
          </CardContent>
        </Card>
      )}

      {/* Per-service ServiceLifecycleCards live in the tabs below — one tab
          per service. Rendering them here too would duplicate the surface. */}
    </div>
  );
}
