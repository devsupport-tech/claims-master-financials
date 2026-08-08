import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'

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
  createFeeTemplate,
  deactivateFeeTemplate,
  getFeeTemplates,
  updateFeeTemplate,
  type CalculationBasis,
  type CalculationMode,
  type FeeTemplate,
  type FeeType,
  type PartyRole,
} from '@/services/financial-planning'

const ROLES: PartyRole[] = ['CBRS Group', 'Contractor', 'Referral', 'Fixed']
const BASES: CalculationBasis[] = ['Approved Revenue', 'Collected Revenue', 'Gross Profit Before Fees']
const MODES: CalculationMode[] = ['Percentage', 'Flat', 'Manual']

type EditableTemplate = Omit<FeeTemplate, 'id'>
const emptyTemplate: EditableTemplate = {
  contractorName: '', label: '', feeType: 'Commission', payerRole: 'CBRS Group', payeeRole: 'Contractor',
  fixedPayerName: null, fixedPayeeName: null, calculationMode: 'Percentage',
  calculationBasis: 'Approved Revenue', ratePercent: 0, defaultAmount: null, active: true, notes: null,
}

function SelectField({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{children}</select>
}

export function ContractorTerms() {
  const [templates, setTemplates] = useState<FeeTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FeeTemplate | null>(null)
  const [form, setForm] = useState<EditableTemplate>({ ...emptyTemplate })

  const load = useCallback(async () => {
    setLoading(true)
    try { setTemplates(await getFeeTemplates()); setError('') }
    catch (err) { setError((err as Error).message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  function edit(row?: FeeTemplate) {
    setEditing(row ?? null)
    setForm(row ? { ...row } : { ...emptyTemplate })
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      if (editing) await updateFeeTemplate(editing.id, form)
      else await createFeeTemplate(form)
      setOpen(false)
      await load()
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Contractor Terms</h1><p className="mt-1 text-sm text-muted-foreground">Reusable commission and referral defaults. Applying a rule to a claim is always explicit.</p></div>
        <Button onClick={() => edit()}><Plus className="mr-1 h-4 w-4" /> Add rule</Button>
      </div>
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      <Card><CardHeader><CardTitle className="text-base">Fee rules</CardTitle></CardHeader><CardContent>
        {loading ? <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin" />Loading terms…</div> : (
          <div className="overflow-x-auto rounded-md border"><Table>
            <TableHeader><TableRow><TableHead>Contractor</TableHead><TableHead>Rule</TableHead><TableHead>Type</TableHead><TableHead>Payer → payee</TableHead><TableHead>Calculation</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{templates.length === 0 ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No reusable contractor terms yet.</TableCell></TableRow> : templates.map((row) => (
              <TableRow key={row.id}><TableCell className="font-medium">{row.contractorName}</TableCell><TableCell>{row.label}</TableCell><TableCell>{row.feeType}</TableCell><TableCell>{row.payerRole} → {row.payeeRole}</TableCell><TableCell>{row.calculationMode === 'Percentage' ? `${row.ratePercent ?? 0}% of ${row.calculationBasis}` : formatCurrency(row.defaultAmount ?? 0)}</TableCell><TableCell><Badge variant={row.active ? 'success' : 'secondary'}>{row.active ? 'Active' : 'Inactive'}</Badge></TableCell><TableCell><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" onClick={() => edit(row)}><Pencil className="h-4 w-4" /></Button>{row.active && <Button size="icon" variant="ghost" className="text-red-600" disabled={busy} onClick={async () => { if (!window.confirm(`Deactivate ${row.label}?`)) return; setBusy(true); try { await deactivateFeeTemplate(row.id); await load() } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }}><Trash2 className="h-4 w-4" /></Button>}</div></TableCell></TableRow>
            ))}</TableBody>
          </Table></div>
        )}
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? 'Edit contractor rule' : 'Add contractor rule'}</DialogTitle><DialogDescription>Multiple rules may be saved for the same contractor.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Contractor name</Label><Input value={form.contractorName} onChange={(event) => setForm({ ...form, contractorName: event.target.value })} /></div>
          <div><Label>Rule name</Label><Input placeholder="Referral to Smith Partners" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></div>
          <div><Label>Fee type</Label><SelectField value={form.feeType} onChange={(value) => setForm({ ...form, feeType: value as FeeType })}><option>Commission</option><option>Referral Fee</option></SelectField></div>
          <div><Label>Calculation</Label><SelectField value={form.calculationMode} onChange={(value) => setForm({ ...form, calculationMode: value as CalculationMode, calculationBasis: value === 'Percentage' ? form.calculationBasis ?? 'Approved Revenue' : null })}>{MODES.map((value) => <option key={value}>{value}</option>)}</SelectField></div>
          <div><Label>Payer role</Label><SelectField value={form.payerRole} onChange={(value) => setForm({ ...form, payerRole: value as PartyRole })}>{ROLES.map((value) => <option key={value}>{value}</option>)}</SelectField></div>
          <div><Label>Payee role</Label><SelectField value={form.payeeRole} onChange={(value) => setForm({ ...form, payeeRole: value as PartyRole })}>{ROLES.map((value) => <option key={value}>{value}</option>)}</SelectField></div>
          {form.payerRole === 'Fixed' && <div><Label>Fixed payer</Label><Input value={form.fixedPayerName ?? ''} onChange={(event) => setForm({ ...form, fixedPayerName: event.target.value })} /></div>}
          {form.payeeRole === 'Fixed' && <div><Label>Fixed payee</Label><Input value={form.fixedPayeeName ?? ''} onChange={(event) => setForm({ ...form, fixedPayeeName: event.target.value })} /></div>}
          {form.calculationMode === 'Percentage' ? <><div><Label>Calculation basis</Label><SelectField value={form.calculationBasis ?? 'Approved Revenue'} onChange={(value) => setForm({ ...form, calculationBasis: value as CalculationBasis })}>{BASES.map((value) => <option key={value}>{value}</option>)}</SelectField></div><div><Label>Rate %</Label><Input type="number" min="0" max="100" step="0.01" value={form.ratePercent ?? ''} onChange={(event) => setForm({ ...form, ratePercent: Number(event.target.value) })} /></div></> : <div><Label>Default amount</Label><Input type="number" min="0" step="0.01" value={form.defaultAmount ?? ''} onChange={(event) => setForm({ ...form, defaultAmount: Number(event.target.value) })} /></div>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active rule</label>
          <div className="sm:col-span-2"><Label>Notes</Label><Textarea value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy || !form.contractorName.trim() || !form.label.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save rule'}</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  )
}
