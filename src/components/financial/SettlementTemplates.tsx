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
  createSettlementTemplate,
  deactivateSettlementTemplate,
  getSettlementTemplates,
  updateSettlementTemplate,
  type CompensationType,
  type SettlementCommissionBasis,
  type SettlementReferralBasis,
  type SettlementReferralPaidBy,
  type SettlementTemplate,
} from '@/services/financial-planning'

const emptyTemplate: Omit<SettlementTemplate, 'id'> = {
  contractorName: '', label: '', compensationType: 'Production Partner', companyName: 'CBRS Group',
  referralName: null, adminRatePercent: 10, adminFixedAmount: 0, contractorSplitPercent: 50,
  companySplitPercent: 50, commissionCalculationMode: 'Percentage', commissionBasis: 'Collected Revenue',
  commissionRatePercent: 0, commissionFixedAmount: 0, referralApplicable: false,
  referralBasis: 'Collected Revenue', referralRatePercent: 0, referralFixedAmount: 0,
  referralPaidBy: 'Company', referralContractorSharePercent: 0, active: true, notes: null,
}
function SelectField({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{children}</select>
}

export function SettlementTemplates() {
  const [rows, setRows] = useState<SettlementTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SettlementTemplate | null>(null)
  const [form, setForm] = useState<Omit<SettlementTemplate, 'id'>>({ ...emptyTemplate })

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await getSettlementTemplates()); setError('') }
    catch (err) { setError((err as Error).message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  function edit(row?: SettlementTemplate) {
    setEditing(row ?? null)
    setForm(row ? { ...row } : { ...emptyTemplate })
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      if (editing) await updateSettlementTemplate(editing.id, form)
      else await createSettlementTemplate(form)
      setOpen(false)
      await load()
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  return <>
    {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
    <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">Settlement waterfall templates</CardTitle><p className="mt-1 text-sm text-muted-foreground">Reusable admin, expense, split, commission, and referral terms. These power the contractor settlement statement.</p></div><Button onClick={() => edit()}><Plus className="mr-1 h-4 w-4" />Add settlement terms</Button></div></CardHeader><CardContent>
      {loading ? <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin" />Loading settlement terms…</div> : <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Contractor / template</TableHead><TableHead>Arrangement</TableHead><TableHead>Admin</TableHead><TableHead>Compensation</TableHead><TableHead>Referral</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{rows.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No settlement templates yet.</TableCell></TableRow> : rows.map((row) => <TableRow key={row.id}><TableCell><div className="font-medium">{row.contractorName}</div><div className="text-xs text-muted-foreground">{row.label}</div></TableCell><TableCell>{row.compensationType}</TableCell><TableCell>{row.adminRatePercent}% + {formatCurrency(row.adminFixedAmount)}</TableCell><TableCell>{row.compensationType === 'Production Partner' ? `${row.contractorSplitPercent}/${row.companySplitPercent} split` : row.compensationType === 'Commission Contractor' ? row.commissionBasis === 'Fixed Amount' ? formatCurrency(row.commissionFixedAmount) : `${row.commissionRatePercent}% of ${row.commissionBasis}` : 'Referral only'}</TableCell><TableCell>{row.referralApplicable ? row.referralBasis === 'Fixed Amount' ? formatCurrency(row.referralFixedAmount) : `${row.referralRatePercent}% of ${row.referralBasis}` : 'None'}</TableCell><TableCell><Badge variant={row.active ? 'success' : 'secondary'}>{row.active ? 'Active' : 'Inactive'}</Badge></TableCell><TableCell><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" onClick={() => edit(row)}><Pencil className="h-4 w-4" /></Button>{row.active && <Button size="icon" variant="ghost" className="text-red-600" disabled={busy} onClick={() => { if (window.confirm(`Deactivate ${row.label}?`)) void (async () => { setBusy(true); try { await deactivateSettlementTemplate(row.id); await load() } catch (err) { setError((err as Error).message) } finally { setBusy(false) } })() }}><Trash2 className="h-4 w-4" /></Button>}</div></TableCell></TableRow>)}</TableBody></Table></div>}
    </CardContent></Card>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} settlement terms</DialogTitle><DialogDescription>These terms follow the collected-revenue → admin → reimbursable costs → split → deductions waterfall.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div><Label>Contractor name</Label><Input value={form.contractorName} onChange={(event) => setForm({ ...form, contractorName: event.target.value })} /></div>
      <div><Label>Template name</Label><Input placeholder="Standard production partner" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></div>
      <div><Label>Company</Label><Input value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} /></div>
      <div><Label>Compensation type</Label><SelectField value={form.compensationType} onChange={(value) => setForm({ ...form, compensationType: value as CompensationType })}><option>Production Partner</option><option>Commission Contractor</option><option>Referral Only</option></SelectField></div>
      <div><Label>Admin rate %</Label><Input type="number" min="0" max="100" step="0.01" value={form.adminRatePercent} onChange={(event) => setForm({ ...form, adminRatePercent: Number(event.target.value) })} /></div>
      <div><Label>Fixed admin fee</Label><Input type="number" min="0" step="0.01" value={form.adminFixedAmount} onChange={(event) => setForm({ ...form, adminFixedAmount: Number(event.target.value) })} /></div>
      {form.compensationType === 'Production Partner' && <><div><Label>Contractor split %</Label><Input type="number" min="0" max="100" step="0.01" value={form.contractorSplitPercent} onChange={(event) => setForm({ ...form, contractorSplitPercent: Number(event.target.value), companySplitPercent: 100 - Number(event.target.value) })} /></div><div><Label>Company split %</Label><Input disabled value={form.companySplitPercent} /></div></>}
      {form.compensationType === 'Commission Contractor' && <><div><Label>Commission basis</Label><SelectField value={form.commissionBasis} onChange={(value) => setForm({ ...form, commissionBasis: value as SettlementCommissionBasis, commissionCalculationMode: value === 'Fixed Amount' ? 'Flat' : 'Percentage' })}><option>Collected Revenue</option><option>Revenue After Admin</option><option>Net Split Pool</option><option>Gross Profit Before Fees</option><option>Fixed Amount</option></SelectField></div><div><Label>{form.commissionBasis === 'Fixed Amount' ? 'Commission amount' : 'Commission rate %'}</Label><Input type="number" min="0" step="0.01" value={form.commissionBasis === 'Fixed Amount' ? form.commissionFixedAmount : form.commissionRatePercent} onChange={(event) => form.commissionBasis === 'Fixed Amount' ? setForm({ ...form, commissionFixedAmount: Number(event.target.value) }) : setForm({ ...form, commissionRatePercent: Number(event.target.value) })} /></div></>}
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={form.referralApplicable || form.compensationType === 'Referral Only'} disabled={form.compensationType === 'Referral Only'} onChange={(event) => setForm({ ...form, referralApplicable: event.target.checked })} /> Referral applicable</label>
      {(form.referralApplicable || form.compensationType === 'Referral Only') && <><div><Label>Referral basis</Label><SelectField value={form.referralBasis} onChange={(value) => setForm({ ...form, referralBasis: value as SettlementReferralBasis })}><option>Collected Revenue</option><option>Revenue After Admin</option><option>Net Split Pool</option><option>Contractor Share</option><option>Fixed Amount</option></SelectField></div><div><Label>{form.referralBasis === 'Fixed Amount' ? 'Referral amount' : 'Referral rate %'}</Label><Input type="number" min="0" step="0.01" value={form.referralBasis === 'Fixed Amount' ? form.referralFixedAmount : form.referralRatePercent} onChange={(event) => form.referralBasis === 'Fixed Amount' ? setForm({ ...form, referralFixedAmount: Number(event.target.value) }) : setForm({ ...form, referralRatePercent: Number(event.target.value) })} /></div><div><Label>Paid by</Label><SelectField value={form.referralPaidBy} onChange={(value) => setForm({ ...form, referralPaidBy: value as SettlementReferralPaidBy, referralContractorSharePercent: value === 'Contractor' ? 100 : value === 'Company' ? 0 : 50 })}><option>Company</option><option>Contractor</option><option>Split</option></SelectField></div>{form.referralPaidBy === 'Split' && <div><Label>Contractor-funded %</Label><Input type="number" min="0" max="100" value={form.referralContractorSharePercent} onChange={(event) => setForm({ ...form, referralContractorSharePercent: Number(event.target.value) })} /></div>}</>}
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active</label>
      <div className="sm:col-span-2 lg:col-span-3"><Label>Notes</Label><Textarea value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
    </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy || !form.contractorName.trim() || !form.label.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save terms'}</Button></DialogFooter></DialogContent></Dialog>
  </>
}
