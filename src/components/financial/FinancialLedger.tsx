import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Receipt, ArrowUpCircle, ArrowDownCircle, Filter, CheckCircle, Pencil, Trash2 } from 'lucide-react';
import type { LedgerEntry } from '@/types';

interface FinancialLedgerProps {
  entries: LedgerEntry[];
  onEdit?: (record: any) => void;
  onDelete?: (record: any) => void;
}

const entryTypeColors: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info'> = {
  'Insurance Payment': 'success',
  'Homeowner Payment': 'default',
  'Mortgage Release': 'info' as any,
  'Vendor Payment': 'destructive',
  'Adjustment': 'warning',
};

type FilterType = 'all' | 'inflow' | 'outflow';

export function FinancialLedger({ entries, onEdit, onDelete }: FinancialLedgerProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredEntries = entries.filter(entry => {
    if (filter === 'all') return true;
    return filter === 'inflow' ? entry.Direction === 'Inflow' : entry.Direction === 'Outflow';
  });

  // Calculate totals
  const totalInflow = entries
    .filter(e => e.Direction === 'Inflow')
    .reduce((sum, e) => sum + (e.Amount || 0), 0);

  const totalOutflow = entries
    .filter(e => e.Direction === 'Outflow')
    .reduce((sum, e) => sum + (e.Amount || 0), 0);

  const netBalance = totalInflow - totalOutflow;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Financial Ledger ({entries.length} entries)
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              All
            </Button>
            <Button
              variant={filter === 'inflow' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('inflow')}
            >
              <ArrowUpCircle className="h-4 w-4 mr-1 text-green-600" />
              Inflows
            </Button>
            <Button
              variant={filter === 'outflow' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('outflow')}
            >
              <ArrowDownCircle className="h-4 w-4 mr-1 text-red-600" />
              Outflows
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
          <div>
            <div className="text-sm text-muted-foreground">Total Inflows</div>
            <div className="text-xl font-bold text-green-600">{formatCurrency(totalInflow)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Total Outflows</div>
            <div className="text-xl font-bold text-red-600">{formatCurrency(totalOutflow)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Net Balance</div>
            <div className={`text-xl font-bold ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(netBalance)}
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        {filteredEntries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No ledger entries found
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Payer/Payee</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Check #</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reconciled</TableHead>
                {(onEdit || onDelete) && <TableHead className="w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry: any) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDate(entry.Date)}</TableCell>
                  <TableCell>
                    <Badge variant={entryTypeColors[entry['Entry Type']] || 'secondary'}>
                      {entry['Entry Type']}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{entry['Payer/Payee']}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {entry.Description || entry.Category || '—'}
                  </TableCell>
                  <TableCell>
                    {entry['Check Number'] ? (
                      <span className="text-xs font-mono">{entry['Check Number']}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {entry.Direction === 'Inflow' ? (
                        <ArrowUpCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowDownCircle className="h-4 w-4 text-red-600" />
                      )}
                      <span className={`font-medium ${entry.Direction === 'Inflow' ? 'text-green-600' : 'text-red-600'}`}>
                        {entry.Direction === 'Outflow' ? '-' : '+'}{formatCurrency(entry.Amount || 0)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {entry.Reconciled ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Pending</span>
                    )}
                  </TableCell>
                  {(onEdit || onDelete) && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {onEdit && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(entry)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {onDelete && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onDelete(entry)}>
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
        )}
      </CardContent>
    </Card>
  );
}
