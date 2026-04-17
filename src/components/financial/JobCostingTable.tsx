import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { Wrench, TrendingUp, TrendingDown, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import type { JobCost } from '@/types';

interface JobCostingTableProps {
  costs: JobCost[];
  onEdit?: (record: any) => void;
  onDelete?: (record: any) => void;
}

const paymentStatusColors: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
  'Not Invoiced': 'secondary',
  'Invoiced': 'warning',
  'Partially Paid': 'default',
  'Paid': 'success',
};

// "Budget" for a Job Costing row is whichever of these is set (in priority):
//   1. Xactimate Budget — manually entered for trade subcontracts
//   2. Approved Estimate Amount + Supplement — written by the lifecycle
//      approve-estimate flow (used for service-style trades)
// The two were treated as separate fields, but for display purposes they
// represent the same concept: how much we approved for this trade.
function rowBudget(c: any): number {
  const xact = Number(c['Xactimate Budget']) || 0;
  if (xact > 0) return xact;
  const approved = Number(c['Approved Estimate Amount']) || 0;
  const sup = c['Has Supplement'] ? Number(c['Supplement Approved Amount']) || 0 : 0;
  return approved + sup;
}

export function JobCostingTable({ costs, onEdit, onDelete }: JobCostingTableProps) {
  // Calculate totals
  const totalBudget = costs.reduce((sum, c: any) => sum + rowBudget(c), 0);
  const totalActual = costs.reduce((sum, c: any) => sum + (c['Actual Cost'] || 0), 0);
  const totalVariance = totalBudget - totalActual;
  const variancePercent = totalBudget > 0 ? (totalVariance / totalBudget) * 100 : 0;

  // Find problem areas (over budget)
  const overBudgetItems = costs.filter((c: any) => (c['Actual Cost'] || 0) > rowBudget(c));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          Job Costing ({costs.length} trades)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
          <div>
            <div className="text-sm text-muted-foreground">Approved Budget</div>
            <div className="text-xl font-bold">{formatCurrency(totalBudget)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Actual Costs</div>
            <div className="text-xl font-bold">{formatCurrency(totalActual)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Variance</div>
            <div className={`text-xl font-bold ${totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totalVariance)}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Margin</div>
            <div className={`text-xl font-bold ${totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPercent(variancePercent)}
            </div>
          </div>
        </div>

        {/* Budget Progress */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Budget Utilization</span>
            <span>{totalBudget > 0 ? ((totalActual / totalBudget) * 100).toFixed(0) : 0}%</span>
          </div>
          <Progress
            value={totalBudget > 0 ? Math.min((totalActual / totalBudget) * 100, 100) : 0}
            className={`h-3 ${totalActual > totalBudget ? '[&>div]:bg-red-500' : ''}`}
          />
        </div>

        {/* Warning for over-budget items */}
        {overBudgetItems.length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-800 dark:text-red-200">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">
              {overBudgetItems.length} trade(s) over budget
            </span>
          </div>
        )}

        {/* Job Costing Table */}
        {costs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No job costing entries found
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trade Category</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Payment</TableHead>
                {(onEdit || onDelete) && <TableHead className="w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.map((cost: any) => {
                const budget = rowBudget(cost);
                const actual = cost['Actual Cost'] || 0;
                const variance = budget - actual;
                const progress = budget > 0 ? (actual / budget) * 100 : 0;
                const isOverBudget = actual > budget;

                return (
                  <TableRow key={cost.id} className={isOverBudget ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                    <TableCell className="font-medium">{cost['Trade Category']}</TableCell>
                    <TableCell>{cost['Vendor/Subcontractor']}</TableCell>
                    <TableCell className="text-right">{formatCurrency(budget)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(actual)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {variance >= 0 ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        )}
                        <span className={variance >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {formatCurrency(variance)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={Math.min(progress, 100)}
                          className={`w-16 h-2 ${isOverBudget ? '[&>div]:bg-red-500' : ''}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {progress.toFixed(0)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={paymentStatusColors[cost['Payment Status']] || 'secondary'}>
                        {cost['Payment Status']}
                      </Badge>
                    </TableCell>
                    {(onEdit || onDelete) && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {onEdit && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(cost)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {onDelete && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onDelete(cost)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-bold">Total</TableCell>
                <TableCell className="text-right font-bold">{formatCurrency(totalBudget)}</TableCell>
                <TableCell className="text-right font-bold">{formatCurrency(totalActual)}</TableCell>
                <TableCell className="text-right">
                  <span className={`font-bold ${totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(totalVariance)}
                  </span>
                </TableCell>
                <TableCell colSpan={(onEdit || onDelete) ? 3 : 2}></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
