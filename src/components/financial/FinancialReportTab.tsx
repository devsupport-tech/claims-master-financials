/**
 * Per-claim Financial Report — one ServiceLifecycleCard per service Module.
 *
 * Pulls a claim-scoped joined lifecycle view from the Financials sidecar.
 *
 * Surfaces a "Supplement added" banner when the user toggles a Has Supplement
 * via the lifecycle endpoints; the banner is dismissed after acknowledgement.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { getClaimServiceLifecycle } from '@/services/lifecycle-sync';
import type { ServiceLifecycleView } from '@/types';

interface Props {
  claimsMasterRecordId: string;
  /** Optional handler that opens the FinancialLedger Add Entry form pre-filled. */
  onAddPayment?: (defaults: { moduleId: string; category: string; suggestedAmount?: number }) => void;
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
      const built = await getClaimServiceLifecycle(claimsMasterRecordId);
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
                    moduleId: evt.moduleId,
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
