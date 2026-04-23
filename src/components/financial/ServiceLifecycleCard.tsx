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
import { DollarSign, Save, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency } from '@/lib/utils';
import { derivePaymentStatus, paymentStatusBadge } from '@/lib/payment-status';
import { approveEstimate, setSupplement } from '@/services/lifecycle-sync';
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
  const [submittedAmt, setSubmittedAmt] = useState<number>(view.submittedEstimateAmount);
  const [approvedAmt, setApprovedAmt] = useState<number>(view.approvedEstimateAmount);
  const [hasSup, setHasSup] = useState<boolean>(view.hasSupplement);
  // "Final Approved Amount" = Approved Estimate + Supplement. The user types
  // the carrier's new full figure; we derive the supplement increment.
  const [finalApprovedAmt, setFinalApprovedAmt] = useState<number>(
    view.approvedEstimateAmount + view.supplementApprovedAmount,
  );
  const [busy, setBusy] = useState<'approve' | 'supplement' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => setSubmittedAmt(view.submittedEstimateAmount), [view.submittedEstimateAmount]);
  useEffect(() => setApprovedAmt(view.approvedEstimateAmount), [view.approvedEstimateAmount]);
  useEffect(() => setHasSup(view.hasSupplement), [view.hasSupplement]);
  useEffect(() => {
    setFinalApprovedAmt(view.approvedEstimateAmount + view.supplementApprovedAmount);
  }, [view.approvedEstimateAmount, view.supplementApprovedAmount]);

  const supplementIncrement = Math.max(0, finalApprovedAmt - approvedAmt);
  const totalClaimValue = approvedAmt + (hasSup ? supplementIncrement : 0);
  const comparativesDirty =
    submittedAmt !== view.submittedEstimateAmount || approvedAmt !== view.approvedEstimateAmount;
  const supplementPaid =
    hasSup && supplementIncrement > 0 && view.paidAmount >= approvedAmt + supplementIncrement;

  const handleSaveApproved = async () => {
    if (!approvedAmt || approvedAmt <= 0) {
      setError('Enter an Approved Estimate Amount greater than zero before saving.');
      return;
    }
    setBusy('approve');
    setError(null);
    setSuccess(null);
    try {
      await approveEstimate(view.moduleRecordId, {
        approvedAmount: approvedAmt,
        submittedAmount: submittedAmt,
      });
      setSuccess('Comparatives saved and synced to all bases.');
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save comparatives');
    } finally {
      setBusy(null);
    }
  };

  const handleSaveSupplement = async () => {
    setBusy('supplement');
    setError(null);
    setSuccess(null);
    try {
      // Always Append mode — the user enters the Final Approved Amount, and
      // we derive the supplement increment (Final − Approved Estimate).
      await setSupplement(view.moduleRecordId, {
        hasSupplement: hasSup,
        amount: hasSup ? supplementIncrement : undefined,
        mode: hasSup ? 'Append to invoice' : undefined,
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

  // "Client" = client-billed (purple). Any other truthy value — a carrier
  // name like "Allstate" or the legacy "Insurance" literal — is
  // insurance-billed (blue). Keeps the blue tone working now that VEC writes
  // carrier names instead of the literal "Insurance".
  const isInsuranceBilled = Boolean(view.billTo) && view.billTo !== 'Client';
  const billToTone = isInsuranceBilled
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
        {/* Comparatives — Submitted vs Approved estimate, with the rolled-up
            Total Claim Value (Approved + Supplement). Record Payment lives
            inline so the user can log a payment against the figure they're
            looking at. */}
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Comparatives
            </p>
            <Button
              onClick={handleSaveApproved}
              disabled={busy === 'approve' || !comparativesDirty}
              size="sm"
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {busy === 'approve' ? 'Saving…' : view.approvedEstimateAmount > 0 ? 'Re-sync' : 'Approve & sync'}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <Label htmlFor={`submitted-${view.moduleRecordId}`} className="text-xs uppercase tracking-wide text-muted-foreground">
                Submitted Estimate Amount
              </Label>
              <Input
                id={`submitted-${view.moduleRecordId}`}
                type="number"
                min={0}
                step={0.01}
                value={submittedAmt}
                onChange={(e) => setSubmittedAmt(Number(e.target.value))}
                className="mt-1"
                placeholder="First estimate sent to carrier"
              />
            </div>
            <div>
              <Label htmlFor={`approved-${view.moduleRecordId}`} className="text-xs uppercase tracking-wide text-muted-foreground">
                Approved Estimate Amount
              </Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  id={`approved-${view.moduleRecordId}`}
                  type="number"
                  min={0}
                  step={0.01}
                  value={approvedAmt}
                  onChange={(e) => setApprovedAmt(Number(e.target.value))}
                  className="flex-1"
                />
                {onAddPayment && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1 whitespace-nowrap"
                    onClick={() =>
                      onAddPayment({
                        category: view.serviceName,
                        suggestedAmount: derived.remaining,
                      })
                    }
                  >
                    <DollarSign className="h-4 w-4" />
                    Record Payment
                  </Button>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Total Claim Value
              </p>
              <p className="mt-2 text-2xl font-bold">{formatCurrency(totalClaimValue)}</p>
              <p className="text-xs text-muted-foreground">
                Approved + {hasSup ? `supplement (${formatCurrency(supplementIncrement)})` : '0 (no supplement)'}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid</p>
              <p className="text-lg font-semibold text-emerald-700">
                {formatCurrency(view.paidAmount)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Remaining</p>
              <p className="text-lg font-semibold">{formatCurrency(derived.remaining)}</p>
            </div>
            {submittedAmt > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Approved vs Submitted
                </p>
                <p
                  className={`text-lg font-semibold ${
                    approvedAmt - submittedAmt >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {approvedAmt - submittedAmt >= 0 ? '+' : ''}
                  {formatCurrency(approvedAmt - submittedAmt)}
                </p>
              </div>
            )}
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

        {/* Supplement (always Append mode — user enters Final Approved
            Amount and we derive the increment). */}
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm">
          <div className="mb-2 flex items-center gap-2">
            <Checkbox
              id={`supplement-${view.moduleRecordId}`}
              checked={hasSup}
              onChange={(e) => setHasSup(e.target.checked)}
            />
            <Label htmlFor={`supplement-${view.moduleRecordId}`} className="cursor-pointer font-medium">
              Add Supplement
            </Label>
          </div>
          {hasSup && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Final Approved Amount
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={finalApprovedAmt || ''}
                    onChange={(e) => setFinalApprovedAmt(Number(e.target.value))}
                    className="mt-1"
                    placeholder="Carrier's new total after supplement"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Supplement amount = Final Approved Amount − Approved Estimate Amount ={' '}
                    <span className="font-semibold">{formatCurrency(supplementIncrement)}</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3">
                <div className="text-sm">
                  <span className="text-muted-foreground">Supplement Amount: </span>
                  <span className="font-semibold">{formatCurrency(supplementIncrement)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {onAddPayment && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={supplementIncrement <= 0}
                      onClick={() =>
                        onAddPayment({
                          category: view.serviceName,
                          suggestedAmount: supplementIncrement,
                        })
                      }
                    >
                      <DollarSign className="h-4 w-4" />
                      Record Supplement Payment
                    </Button>
                  )}
                  <Badge variant={supplementPaid ? 'success' : 'warning'}>
                    Status: {supplementPaid ? 'Paid' : 'Pending'}
                  </Badge>
                </div>
              </div>
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

      </CardContent>
    </Card>
  );
}
