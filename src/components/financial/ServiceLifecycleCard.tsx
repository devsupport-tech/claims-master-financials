/**
 * Per-service lifecycle card for the Financials app — the canonical editor
 * for service-level $ fields.
 *
 * Read-only on Bill To / Operation / Estimate Status (those are owned by
 * Claims Master + Restoration Ops respectively). Editable here:
 *   - Approved Estimate Amount
 *   - Has Supplement + Supplement Approved Amount + Mode + Separate Label
 *   - Add Payment CTA (pre-fills ledger entry with Trade Category / J' label)
 *
 * VEC and Rest Ops just display these values and link out to this card.
 */
import { useEffect, useState, useMemo } from 'react';
import { ArrowRight, DollarSign, Save, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency } from '@/lib/utils';
import { derivePaymentStatus, paymentStatusBadge } from '@/lib/payment-status';
import {
  approveEstimate,
  setSupplement,
  type SupplementInvoiceMode,
} from '@/services/lifecycle-sync';
import type { ServiceLifecycleView } from '@/types';

interface Props {
  view: ServiceLifecycleView;
  /**
   * Pre-fills the FinancialLedger "Add Entry" form with a Category matching
   * either the main Trade Category or the supplement separate invoice label.
   */
  onAddPayment?: (defaults: { category: string; suggestedAmount?: number }) => void;
  /** Fired after a successful save so the parent can refetch. */
  onChanged?: () => void;
}

export function ServiceLifecycleCard({ view, onAddPayment, onChanged }: Props) {
  // Editable state — seeded from the view, kept in sync when the parent
  // re-fetches and the view object changes.
  const [approvedAmt, setApprovedAmt] = useState<number>(view.approvedEstimateAmount);
  const [hasSup, setHasSup] = useState<boolean>(view.hasSupplement);
  const [supAmt, setSupAmt] = useState<number>(view.supplementApprovedAmount);
  const [supMode, setSupMode] = useState<SupplementInvoiceMode>(view.supplementInvoiceMode);
  const [supLabel, setSupLabel] = useState<string>(
    view.supplementSeparateInvoiceLabel ?? `${view.serviceName} Supplement`,
  );
  const [busy, setBusy] = useState<'approve' | 'supplement' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => setApprovedAmt(view.approvedEstimateAmount), [view.approvedEstimateAmount]);
  useEffect(() => setHasSup(view.hasSupplement), [view.hasSupplement]);
  useEffect(() => setSupAmt(view.supplementApprovedAmount), [view.supplementApprovedAmount]);
  useEffect(() => setSupMode(view.supplementInvoiceMode), [view.supplementInvoiceMode]);
  useEffect(() => {
    if (view.supplementSeparateInvoiceLabel) setSupLabel(view.supplementSeparateInvoiceLabel);
  }, [view.supplementSeparateInvoiceLabel]);

  const handleSaveApproved = async () => {
    if (!approvedAmt || approvedAmt <= 0) {
      setError('Enter an Approved Estimate Amount greater than zero before saving.');
      return;
    }
    setBusy('approve');
    setError(null);
    setSuccess(null);
    try {
      await approveEstimate(view.moduleRecordId, { approvedAmount: approvedAmt });
      setSuccess('Approved amount saved and synced to all bases.');
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save approved amount');
    } finally {
      setBusy(null);
    }
  };

  const handleSaveSupplement = async () => {
    setBusy('supplement');
    setError(null);
    setSuccess(null);
    try {
      await setSupplement(view.moduleRecordId, {
        hasSupplement: hasSup,
        amount: hasSup ? supAmt : undefined,
        mode: hasSup ? supMode : undefined,
        separateInvoiceLabel: hasSup && supMode === 'Separate invoice' ? supLabel : undefined,
      });
      setSuccess(hasSup ? 'Supplement saved.' : 'Supplement removed.');
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save supplement');
    } finally {
      setBusy(null);
    }
  };

  const derived = useMemo(
    () =>
      derivePaymentStatus({
        approvedEstimateAmount: view.approvedEstimateAmount,
        supplementApprovedAmount: view.supplementApprovedAmount,
        supplementInvoiceMode: view.supplementInvoiceMode,
        hasSupplement: view.hasSupplement,
        paidAmount: view.paidAmount,
      }),
    [view],
  );
  const badge = paymentStatusBadge(derived.status);

  const billToTone =
    view.billTo === 'Insurance'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : 'bg-purple-50 text-purple-700 border-purple-200';
  const badgeTone =
    badge.tone === 'success'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : badge.tone === 'warning'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-slate-50 text-slate-700 border-slate-200';

  const denom =
    view.supplementInvoiceMode === 'Separate invoice'
      ? view.approvedEstimateAmount
      : derived.approvedTotal;
  const progress = denom > 0 ? Math.min(100, (view.paidAmount / denom) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            {view.serviceName}
          </CardTitle>
          <div className="flex flex-wrap gap-1">
            {view.billTo && (
              <Badge variant="outline" className={billToTone}>
                Bill: {view.billTo}
              </Badge>
            )}
            {view.operationStatus && (
              <Badge variant="outline" className="bg-slate-50 text-slate-700">
                Op: {view.operationStatus}
              </Badge>
            )}
            {view.estimateStatus && (
              <Badge
                variant="outline"
                className={
                  view.estimateStatus === 'Approved'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-50 text-slate-700'
                }
              >
                Est: {view.estimateStatus}
              </Badge>
            )}
            <Badge variant="outline" className={badgeTone}>
              {badge.label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Editable: Approved Estimate Amount — the canonical $ field. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <div>
            <Label htmlFor={`approved-${view.moduleRecordId}`} className="text-xs uppercase tracking-wide text-muted-foreground">
              Approved Estimate Amount
            </Label>
            <Input
              id={`approved-${view.moduleRecordId}`}
              type="number"
              min={0}
              step={0.01}
              value={approvedAmt}
              onChange={(e) => setApprovedAmt(Number(e.target.value))}
              className="mt-1"
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid</p>
            <p className="mt-2 text-lg font-semibold text-emerald-700">
              {formatCurrency(view.paidAmount)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Remaining</p>
            <p className="mt-2 text-lg font-semibold">{formatCurrency(derived.remaining)}</p>
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleSaveApproved}
              disabled={busy === 'approve' || approvedAmt === view.approvedEstimateAmount}
              size="sm"
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {busy === 'approve' ? 'Saving…' : view.approvedEstimateAmount > 0 ? 'Re-sync' : 'Approve & sync'}
            </Button>
          </div>
        </div>

        <div>
          <Progress value={progress} className="h-2" />
          <p className="mt-1 text-xs text-muted-foreground">
            {progress.toFixed(0)}% paid of {formatCurrency(denom)} (
            {view.supplementInvoiceMode === 'Separate invoice'
              ? 'main estimate only — supplement invoiced separately'
              : 'estimate + supplement'}
            )
          </p>
        </div>

        {/* Editable: Supplement on / off + amount + invoice mode + label. */}
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm">
          <div className="mb-2 flex items-center gap-2">
            <Checkbox
              id={`supplement-${view.moduleRecordId}`}
              checked={hasSup}
              onChange={(e) => setHasSup(e.target.checked)}
            />
            <Label htmlFor={`supplement-${view.moduleRecordId}`} className="cursor-pointer font-medium">
              Has Supplement
            </Label>
          </div>
          {hasSup && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Supplement Approved Amount
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={supAmt}
                  onChange={(e) => setSupAmt(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Invoice Mode
                </Label>
                <select
                  value={supMode}
                  onChange={(e) => setSupMode(e.target.value as SupplementInvoiceMode)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="Append to invoice">Append to invoice</option>
                  <option value="Separate invoice">Separate invoice</option>
                </select>
              </div>
              {supMode === 'Separate invoice' && (
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Separate Invoice Label
                  </Label>
                  <Input
                    type="text"
                    value={supLabel}
                    onChange={(e) => setSupLabel(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveSupplement}
              disabled={busy === 'supplement'}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {busy === 'supplement' ? 'Saving…' : 'Save Supplement'}
            </Button>
          </div>
        </div>

        {success && <p className="text-sm text-emerald-700">{success}</p>}
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {onAddPayment && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() =>
                onAddPayment({
                  category: view.serviceName,
                  suggestedAmount: derived.remaining,
                })
              }
            >
              <DollarSign className="h-4 w-4" />
              Add payment to {view.serviceName}
              <ArrowRight className="h-3 w-3" />
            </Button>
            {view.hasSupplement && view.supplementInvoiceMode === 'Separate invoice' && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() =>
                  onAddPayment({
                    category: view.supplementSeparateInvoiceLabel || `${view.serviceName} Supplement`,
                    suggestedAmount: view.supplementApprovedAmount,
                  })
                }
              >
                <DollarSign className="h-4 w-4" />
                Add payment to supplement
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
