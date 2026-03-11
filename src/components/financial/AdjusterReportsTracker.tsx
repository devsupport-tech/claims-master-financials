import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';
import { FileText, TrendingUp, TrendingDown, Pencil, Trash2 } from 'lucide-react';
import type { AdjusterReport } from '@/types';

interface AdjusterReportsTrackerProps {
  reports: AdjusterReport[];
  onEdit?: (record: any) => void;
  onDelete?: (record: any) => void;
}

const statusColors: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  'Pending': 'warning',
  'Received': 'secondary',
  'Under Review': 'info' as any,
  'Approved': 'success',
  'Disputed': 'destructive',
};

const reportTypeColors: Record<string, 'default' | 'secondary' | 'outline'> = {
  'Initial Estimate': 'default',
  'Supplement': 'secondary',
  'Re-inspection': 'outline',
  'Final': 'default',
};

export function AdjusterReportsTracker({ reports, onEdit, onDelete }: AdjusterReportsTrackerProps) {
  // Sort reports by version to show progression
  const sortedReports = [...reports].sort((a, b) => a.Version - b.Version);

  // Calculate changes between versions
  const getChangeFromPrevious = (report: AdjusterReport, index: number) => {
    if (index === 0) return null;
    const prev = sortedReports[index - 1];
    return {
      rcvChange: report['RCV Amount'] - prev['RCV Amount'],
      acvChange: report['ACV Amount'] - prev['ACV Amount'],
    };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Adjuster Reports ({reports.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No adjuster reports found for this claim
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Adjuster</TableHead>
                <TableHead className="text-right">RCV</TableHead>
                <TableHead className="text-right">ACV</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead>Status</TableHead>
                {(onEdit || onDelete) && <TableHead className="w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedReports.map((report, index) => {
                const change = getChangeFromPrevious(report, index);
                return (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">v{report.Version}</TableCell>
                    <TableCell>
                      <Badge variant={reportTypeColors[report['Report Type']] || 'default'}>
                        {report['Report Type']}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(report['Report Date'])}</TableCell>
                    <TableCell>{report['Adjuster Name']}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(report['RCV Amount'])}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(report['ACV Amount'])}
                    </TableCell>
                    <TableCell className="text-right">
                      {change ? (
                        <div className="flex items-center justify-end gap-1">
                          {change.rcvChange >= 0 ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          )}
                          <span className={change.rcvChange >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {change.rcvChange >= 0 ? '+' : ''}{formatCurrency(change.rcvChange)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColors[report['Status']] || 'secondary'}>
                        {report['Status']}
                      </Badge>
                    </TableCell>
                    {(onEdit || onDelete) && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {onEdit && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(report)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {onDelete && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onDelete(report)}>
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
          </Table>
        )}

        {/* Summary row */}
        {sortedReports.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Latest estimate (v{sortedReports[sortedReports.length - 1]?.Version})
              </span>
              <div className="text-right">
                <div className="font-bold">
                  RCV: {formatCurrency(sortedReports[sortedReports.length - 1]?.['RCV Amount'] || 0)}
                </div>
                <div className="text-sm text-muted-foreground">
                  ACV: {formatCurrency(sortedReports[sortedReports.length - 1]?.['ACV Amount'] || 0)}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
