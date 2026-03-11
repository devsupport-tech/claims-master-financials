import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Briefcase,
  FileText,
  Users,
  Wrench,
  Receipt,
  Building2,
  BarChart3,
} from 'lucide-react';
import type { PortfolioOverviewData } from '@/lib/airtable';

interface PortfolioOverviewProps {
  data: PortfolioOverviewData;
}

const typeBadgeColors: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  Ledger: 'success',
  Report: 'default',
  Release: 'secondary',
  Cost: 'warning',
};

const typeIcons: Record<string, typeof Receipt> = {
  Ledger: Receipt,
  Report: FileText,
  Release: Building2,
  Cost: Wrench,
};

export function PortfolioOverview({ data }: PortfolioOverviewProps) {
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div>
        <h2 className="text-2xl font-bold">Portfolio Overview</h2>
        <p className="text-muted-foreground">Aggregate financials across all claims</p>
      </div>

      {/* Claim Status Badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{data.totalClaims} total claims</span>
        </div>
        {Object.entries(data.claimsByStatus).map(([status, count]) => (
          <Badge key={status} variant="outline" className="text-xs">
            {status}: {count}
          </Badge>
        ))}
      </div>

      {/* Totals Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Total RCV */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total RCV</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.totalRCV)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              ACV: {formatCurrency(data.totalACV)}
            </div>
          </CardContent>
        </Card>

        {/* Total Received */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Received</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(data.totalReceived)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              All inflows across claims
            </div>
          </CardContent>
        </Card>

        {/* Outstanding */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <TrendingDown className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(data.totalOutstanding)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Remaining to collect
            </div>
          </CardContent>
        </Card>

        {/* Gross Profit */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(data.grossProfit)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Margin: {data.profitMargin.toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        {/* Job Costing Budget */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Job Costing</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.totalBudget)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Actual: {formatCurrency(data.totalActualCosts)}
            </div>
          </CardContent>
        </Card>

        {/* Variance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Budget Variance</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(data.totalVariance)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {data.totalVariance >= 0 ? 'Under' : 'Over'} budget by {Math.abs(data.variancePercent).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Recently Updated
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentActivity.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recent activity
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Claim</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentActivity.map((item) => {
                  const Icon = typeIcons[item.type] || FileText;
                  return (
                    <TableRow key={`${item.type}-${item.id}`}>
                      <TableCell className="text-sm">
                        {item.date ? formatDate(item.date) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={typeBadgeColors[item.type] || 'secondary'} className="gap-1">
                          <Icon className="h-3 w-3" />
                          {item.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.claimId}</TableCell>
                      <TableCell className="max-w-[250px] truncate">{item.name}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.amount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
