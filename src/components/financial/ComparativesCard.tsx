import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { BarChart3, ChevronDown } from 'lucide-react';
import type { ComparativeRow, ComparativesData } from '@/types';

interface ComparativesCardProps {
  data: ComparativesData;
}

function accuracyTier(pct: number): { variant: 'success' | 'warning' | 'destructive'; label: string } {
  if (pct >= 95) return { variant: 'success', label: 'Highly Accurate' };
  if (pct >= 85) return { variant: 'warning', label: 'Reasonable' };
  return { variant: 'destructive', label: 'Significant' };
}

function CompTable({ rows, groupLabel }: { rows: ComparativeRow[]; groupLabel: string }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
        No services with a submitted estimate yet.
      </div>
    );
  }

  // Roll the visible rows into a single Total. Variance / Accuracy % are
  // computed from the totals (not averaged across rows) so they reflect the
  // weighted aggregate.
  const totalSubmitted = rows.reduce((sum, r) => sum + r.submittedEstimate, 0);
  const totalApproved = rows.reduce((sum, r) => sum + r.approvedEstimate, 0);
  const totalVariance = totalSubmitted - totalApproved;
  const totalVariancePct = totalSubmitted > 0 ? (totalVariance / totalSubmitted) * 100 : 0;
  const totalAccuracyPct = totalSubmitted > 0
    ? Math.min(100, Math.max(0, (totalApproved / totalSubmitted) * 100))
    : 0;
  const totalServices = rows.reduce((sum, r) => sum + r.rowCount, 0);
  const totalTier = accuracyTier(totalAccuracyPct);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{groupLabel}</TableHead>
          <TableHead className="text-right">Submitted</TableHead>
          <TableHead className="text-right">Approved</TableHead>
          <TableHead className="text-right">Variance</TableHead>
          <TableHead className="text-right">Variance %</TableHead>
          <TableHead className="text-right">Accuracy %</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const tier = accuracyTier(row.accuracyPercent);
          return (
            <TableRow key={row.key}>
              <TableCell>
                <div className="font-medium">{row.key || '—'}</div>
                <div className="text-xs text-muted-foreground">
                  {row.rowCount} service{row.rowCount === 1 ? '' : 's'}
                </div>
              </TableCell>
              <TableCell className="text-right">{formatCurrency(row.submittedEstimate)}</TableCell>
              <TableCell className="text-right">{formatCurrency(row.approvedEstimate)}</TableCell>
              <TableCell className={`text-right font-medium ${row.variance > 0 ? 'text-orange-600' : 'text-emerald-700'}`}>
                {formatCurrency(row.variance)}
              </TableCell>
              <TableCell className="text-right text-sm">
                {row.variancePercent.toFixed(1)}%
              </TableCell>
              <TableCell className="text-right">
                <Badge variant={tier.variant} className="gap-1">
                  {row.accuracyPercent.toFixed(1)}%
                </Badge>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{tier.label}</div>
              </TableCell>
            </TableRow>
          );
        })}
        {/* Aggregate total — sums the visible rows. Excluded services (those
            without a Submitted Estimate) are intentionally not in this total. */}
        <TableRow className="border-t-2 bg-muted/40 font-semibold">
          <TableCell>
            <div>Total</div>
            <div className="text-xs font-normal text-muted-foreground">
              {totalServices} service{totalServices === 1 ? '' : 's'}
            </div>
          </TableCell>
          <TableCell className="text-right">{formatCurrency(totalSubmitted)}</TableCell>
          <TableCell className="text-right">{formatCurrency(totalApproved)}</TableCell>
          <TableCell className={`text-right ${totalVariance > 0 ? 'text-orange-600' : 'text-emerald-700'}`}>
            {formatCurrency(totalVariance)}
          </TableCell>
          <TableCell className="text-right">{totalVariancePct.toFixed(1)}%</TableCell>
          <TableCell className="text-right">
            <Badge variant={totalTier.variant} className="gap-1">
              {totalAccuracyPct.toFixed(1)}%
            </Badge>
            <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">{totalTier.label}</div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

export function ComparativesCard({ data }: ComparativesCardProps) {
  const [open, setOpen] = useState(true);
  const totalRows = data.byCarrier.length + data.byTradeCategory.length;

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={open}
        >
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Comparatives
            <span className="text-xs font-normal text-muted-foreground">
              Submitted vs Approved estimating performance
            </span>
          </CardTitle>
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-6">
          {totalRows === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              Enter Submitted Estimate Amounts on each service's Comparatives panel to populate this report.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  By Insurance
                </h3>
                <CompTable rows={data.byCarrier} groupLabel="Carrier" />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  By Trade Category
                </h3>
                <CompTable rows={data.byTradeCategory} groupLabel="Trade Category" />
              </div>
              <p className="text-xs text-muted-foreground">
                Accuracy tiers: <span className="text-emerald-700 font-medium">≥95%</span> highly accurate ·
                <span className="text-amber-700 font-medium"> 85–94%</span> reasonable variance ·
                <span className="text-red-600 font-medium"> &lt;85%</span> significant overestimation / carrier pushback.
              </p>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
