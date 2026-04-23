import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, DollarSign, Building2, Home, Briefcase } from 'lucide-react';
import type { FinancialSummary } from '@/types';

interface FinancialSummaryCardProps {
  summary: FinancialSummary;
  variant?: 'full' | 'top' | 'rest';
}

export function FinancialSummaryCard({ summary, variant = 'full' }: FinancialSummaryCardProps) {
  const collectionProgress = summary.totalACV > 0
    ? (summary.totalReceived / summary.totalACV) * 100
    : 0;

  const totalRcvCard = (
    <Card key="rcv">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Total RCV</CardTitle>
        <DollarSign className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatCurrency(summary.totalRCV)}</div>
        <div className="text-xs text-muted-foreground mt-1">
          ACV: {formatCurrency(summary.totalACV)} | Dep: {formatCurrency(summary.totalDepreciation)}
        </div>
      </CardContent>
    </Card>
  );

  const totalReceivedCard = (
    <Card key="received">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Total Received</CardTitle>
        <TrendingUp className="h-4 w-4 text-green-600" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-green-600">{formatCurrency(summary.totalReceived)}</div>
        <Progress value={collectionProgress} className="mt-2" />
        <div className="text-xs text-muted-foreground mt-1">
          {collectionProgress.toFixed(0)}% collected
        </div>
      </CardContent>
    </Card>
  );

  const outstandingCard = (
    <Card key="outstanding">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
        <TrendingDown className="h-4 w-4 text-orange-600" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-orange-600">{formatCurrency(summary.totalOutstanding)}</div>
        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
          <div className="flex justify-between">
            <span>Mortgage Held:</span>
            <span>{formatCurrency(summary.mortgageHeld)}</span>
          </div>
          <div className="flex justify-between">
            <span>Depreciation:</span>
            <span>{formatCurrency(summary.depreciationRecoverable)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const grossProfitCard = (
    <Card key="profit">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
        <Briefcase className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${summary.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatCurrency(summary.grossProfit)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Margin: {summary.profitMargin.toFixed(1)}%
        </div>
      </CardContent>
    </Card>
  );

  const paymentSourcesCard = (
    <Card key="sources" className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Payment Sources</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              <span className="text-sm">Insurance Payments</span>
            </div>
            <span className="font-medium">{formatCurrency(summary.insurancePaymentsReceived)}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-green-600" />
              <span className="text-sm">Homeowner Payments</span>
            </div>
            <span className="font-medium">{formatCurrency(summary.homeownerPaymentsReceived)}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-purple-600" />
              <span className="text-sm">Mortgage Releases</span>
            </div>
            <span className="font-medium">{formatCurrency(summary.mortgageReleasesReceived)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const jobCostingCard = (
    <Card key="costing" className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Job Costing</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Xactimate Budget</span>
            <span className="font-medium">{formatCurrency(summary.totalBudget)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Actual Costs</span>
            <span className="font-medium">{formatCurrency(summary.totalActualCosts)}</span>
          </div>
          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-sm font-medium">Variance</span>
            <span className={`font-bold ${summary.totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(summary.totalVariance)} ({summary.variancePercent.toFixed(1)}%)
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (variant === 'top') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {totalRcvCard}
        {totalReceivedCard}
      </div>
    );
  }

  if (variant === 'rest') {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {outstandingCard}
        {grossProfitCard}
        {paymentSourcesCard}
        {jobCostingCard}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {totalRcvCard}
      {totalReceivedCard}
      {outstandingCard}
      {grossProfitCard}
      {paymentSourcesCard}
      {jobCostingCard}
    </div>
  );
}
