import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Save, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { InsuranceSubmissionChecklistKey } from '@/types';
import {
  buildChecklistFromModules,
  normalizeInsuranceSubmissionChecklist,
  serializeInsuranceSubmissionChecklist,
} from '@/lib/checklist';
import { getClaimChecklist, updateClaimChecklist, getModulesForClaim } from '@/lib/claims-master';

interface InsuranceSubmissionTrackerProps {
  claimsMasterRecordId: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

export function InsuranceSubmissionTracker({ claimsMasterRecordId }: InsuranceSubmissionTrackerProps) {
  const [checklist, setChecklist] = useState(() => buildChecklistFromModules([]));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hasModules, setHasModules] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError('');
      try {
        const [rawChecklist, modules] = await Promise.all([
          getClaimChecklist(claimsMasterRecordId),
          getModulesForClaim(claimsMasterRecordId),
        ]);
        if (!cancelled) {
          setHasModules(modules.length > 0);
          setChecklist(buildChecklistFromModules(modules, rawChecklist));
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('Failed to load submission data:', err);
          setError('Failed to load submission data.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [claimsMasterRecordId]);

  const totalSentToInsurance = useMemo(
    () => formatCurrency(checklist.totalSubmittedAmount),
    [checklist.totalSubmittedAmount]
  );

  const updateChecklistItem = (
    key: InsuranceSubmissionChecklistKey,
    field: 'submitted' | 'submittedDate' | 'amount' | 'amountReleased' | 'releaseDate' | 'notes',
    value: boolean | string | number
  ) => {
    setSuccess('');
    setError('');

    setChecklist((currentChecklist) =>
      normalizeInsuranceSubmissionChecklist({
        ...currentChecklist,
        items: currentChecklist.items.map((item) => {
          if (item.key !== key) {
            return item;
          }

          const isNumericField = field === 'amount' || field === 'amountReleased';
          const nextValue = isNumericField
            ? typeof value === 'number'
              ? value
              : Number(String(value).replace(/,/g, '').trim() || 0)
            : value;

          return {
            ...item,
            [field]: isNumericField && Number.isNaN(nextValue as number) ? 0 : nextValue,
          };
        }),
      })
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const json = serializeInsuranceSubmissionChecklist(checklist);
      await updateClaimChecklist(claimsMasterRecordId, json);
      setSuccess('Checklist saved. Submission totals are now stored on this claim.');
    } catch (err: any) {
      console.error('Failed to save checklist:', err);
      const details = err?.message || '';
      const normalized = String(details).toLowerCase();
      if (
        normalized.includes('unknown field name') ||
        (normalized.includes('checklist') && normalized.includes('field'))
      ) {
        setError('The "Checklist" field is missing in Airtable. Add it to the Claims table as a Long text field.');
      } else {
        setError('Unable to save the checklist right now. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading submission data...
        </CardContent>
      </Card>
    );
  }

  if (!hasModules) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No modules found for this claim. Add modules in Claims Master to track submissions.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Submitted to Insurance
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Track which deliverables were submitted and how much was sent to the carrier.
            </p>
          </div>
          <div className="rounded-lg border px-4 py-3 text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total Sent to Insurance
            </p>
            <p className="text-2xl font-bold">{totalSentToInsurance}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">Sent</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="w-[170px]">Submitted Date</TableHead>
                <TableHead className="w-[180px]">Amount Sent</TableHead>
                <TableHead className="w-[180px]">Amount Released</TableHead>
                <TableHead className="w-[170px]">Release Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checklist.items.map((item) => (
                <TableRow key={item.key}>
                  <TableCell>
                    <Checkbox
                      checked={item.submitted}
                      onChange={(e) =>
                        updateChecklistItem(item.key, 'submitted', (e.target as HTMLInputElement).checked)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{item.label}</div>
                  </TableCell>
                  <TableCell>
                    <input
                      type="date"
                      value={item.submittedDate || ''}
                      onChange={(e) =>
                        updateChecklistItem(item.key, 'submittedDate', e.target.value)
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.amount || ''}
                      onChange={(e) => updateChecklistItem(item.key, 'amount', e.target.value)}
                      placeholder="0.00"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.amountReleased || ''}
                      onChange={(e) => updateChecklistItem(item.key, 'amountReleased', e.target.value)}
                      placeholder="0.00"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      type="date"
                      value={item.releaseDate || ''}
                      onChange={(e) =>
                        updateChecklistItem(item.key, 'releaseDate', e.target.value)
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {success && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Checklist'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
