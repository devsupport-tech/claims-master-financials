import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { DollarSign, Hammer, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import type { CostPayment, ProjectExpense } from '@/types';

interface ProjectExpensesTableProps {
  serviceName: string;
  expenses: ProjectExpense[];
  payments: CostPayment[];
  onAdd: () => void;
  onEdit: (expense: ProjectExpense) => void;
  onDelete: (expense: ProjectExpense) => void;
  onLogPayment: (expense: ProjectExpense, balanceDue: number) => void;
}

interface ExpenseRow extends ProjectExpense {
  paid: number;
  balance: number;
  status: 'Paid' | 'Partial' | 'Pending';
}

export function ProjectExpensesTable({
  serviceName,
  expenses,
  payments,
  onAdd,
  onEdit,
  onDelete,
  onLogPayment,
}: ProjectExpensesTableProps) {
  const rows = useMemo<ExpenseRow[]>(() => {
    return expenses.map((expense) => {
      const paid = payments
        .filter(
          (p) => Array.isArray(p['Project Expense']) && p['Project Expense'].includes(expense.id),
        )
        .reduce((sum, p) => sum + (Number(p.Amount) || 0), 0);
      const amount = Number(expense.Amount) || 0;
      const balance = amount - paid;
      let status: 'Paid' | 'Partial' | 'Pending' = 'Pending';
      if (amount > 0 && balance <= 0) status = 'Paid';
      else if (paid > 0) status = 'Partial';
      return { ...expense, paid, balance, status };
    });
  }, [expenses, payments]);

  const totalAmount = rows.reduce((sum, r) => sum + (Number(r.Amount) || 0), 0);
  const totalPaid = rows.reduce((sum, r) => sum + r.paid, 0);
  const totalBalance = totalAmount - totalPaid;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Hammer className="h-5 w-5 text-muted-foreground" />
            Job Costing — {serviceName}
          </CardTitle>
          <Button size="sm" onClick={onAdd} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Job Cost
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Job Costing</p>
            <p className="mt-1 text-xl font-bold">{formatCurrency(totalAmount)}</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Paid</p>
            <p className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(totalPaid)}</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Balance</p>
            <p
              className={`mt-1 text-xl font-bold ${totalBalance > 0 ? 'text-orange-600' : 'text-emerald-700'}`}
            >
              {formatCurrency(totalBalance)}
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            No project expenses logged for this service yet. Click <strong>Add Job Cost</strong> to start.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project Expenses</TableHead>
                <TableHead>Billing Entity</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead className="text-right">Amount to pay</TableHead>
                <TableHead className="text-right">Paid amount</TableHead>
                <TableHead className="text-right">Balance/Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[180px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row['Cost Name'] || '—'}</div>
                    {row['Project Expense Category'] && (
                      <div className="text-xs text-muted-foreground">{row['Project Expense Category']}</div>
                    )}
                  </TableCell>
                  <TableCell>{row['Billing Entity'] || '—'}</TableCell>
                  <TableCell className="text-xs">
                    {row['Invoice Number'] ? (
                      <div className="font-mono">{row['Invoice Number']}</div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {row['Invoice Date'] && (
                      <div className="text-muted-foreground">{row['Invoice Date']}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(Number(row.Amount) || 0)}
                  </TableCell>
                  <TableCell className="text-right text-emerald-700">
                    {formatCurrency(row.paid)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      row.balance > 0 ? 'text-orange-600' : 'text-emerald-700'
                    }`}
                  >
                    {formatCurrency(row.balance)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.status === 'Paid'
                          ? 'success'
                          : row.status === 'Partial'
                            ? 'warning'
                            : 'secondary'
                      }
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => onLogPayment(row, row.balance)}
                        title="Log Payment"
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        Log Payment
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => onEdit(row)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => onDelete(row)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Receipt className="h-3 w-3" />
          Each row tracks its own payment history via the <strong className="mx-1">Log Payment</strong> action.
        </p>
      </CardContent>
    </Card>
  );
}
