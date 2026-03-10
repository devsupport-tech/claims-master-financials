import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { Wrench, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import type { JobCost } from '@/types';

interface JobCostingTableProps {
  costs: JobCost[];
}

const paymentStatusColors: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
  'Not Invoiced': 'secondary',
  'Invoiced': 'warning',
  'Partially Paid': 'default',
  'Paid': 'success',
};

export function JobCostingTable({ costs }: JobCostingTableProps) {
  // Calculate totals
  const totalBudget = costs.reduce((sum, c: any) => sum + (c['Xactimate Budget'] || 0), 0);
  const totalActual = costs.reduce((sum, c: any) => sum + (c['Actual Cost'] || 0), 0);
  const totalVariance = totalBudget - totalActual;
  const variancePercent = totalBudget > 0 ? (totalVariance / totalBudget) * 100 : 0;

  // Find problem areas (over budget)
  const overBudgetItems = costs.filter((c: any) => (c['Actual Cost'] || 0) > (c['Xactimate Budget'] || 0));

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
            <div className="text-sm text-muted-foreground">Xactimate Budget</div>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.map((cost: any) => {
                const budget = cost['Xactimate Budget'] || 0;
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
                <TableCell colSpan={2}></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
