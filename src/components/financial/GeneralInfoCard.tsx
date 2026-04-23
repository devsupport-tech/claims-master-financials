import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { DollarSign, TrendingUp, Clock } from 'lucide-react';
import type { FinancialSummary } from '@/types';

interface GeneralInfoCardProps {
  summary: FinancialSummary;
}

export function GeneralInfoCard({ summary }: GeneralInfoCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">General Info</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Total Claim Value</span>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2 text-2xl font-bold">{formatCurrency(summary.totalRCV)}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Payments Received</span>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-green-600">{formatCurrency(summary.totalReceived)}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Pending Payments</span>
              <Clock className="h-4 w-4 text-orange-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-orange-600">{formatCurrency(summary.totalOutstanding)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
