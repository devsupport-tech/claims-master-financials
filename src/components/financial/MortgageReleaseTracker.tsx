import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Building2, CheckCircle, Clock, AlertCircle, Calendar, Pencil, Trash2 } from 'lucide-react';
import type { MortgageRelease } from '@/types';

interface MortgageReleaseTrackerProps {
  releases: MortgageRelease[];
  onEdit?: (record: any) => void;
  onDelete?: (record: any) => void;
}

const releaseStatusColors: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info'> = {
  'Pending Documents': 'warning',
  'Documents Submitted': 'secondary',
  'Under Review': 'info' as any,
  'Inspection Scheduled': 'default',
  'Check Issued': 'success',
  'Check Received': 'success',
  'Deposited': 'success',
};

const inspectionStatusColors: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  'Not Required': 'secondary',
  'Pending Request': 'warning',
  'Requested': 'warning',
  'Scheduled': 'default',
  'Completed': 'success',
  'Failed': 'destructive',
};

export function MortgageReleaseTracker({ releases, onEdit, onDelete }: MortgageReleaseTrackerProps) {
  if (releases.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Mortgage Releases
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No mortgage releases for this claim
          </div>
        </CardContent>
      </Card>
    );
  }

  // Get overview from first release (they share mortgage info)
  const firstRelease = releases[0];
  const totalHeld = (firstRelease as any)['Total Held by Mortgage'] || 0;
  const totalReleased = releases
    .filter((r: any) => ['Check Received', 'Deposited'].includes(r['Release Status']))
    .reduce((sum: number, r: any) => sum + (r['Release Amount'] || 0), 0);
  const remainingHeld = totalHeld - totalReleased;
  const releaseProgress = totalHeld > 0 ? (totalReleased / totalHeld) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Mortgage Releases
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overview Section */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
          <div>
            <div className="text-sm text-muted-foreground">Total Held</div>
            <div className="text-xl font-bold">{formatCurrency(totalHeld)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Released</div>
            <div className="text-xl font-bold text-green-600">{formatCurrency(totalReleased)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Remaining</div>
            <div className="text-xl font-bold text-orange-600">{formatCurrency(remainingHeld)}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Release Progress</span>
            <span>{releaseProgress.toFixed(0)}%</span>
          </div>
          <Progress value={releaseProgress} className="h-3" />
        </div>

        {/* Mortgage Company Info */}
        <div className="p-3 border rounded-lg">
          <div className="text-sm font-medium">{(firstRelease as any)['Mortgage Company']}</div>
          <div className="text-xs text-muted-foreground">
            Loan #: {(firstRelease as any)['Loan Number']}
          </div>
          {(firstRelease as any)['Contact Name'] && (
            <div className="text-xs text-muted-foreground mt-1">
              Contact: {(firstRelease as any)['Contact Name']} | {(firstRelease as any)['Contact Phone']}
            </div>
          )}
        </div>

        {/* Releases Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Release #</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Inspection</TableHead>
              <TableHead>Completion</TableHead>
              <TableHead>Dates</TableHead>
              {(onEdit || onDelete) && <TableHead className="w-[80px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {releases.map((release: any) => (
              <TableRow key={release.id}>
                <TableCell className="font-medium">#{release['Release Number']}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(release['Release Amount'] || 0)}
                </TableCell>
                <TableCell>
                  <Badge variant={releaseStatusColors[release['Release Status']] || 'secondary'}>
                    {release['Release Status']}
                  </Badge>
                </TableCell>
                <TableCell>
                  {release['Inspection Required'] ? (
                    <Badge variant={inspectionStatusColors[release['Inspection Status']] || 'secondary'}>
                      {release['Inspection Status']}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not Required</span>
                  )}
                </TableCell>
                <TableCell>
                  {release['Completion Percent'] !== undefined && (
                    <div className="flex items-center gap-2">
                      <Progress value={release['Completion Percent']} className="w-16 h-2" />
                      <span className="text-xs">{release['Completion Percent']}%</span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="text-xs space-y-1">
                    {release['Request Date'] && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Req: {formatDate(release['Request Date'])}
                      </div>
                    )}
                    {release['Inspection Date'] && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Insp: {formatDate(release['Inspection Date'])}
                      </div>
                    )}
                    {release['Check Date'] && (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-3 w-3" />
                        Check: {formatDate(release['Check Date'])}
                      </div>
                    )}
                  </div>
                </TableCell>
                {(onEdit || onDelete) && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {onEdit && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(release)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onDelete(release)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pending Inspections Alert */}
        {releases.filter((r: any) =>
          ['Pending Request', 'Requested', 'Scheduled'].includes(r['Inspection Status'])
        ).length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-yellow-800 dark:text-yellow-200">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">
              {releases.filter((r: any) =>
                ['Pending Request', 'Requested', 'Scheduled'].includes(r['Inspection Status'])
              ).length} inspection(s) pending
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
