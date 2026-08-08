import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, DollarSign, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/utils'
import {
  applyContractorDefaults,
  createBudgetLine,
  createPlanningExpense,
  createPlanningPayment,
  deleteBudgetLine,
  deletePlanningExpense,
  getFinancialPlan,
  markPlanningFeeDue,
  updateBudgetLine,
  updatePlanningExpense,
  type BudgetCategory,
  type BudgetLine,
  type CalculationBasis,
  type CalculationMode,
  type ExpenseInput,
  type ExpenseKind,
  type FinancialPlan,
  type PlanningExpense,
} from '@/services/financial-planning'

const BUDGET_CATEGORIES: BudgetCategory[] = ['Labor', 'Materials', 'Subcontractors', 'Other']
const DIRECT_KINDS: ExpenseKind[] = ['Labor', 'Materials', 'Subcontractor', 'General', 'Other']
const BASES: CalculationBasis[] = ['Approved Revenue', 'Collected Revenue', 'Gross Profit Before Fees']
const MODES: CalculationMode[] = ['Percentage', 'Flat', 'Manual']

const emptyBudget = { category: 'Labor' as BudgetCategory, description: '', budgetAmount: 0, moduleId: null as string | null }
const emptyExpense: ExpenseInput = {
  name: '', expenseKind: 'Labor', payerName: 'CBRS Group', payeeName: '', amount: 0,
  moduleId: null, invoiceNumber: '', invoiceDate: '', dueDate: '', scopeNotes: '',
}
const emptyFee: ExpenseInput = {
  name: '', expenseKind: 'Commission', payerName: 'CBRS Group', payeeName: '', amount: 0,
  moduleId: null, dueDate: '', scopeNotes: '', calculationMode: 'Percentage',
  calculationBasis: 'Approved Revenue', ratePercent: 0,
}

function SelectField({ value, onChange, children, id }: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  id?: string
}) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
      {children}
    </select>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone ?? ''}`}>{formatCurrency(value)}</p>
    </div>
  )
}

interface BudgetCommissionsTabProps {
  claimRef: string
  refreshSignal?: number
  onChanged?: () => void
}

export function BudgetCommissionsTab({ claimRef, refreshSignal = 0, onChanged }: BudgetCommissionsTabProps) {
  const [plan, setPlan] = useState<FinancialPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [budget, setBudget] = useState({ ...emptyBudget })
  const [editingBudget, setEditingBudget] = useState<BudgetLine | null>(null)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [expense, setExpense] = useState<ExpenseInput>({ ...emptyExpense })
  const [editingExpense, setEditingExpense] = useState<PlanningExpense | null>(null)
  const [paymentExpense, setPaymentExpense] = useState<PlanningExpense | null>(null)
  const [payment, setPayment] = useState({ amount: 0, paymentDate: new Date().toISOString().slice(0, 10), method: '', checkNumber: '', notes: '' })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setPlan(await getFinancialPlan(claimRef))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [claimRef])

  useEffect(() => { void load() }, [load, refreshSignal])

  const directExpenses = useMemo(() => plan?.expenses.filter((row) =>
    row.expenseKind !== 'Commission' && row.expenseKind !== 'Referral Fee') ?? [], [plan])
  const fees = useMemo(() => plan?.expenses.filter((row) =>
    row.expenseKind === 'Commission' || row.expenseKind === 'Referral Fee') ?? [], [plan])
  const unappliedDefaults = plan?.availableTemplates.filter((template) => !template.alreadyApplied) ?? []

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
      onChanged?.()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function openBudget(row?: BudgetLine) {
    setEditingBudget(row ?? null)
    setBudget(row ? {
      category: row.category, description: row.description ?? '', budgetAmount: row.budgetAmount, moduleId: row.moduleId,
    } : { ...emptyBudget })
    setBudgetOpen(true)
  }

  async function saveBudget() {
    await run(async () => {
      if (editingBudget) await updateBudgetLine(editingBudget.id, budget)
      else await createBudgetLine(claimRef, budget)
      setBudgetOpen(false)
      await load()
    })
  }

  function openExpense(kind: 'cost' | 'fee', row?: PlanningExpense) {
    setEditingExpense(row ?? null)
    if (row) {
      setExpense({
        moduleId: row.moduleId,
        name: row.name,
        expenseKind: row.expenseKind,
        payerName: row.payerName ?? 'CBRS Group',
        payeeName: row.payeeName ?? '',
        amount: row.amount,
        invoiceNumber: row.invoiceNumber ?? '',
        invoiceDate: row.invoiceDate ?? '',
        dueDate: row.dueDate ?? '',
        scopeNotes: row.scopeNotes ?? '',
        calculationMode: row.calculationMode ?? undefined,
        calculationBasis: row.calculationBasis ?? undefined,
        ratePercent: row.ratePercent ?? undefined,
        feeState: row.feeState === 'Waived' ? 'Waived' : 'Projected',
      })
    } else {
      setExpense(kind === 'fee'
        ? { ...emptyFee, payeeName: plan?.claim.contractor ?? '', payerName: 'CBRS Group' }
        : { ...emptyExpense, payeeName: plan?.claim.contractor ?? '' })
    }
    setExpenseOpen(true)
  }

  async function saveExpense() {
    await run(async () => {
      const result = editingExpense
        ? await updatePlanningExpense(editingExpense.id, expense)
        : await createPlanningExpense(claimRef, expense)
      setPlan(result.plan)
      setExpenseOpen(false)
    })
  }

  function openPayment(row: PlanningExpense) {
    setPaymentExpense(row)
    setPayment({ amount: row.balance, paymentDate: new Date().toISOString().slice(0, 10), method: '', checkNumber: '', notes: '' })
  }

  if (loading) {
    return <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin" />Loading budget and commissions…</CardContent></Card>
  }
  if (!plan) {
    return <Card><CardContent className="py-10 text-center text-destructive">{error || 'Financial plan unavailable'}</CardContent></Card>
  }

  const m = plan.metrics
  const budgetByCategory = BUDGET_CATEGORIES.map((category) => ({
    category,
    total: plan.budgets.filter((row) => row.category === category).reduce((sum, row) => sum + row.budgetAmount, 0),
  }))

  return (
    <div className="space-y-5">
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Approved revenue" value={m.approvedRevenue} />
        <Metric label="Collected revenue" value={m.collectedRevenue} tone="text-emerald-700" />
        <Metric label="Budgeted direct cost" value={m.budgetedDirectCost} />
        <Metric label="Committed direct cost" value={m.committedDirectCost} />
        <Metric label="Gross profit before fees" value={m.grossProfitBeforeFees} />
        <Metric label="Projected profit" value={m.projectedProfit} tone={m.projectedProfit < 0 ? 'text-red-600' : 'text-emerald-700'} />
        <Metric label="Expected profit" value={m.expectedProfit} tone={m.expectedProfit < 0 ? 'text-red-600' : 'text-emerald-700'} />
        <Metric label="Cash profit" value={m.cashProfit} tone={m.cashProfit < 0 ? 'text-red-600' : 'text-emerald-700'} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Contractor and referral obligations</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Contractor: <strong>{plan.claim.contractor || 'Not assigned'}</strong> · Referral: <strong>{plan.claim.referralName || 'None'}</strong>
              </p>
            </div>
            <div className="flex gap-2">
              {unappliedDefaults.length > 0 && (
                <Button variant="outline" disabled={busy} onClick={() => run(async () => {
                  const result = await applyContractorDefaults(claimRef, unappliedDefaults.map((row) => row.id))
                  setPlan(result.plan)
                  const missing = result.skipped.filter((row) => row.reason !== 'Already applied')
                  if (missing.length > 0) setError(`${missing.length} default rule(s) were skipped because the claim is missing a payer or payee, such as a referral contact.`)
                })}>
                  <Check className="mr-1 h-4 w-4" /> Apply contractor defaults ({unappliedDefaults.length})
                </Button>
              )}
              <Button onClick={() => openExpense('fee')}><Plus className="mr-1 h-4 w-4" /> Add fee</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {plan.contractorDefaultsOutdated && (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              The claim contractor changed. Existing obligations were preserved; apply the current contractor's defaults if needed.
            </div>
          )}
          {fees.length === 0 ? <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">No commissions or referral fees yet.</p> : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Fee / project</TableHead><TableHead>Payer → payee</TableHead><TableHead>Basis</TableHead>
                  <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>{fees.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell><div className="font-medium">{row.name}</div><div className="text-xs text-muted-foreground">{plan.claim.claimCode} · {plan.claim.contractor || 'Unassigned'} · {row.expenseKind}</div></TableCell>
                    <TableCell>{row.payerName || '—'} → {row.payeeName || '—'}</TableCell>
                    <TableCell className="text-xs">
                      {row.calculationMode === 'Percentage'
                        ? `${row.ratePercent ?? 0}% of ${row.calculationBasis}`
                        : row.calculationMode ?? 'Manual'}
                      {row.staleProjectedAmount && <div className="text-amber-600">Recalculated preview</div>}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(row.effectiveAmount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.paidAmount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.balance)}</TableCell>
                    <TableCell><Badge variant={row.status === 'Paid' ? 'success' : row.status === 'Partial' || row.status === 'Due' ? 'warning' : 'secondary'}>{row.status}</Badge></TableCell>
                    <TableCell><div className="flex justify-end gap-1">
                      {row.status === 'Projected' && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => setPlan((await markPlanningFeeDue(row.id)).plan))}>Mark Due</Button>}
                      {row.status === 'Projected' && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => setPlan((await updatePlanningExpense(row.id, { feeState: 'Waived' })).plan))}>Waive</Button>}
                      {row.status === 'Waived' && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => setPlan((await updatePlanningExpense(row.id, { feeState: 'Projected' })).plan))}>Restore</Button>}
                      {(row.status === 'Due' || row.status === 'Partial') && row.balance > 0 && <Button size="sm" onClick={() => openPayment(row)}><DollarSign className="mr-1 h-3.5 w-3.5" /> Pay</Button>}
                      {row.status === 'Projected' && <Button size="icon" variant="ghost" onClick={() => openExpense('fee', row)}><Pencil className="h-4 w-4" /></Button>}
                      {(row.status === 'Projected' || row.status === 'Waived') && <Button size="icon" variant="ghost" className="text-red-600" disabled={busy} onClick={() => {
                        if (window.confirm(`Delete ${row.name}?`)) void run(async () => setPlan((await deletePlanningExpense(row.id)).plan))
                      }}><Trash2 className="h-4 w-4" /></Button>}
                    </div></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">Direct-cost budget</CardTitle><Button onClick={() => openBudget()}><Plus className="mr-1 h-4 w-4" /> Add budget line</Button></div></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">{budgetByCategory.map((row) => <Metric key={row.category} label={row.category} value={row.total} />)}</div>
          {m.remainingBudget < 0 && <p className="text-sm font-medium text-red-600">Committed costs are {formatCurrency(Math.abs(m.remainingBudget))} over the total budget.</p>}
          <div className="overflow-x-auto rounded-md border"><Table>
            <TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Service</TableHead><TableHead className="text-right">Budget</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{plan.budgets.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No budget lines yet.</TableCell></TableRow> : plan.budgets.map((row) => (
              <TableRow key={row.id}><TableCell>{row.category}</TableCell><TableCell>{row.description || '—'}</TableCell><TableCell>{plan.modules.find((module) => module.id === row.moduleId)?.name ?? 'Claim level'}</TableCell><TableCell className="text-right">{formatCurrency(row.budgetAmount)}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openBudget(row)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { if (window.confirm('Delete this budget line?')) void run(async () => { await deleteBudgetLine(row.id); await load() }) }}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
            ))}</TableBody>
          </Table></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">Labor, material, and other costs</CardTitle><Button onClick={() => openExpense('cost')}><Plus className="mr-1 h-4 w-4" /> Add cost</Button></div></CardHeader>
        <CardContent><div className="overflow-x-auto rounded-md border"><Table>
          <TableHeader><TableRow><TableHead>Cost</TableHead><TableHead>Payee</TableHead><TableHead>Service</TableHead><TableHead className="text-right">Committed</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{directExpenses.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No direct costs yet.</TableCell></TableRow> : directExpenses.map((row) => (
            <TableRow key={row.id}><TableCell><div className="font-medium">{row.name}</div><div className="text-xs text-muted-foreground">{row.expenseKind}</div></TableCell><TableCell>{row.payeeName || '—'}</TableCell><TableCell>{row.moduleName ?? 'Claim level'}</TableCell><TableCell className="text-right">{formatCurrency(row.effectiveAmount)}</TableCell><TableCell className="text-right">{formatCurrency(row.paidAmount)}</TableCell><TableCell className="text-right">{formatCurrency(row.balance)}</TableCell><TableCell><div className="flex justify-end gap-1">{row.balance > 0 && <Button size="sm" onClick={() => openPayment(row)}>Pay</Button>}<Button variant="ghost" size="icon" onClick={() => openExpense('cost', row)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { if (window.confirm(`Delete ${row.name}?`)) void run(async () => setPlan((await deletePlanningExpense(row.id)).plan)) }}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
          ))}</TableBody>
        </Table></div></CardContent>
      </Card>

      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}><DialogContent>
        <DialogHeader><DialogTitle>{editingBudget ? 'Edit budget line' : 'Add budget line'}</DialogTitle><DialogDescription>Budget at claim level or allocate it to one service.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div><Label>Category</Label><SelectField value={budget.category} onChange={(value) => setBudget({ ...budget, category: value as BudgetCategory })}>{BUDGET_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</SelectField></div>
          <div><Label>Description</Label><Input value={budget.description} onChange={(event) => setBudget({ ...budget, description: event.target.value })} /></div>
          <div><Label>Service</Label><SelectField value={budget.moduleId ?? ''} onChange={(value) => setBudget({ ...budget, moduleId: value || null })}><option value="">Claim level</option>{plan.modules.filter((row) => !row.archivedAt).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</SelectField></div>
          <div><Label>Budget amount</Label><Input type="number" min="0" step="0.01" value={budget.budgetAmount || ''} onChange={(event) => setBudget({ ...budget, budgetAmount: Number(event.target.value) })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setBudgetOpen(false)}>Cancel</Button><Button disabled={busy || budget.budgetAmount < 0} onClick={() => void saveBudget()}>{busy ? 'Saving…' : 'Save'}</Button></DialogFooter>
      </DialogContent></Dialog>

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{editingExpense ? 'Edit' : 'Add'} {expense.expenseKind === 'Commission' || expense.expenseKind === 'Referral Fee' ? 'fee obligation' : 'direct cost'}</DialogTitle><DialogDescription>Projected percentage fees recalculate until they are marked Due.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Type</Label><SelectField value={expense.expenseKind} onChange={(value) => setExpense({
            ...expense,
            expenseKind: value as ExpenseKind,
            payeeName: value === 'Referral Fee' ? plan.claim.referralName ?? expense.payeeName : value === 'Commission' ? plan.claim.contractor ?? expense.payeeName : expense.payeeName,
          })}>{(expense.expenseKind === 'Commission' || expense.expenseKind === 'Referral Fee' ? ['Commission', 'Referral Fee'] : DIRECT_KINDS).map((value) => <option key={value}>{value}</option>)}</SelectField></div>
          <div><Label>Name</Label><Input value={expense.name} onChange={(event) => setExpense({ ...expense, name: event.target.value })} /></div>
          <div><Label>Payer</Label><Input value={expense.payerName ?? ''} onChange={(event) => setExpense({ ...expense, payerName: event.target.value })} /></div>
          <div><Label>Payee / billing entity</Label><Input value={expense.payeeName} onChange={(event) => setExpense({ ...expense, payeeName: event.target.value })} /></div>
          <div><Label>Service</Label><SelectField value={expense.moduleId ?? ''} onChange={(value) => setExpense({ ...expense, moduleId: value || null })}><option value="">Claim level</option>{plan.modules.filter((row) => !row.archivedAt).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</SelectField></div>
          {(expense.expenseKind === 'Commission' || expense.expenseKind === 'Referral Fee') ? <>
            <div><Label>Calculation</Label><SelectField value={expense.calculationMode ?? 'Percentage'} onChange={(value) => setExpense({ ...expense, calculationMode: value as CalculationMode })}>{MODES.map((value) => <option key={value}>{value}</option>)}</SelectField></div>
            {expense.calculationMode === 'Percentage' ? <><div><Label>Basis</Label><SelectField value={expense.calculationBasis ?? 'Approved Revenue'} onChange={(value) => setExpense({ ...expense, calculationBasis: value as CalculationBasis })}>{BASES.map((value) => <option key={value}>{value}</option>)}</SelectField></div><div><Label>Rate %</Label><Input type="number" min="0" max="100" step="0.01" value={expense.ratePercent ?? ''} onChange={(event) => setExpense({ ...expense, ratePercent: Number(event.target.value) })} /></div></> : <div><Label>Amount</Label><Input type="number" min="0" step="0.01" value={expense.amount || ''} onChange={(event) => setExpense({ ...expense, amount: Number(event.target.value) })} /></div>}
          </> : <><div><Label>Amount</Label><Input type="number" min="0" step="0.01" value={expense.amount || ''} onChange={(event) => setExpense({ ...expense, amount: Number(event.target.value) })} /></div><div><Label>Invoice number</Label><Input value={expense.invoiceNumber ?? ''} onChange={(event) => setExpense({ ...expense, invoiceNumber: event.target.value })} /></div><div><Label>Invoice date</Label><Input type="date" value={expense.invoiceDate ?? ''} onChange={(event) => setExpense({ ...expense, invoiceDate: event.target.value })} /></div></>}
          <div><Label>Due date</Label><Input type="date" value={expense.dueDate ?? ''} onChange={(event) => setExpense({ ...expense, dueDate: event.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Scope / notes</Label><Textarea value={expense.scopeNotes ?? ''} onChange={(event) => setExpense({ ...expense, scopeNotes: event.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setExpenseOpen(false)}>Cancel</Button><Button disabled={busy || !expense.name.trim() || !expense.payeeName.trim()} onClick={() => void saveExpense()}>{busy ? 'Saving…' : 'Save'}</Button></DialogFooter>
      </DialogContent></Dialog>

      <Dialog open={Boolean(paymentExpense)} onOpenChange={(open) => { if (!open) setPaymentExpense(null) }}><DialogContent>
        <DialogHeader><DialogTitle>Record payment</DialogTitle><DialogDescription>{paymentExpense?.name} · remaining {formatCurrency(paymentExpense?.balance ?? 0)}</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2"><div><Label>Amount</Label><Input type="number" min="0.01" max={paymentExpense?.balance} step="0.01" value={payment.amount || ''} onChange={(event) => setPayment({ ...payment, amount: Number(event.target.value) })} /></div><div><Label>Payment date</Label><Input type="date" value={payment.paymentDate} onChange={(event) => setPayment({ ...payment, paymentDate: event.target.value })} /></div><div><Label>Method</Label><Input placeholder="Check, ACH, cash…" value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })} /></div><div><Label>Check / reference</Label><Input value={payment.checkNumber} onChange={(event) => setPayment({ ...payment, checkNumber: event.target.value })} /></div><div className="sm:col-span-2"><Label>Notes</Label><Textarea value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} /></div></div>
        <DialogFooter><Button variant="outline" onClick={() => setPaymentExpense(null)}>Cancel</Button><Button disabled={busy || payment.amount <= 0 || payment.amount > (paymentExpense?.balance ?? 0)} onClick={() => paymentExpense && void run(async () => { const result = await createPlanningPayment(paymentExpense.id, payment); setPlan(result.plan); setPaymentExpense(null) })}>{busy ? 'Saving…' : 'Record payment'}</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  )
}
