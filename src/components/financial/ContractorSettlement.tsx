import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, Plus, Printer, RefreshCw, Save, Trash2, XCircle } from 'lucide-react'

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
  addSettlementLine,
  createSettlementDraft,
  deleteSettlementDraft,
  deleteSettlementLine,
  finalizeSettlement,
  getClaimSettlements,
  getSettlement,
  updateSettlement,
  voidSettlement,
  type ClaimSettlement,
  type CompensationType,
  type SettlementDetail,
  type SettlementLine,
  type SettlementLineType,
  type SettlementReferralBasis,
  type SettlementReferralPaidBy,
  type SettlementTerms,
} from '@/services/financial-planning'

const COMPENSATION_TYPES: CompensationType[] = ['Production Partner', 'Commission Contractor', 'Referral Only']
const REFERRAL_BASES: SettlementReferralBasis[] = ['Collected Revenue', 'Revenue After Admin', 'Net Split Pool', 'Contractor Share', 'Fixed Amount']
const REFERRAL_PAYERS: SettlementReferralPaidBy[] = ['Company', 'Contractor', 'Split']
const MANUAL_LINE_TYPES: SettlementLineType[] = ['Contractor Deduction', 'Contractor Reimbursement', 'Prior Advance']

function SelectField({ value, onChange, children, disabled }: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60">{children}</select>
}

function MoneyRow({ label, value, strong, subtract }: { label: string; value: number; strong?: boolean; subtract?: boolean }) {
  return <div className={`flex items-center justify-between gap-4 border-b py-2 last:border-0 ${strong ? 'text-base font-bold' : 'text-sm'}`}><span>{label}</span><span className="tabular-nums">{subtract && value ? '− ' : ''}{formatCurrency(Math.abs(value))}</span></div>
}

function statusVariant(status: ClaimSettlement['status']) {
  return status === 'Paid' ? 'success' : status === 'Finalized' ? 'info' : status === 'Void' ? 'secondary' : 'warning'
}

interface ContractorSettlementProps {
  claimRef: string
  refreshSignal?: number
  onChanged?: () => void
}

export function ContractorSettlement({ claimRef, refreshSignal = 0, onChanged }: ContractorSettlementProps) {
  const [history, setHistory] = useState<ClaimSettlement[]>([])
  const [detail, setDetail] = useState<SettlementDetail | null>(null)
  const [terms, setTerms] = useState<SettlementTerms | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [manualLine, setManualLine] = useState({ lineType: 'Contractor Deduction' as SettlementLineType, description: '', amount: 0, payeeRole: 'Company' as 'Company' | 'Third Party', thirdPartyName: '' })

  const load = useCallback(async (preferredId?: string) => {
    setLoading(true)
    setError('')
    try {
      const rows = await getClaimSettlements(claimRef)
      setHistory(rows)
      const selectedId = preferredId ?? rows.find((row) => row.status === 'Draft')?.id ?? rows[0]?.id
      if (selectedId) {
        const next = await getSettlement(selectedId)
        setDetail(next)
        setTerms(next.settlement)
      } else {
        setDetail(null)
        setTerms(null)
      }
    } catch (err) { setError((err as Error).message) }
    finally { setLoading(false) }
  }, [claimRef])

  useEffect(() => { void load() }, [load, refreshSignal])

  async function run(action: () => Promise<SettlementDetail>) {
    setBusy(true)
    setError('')
    try {
      const next = await action()
      setDetail(next)
      setTerms(next.settlement)
      const rows = await getClaimSettlements(claimRef)
      setHistory(rows)
      onChanged?.()
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  async function createDraft() {
    await run(() => createSettlementDraft(claimRef))
  }

  async function saveTerms() {
    if (!detail || !terms) return
    await run(() => updateSettlement(detail.settlement.id, { ...terms, asOfDate: detail.settlement.asOfDate, notes: detail.settlement.notes }))
  }

  async function toggleLine(line: SettlementLine, included: boolean) {
    if (!detail) return
    let exclusionReason: string | null = null
    if (!included) {
      exclusionReason = window.prompt('Why is this line excluded from the settlement?')?.trim() || null
      if (!exclusionReason) return
    }
    await run(() => updateSettlement(detail.settlement.id, { lines: [{ id: line.id, included, exclusionReason }] }))
  }

  async function setLineAmount(line: SettlementLine, nextAmount: number) {
    if (!detail) return
    await run(() => updateSettlement(detail.settlement.id, { lines: [{ id: line.id, amount: nextAmount }] }))
  }

  async function addLine() {
    if (!detail) return
    const isCompanyToContractor = ['Contractor Reimbursement', 'Prior Advance'].includes(manualLine.lineType)
    await run(() => addSettlementLine(detail.settlement.id, {
      lineType: manualLine.lineType,
      description: manualLine.description,
      amount: manualLine.amount,
      payerName: isCompanyToContractor ? terms?.companyName : terms?.contractorName ?? undefined,
      payeeName: isCompanyToContractor ? terms?.contractorName ?? undefined : manualLine.payeeRole === 'Company' ? terms?.companyName : manualLine.thirdPartyName,
      metadata: manualLine.lineType === 'Contractor Deduction' ? { payeeRole: manualLine.payeeRole } : {},
    }))
    setAddOpen(false)
    setManualLine({ lineType: 'Contractor Deduction', description: '', amount: 0, payeeRole: 'Company', thirdPartyName: '' })
  }

  async function deleteDraft() {
    if (!detail || detail.settlement.status !== 'Draft') return
    setBusy(true)
    setError('')
    try {
      await deleteSettlementDraft(detail.settlement.id)
      await load()
      onChanged?.()
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  const grouped = useMemo(() => {
    const lines = detail?.lines ?? []
    return {
      revenue: lines.filter((line) => line.lineType === 'Revenue'),
      expenses: lines.filter((line) => line.lineType === 'Company Expense'),
      adjustments: lines.filter((line) => !['Revenue', 'Company Expense'].includes(line.lineType)),
    }
  }, [detail])

  if (loading) return <Card><CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin" />Loading settlements…</CardContent></Card>

  if (!detail || !terms) return <Card><CardContent className="py-10 text-center"><FileText className="mx-auto h-9 w-9 text-muted-foreground" /><h3 className="mt-3 font-semibold">No contractor settlement yet</h3><p className="mt-1 text-sm text-muted-foreground">Create the first draft to apply the collected-revenue waterfall from the contractor agreement.</p>{error && <p className="mt-3 text-sm text-destructive">{error}</p>}<Button className="mt-4" disabled={busy} onClick={() => void createDraft()}><Plus className="mr-1 h-4 w-4" />Create settlement draft</Button></CardContent></Card>

  const draft = detail.settlement.status === 'Draft'
  const c = detail.calculation
  const termsLocked = detail.priorSettlements.length > 0

  return <div className="settlement-print-root space-y-5">
    {error && <div className="no-print rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

    <div className="no-print flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">Contractor Settlement #{detail.settlement.settlementNumber}</h2>
        <Badge variant={statusVariant(detail.settlement.status)}>{detail.settlement.status}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {history.length > 1 && <SelectField value={detail.settlement.id} onChange={(id) => void load(id)}>{history.map((row) => <option key={row.id} value={row.id}>#{row.settlementNumber} · {row.status} · {row.asOfDate}</option>)}</SelectField>}
        {!history.some((row) => row.status === 'Draft') && <Button variant="outline" onClick={() => void createDraft()}><Plus className="mr-1 h-4 w-4" />Next settlement</Button>}
        <Button variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Print / PDF</Button>
      </div>
    </div>

    <Card className="settlement-statement-header">
      <CardContent className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs uppercase text-muted-foreground">Company</p><p className="font-semibold">{terms.companyName}</p></div>
        <div><p className="text-xs uppercase text-muted-foreground">Contractor / Partner</p><p className="font-semibold">{terms.contractorName || 'Not applicable'}</p></div>
        <div><p className="text-xs uppercase text-muted-foreground">Project / Claim</p><p className="font-semibold">{detail.claim.customerName} · {detail.claim.claimCode}</p></div>
        <div><p className="text-xs uppercase text-muted-foreground">Effective / As-of Date</p>{draft ? <Input type="date" value={detail.settlement.asOfDate} onChange={(event) => setDetail({ ...detail, settlement: { ...detail.settlement, asOfDate: event.target.value } })} onBlur={() => void run(() => updateSettlement(detail.settlement.id, { asOfDate: detail.settlement.asOfDate }))} /> : <p className="font-semibold">{detail.settlement.asOfDate}</p>}</div>
        <div className="sm:col-span-2 lg:col-span-4"><p className="text-xs uppercase text-muted-foreground">Property</p><p>{detail.claim.address}</p></div>
      </CardContent>
    </Card>

    <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle className="text-base">Agreed compensation structure</CardTitle>{termsLocked && <p className="no-print mt-1 text-xs text-amber-600">Terms are locked by the first finalized settlement. Use explicit adjustment lines for corrections.</p>}</div>{draft && !termsLocked && <Button className="no-print" size="sm" disabled={busy} onClick={() => void saveTerms()}><Save className="mr-1 h-4 w-4" />Save terms</Button>}</div></CardHeader><CardContent><div className="print-only grid grid-cols-2 gap-3 text-sm"><div><span className="font-medium">Arrangement:</span> {terms.compensationType}</div><div><span className="font-medium">Admin fee:</span> {terms.adminRatePercent}% + {formatCurrency(terms.adminFixedAmount)}</div><div><span className="font-medium">Compensation:</span> {terms.compensationType === 'Production Partner' ? `${terms.contractorSplitPercent}% contractor / ${terms.companySplitPercent}% company` : terms.compensationType === 'Commission Contractor' ? terms.commissionBasis === 'Fixed Amount' ? formatCurrency(terms.commissionFixedAmount) : `${terms.commissionRatePercent}% of ${terms.commissionBasis}` : 'Referral only'}</div><div><span className="font-medium">Referral:</span> {terms.referralApplicable || terms.compensationType === 'Referral Only' ? `${terms.referralName || 'Unnamed'} · ${terms.referralBasis === 'Fixed Amount' ? formatCurrency(terms.referralFixedAmount) : `${terms.referralRatePercent}% of ${terms.referralBasis}`} · funded by ${terms.referralPaidBy}` : 'None'}</div></div><div className="no-print grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div><Label>Compensation type</Label><SelectField disabled={!draft || termsLocked} value={terms.compensationType} onChange={(value) => setTerms({ ...terms, compensationType: value as CompensationType })}>{COMPENSATION_TYPES.map((value) => <option key={value}>{value}</option>)}</SelectField></div>
      <div><Label>Admin rate %</Label><Input disabled={!draft || termsLocked} type="number" min="0" max="100" step="0.01" value={terms.adminRatePercent} onChange={(event) => setTerms({ ...terms, adminRatePercent: Number(event.target.value) })} /></div>
      <div><Label>Fixed admin fee</Label><Input disabled={!draft || termsLocked} type="number" min="0" step="0.01" value={terms.adminFixedAmount} onChange={(event) => setTerms({ ...terms, adminFixedAmount: Number(event.target.value) })} /></div>
      {terms.compensationType === 'Production Partner' && <><div><Label>Contractor split %</Label><Input disabled={!draft || termsLocked} type="number" min="0" max="100" step="0.01" value={terms.contractorSplitPercent} onChange={(event) => setTerms({ ...terms, contractorSplitPercent: Number(event.target.value), companySplitPercent: 100 - Number(event.target.value) })} /></div><div><Label>Company split %</Label><Input disabled value={terms.companySplitPercent} /></div></>}
      {terms.compensationType === 'Commission Contractor' && <><div><Label>Commission basis</Label><SelectField disabled={!draft || termsLocked} value={terms.commissionBasis} onChange={(value) => setTerms({ ...terms, commissionBasis: value as SettlementTerms['commissionBasis'], commissionCalculationMode: value === 'Fixed Amount' ? 'Flat' : 'Percentage' })}><option>Collected Revenue</option><option>Revenue After Admin</option><option>Net Split Pool</option><option>Gross Profit Before Fees</option><option>Fixed Amount</option></SelectField></div><div><Label>{terms.commissionBasis === 'Fixed Amount' ? 'Commission amount' : 'Commission rate %'}</Label><Input disabled={!draft || termsLocked} type="number" min="0" step="0.01" value={terms.commissionBasis === 'Fixed Amount' ? terms.commissionFixedAmount : terms.commissionRatePercent} onChange={(event) => terms.commissionBasis === 'Fixed Amount' ? setTerms({ ...terms, commissionFixedAmount: Number(event.target.value) }) : setTerms({ ...terms, commissionRatePercent: Number(event.target.value) })} /></div></>}
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input disabled={!draft || termsLocked || terms.compensationType === 'Referral Only'} type="checkbox" checked={terms.referralApplicable || terms.compensationType === 'Referral Only'} onChange={(event) => setTerms({ ...terms, referralApplicable: event.target.checked })} /> Referral applicable</label>
      {(terms.referralApplicable || terms.compensationType === 'Referral Only') && <><div><Label>Referral recipient</Label><Input disabled={!draft || termsLocked} value={terms.referralName ?? ''} onChange={(event) => setTerms({ ...terms, referralName: event.target.value })} /></div><div><Label>Referral basis</Label><SelectField disabled={!draft || termsLocked} value={terms.referralBasis} onChange={(value) => setTerms({ ...terms, referralBasis: value as SettlementReferralBasis })}>{REFERRAL_BASES.map((value) => <option key={value}>{value}</option>)}</SelectField></div><div><Label>{terms.referralBasis === 'Fixed Amount' ? 'Referral amount' : 'Referral rate %'}</Label><Input disabled={!draft || termsLocked} type="number" min="0" step="0.01" value={terms.referralBasis === 'Fixed Amount' ? terms.referralFixedAmount : terms.referralRatePercent} onChange={(event) => terms.referralBasis === 'Fixed Amount' ? setTerms({ ...terms, referralFixedAmount: Number(event.target.value) }) : setTerms({ ...terms, referralRatePercent: Number(event.target.value) })} /></div><div><Label>Referral paid by</Label><SelectField disabled={!draft || termsLocked} value={terms.referralPaidBy} onChange={(value) => setTerms({ ...terms, referralPaidBy: value as SettlementReferralPaidBy, referralContractorSharePercent: value === 'Contractor' ? 100 : value === 'Company' ? 0 : 50 })}>{REFERRAL_PAYERS.map((value) => <option key={value}>{value}</option>)}</SelectField></div>{terms.referralPaidBy === 'Split' && <div><Label>Contractor-funded share %</Label><Input disabled={!draft || termsLocked} type="number" min="0" max="100" value={terms.referralContractorSharePercent} onChange={(event) => setTerms({ ...terms, referralContractorSharePercent: Number(event.target.value) })} /></div>}</>}
    </div></CardContent></Card>

    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <div className="space-y-5">
        <SettlementLines title="Revenue actually collected" lines={grouped.revenue} draft={draft} busy={busy} onToggle={toggleLine} onAmount={setLineAmount} />
        <SettlementLines title="Company-paid reimbursable project expenses" lines={grouped.expenses} draft={draft} busy={busy} onToggle={toggleLine} onAmount={setLineAmount} />
        <Card><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-base">Deductions, advances, and reimbursements</CardTitle>{draft && <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}><Plus className="mr-1 h-4 w-4" />Add line</Button>}</div></CardHeader><CardContent>{grouped.adjustments.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No additional settlement lines.</p> : <Table><TableHeader><TableRow><TableHead>Type / description</TableHead><TableHead>Payer → payee</TableHead><TableHead className="text-right">Amount</TableHead><TableHead /></TableRow></TableHeader><TableBody>{grouped.adjustments.map((line) => <TableRow key={line.id}><TableCell><div className="font-medium">{line.lineType}</div><div className="text-xs text-muted-foreground">{line.description}</div>{line.lockedByPriorSettlement && <div className="text-xs text-muted-foreground">Included in cumulative history</div>}</TableCell><TableCell>{line.payerName || '—'} → {line.payeeName || '—'}</TableCell><TableCell className="text-right">{formatCurrency(line.amount)}</TableCell><TableCell>{draft && !line.sourceId && !line.lockedByPriorSettlement && <Button size="icon" variant="ghost" className="text-red-600" onClick={() => void run(() => deleteSettlementLine(line.id))}><Trash2 className="h-4 w-4" /></Button>}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
      </div>

      <div className="space-y-5">
        <Card className="border-primary/30"><CardHeader><CardTitle className="text-base">Payment waterfall</CardTitle><p className="text-xs text-muted-foreground">Collected Revenue − Admin Fee − Company-Paid Expenses = Net Split Pool</p></CardHeader><CardContent>
          <MoneyRow label="Total Collected Revenue" value={c.collectedRevenue} />
          <MoneyRow label="Admin / Estimating / Supplement Fee" value={c.adminFee} subtract />
          <MoneyRow label="Company-Paid Job Costs" value={c.companyExpenses} subtract />
          <MoneyRow label="Net Split Pool" value={c.netSplitPool} strong />
          <MoneyRow label="Contractor Gross Share" value={c.contractorGrossShare} />
          <MoneyRow label="Contractor Deductions" value={c.contractorDeductions} subtract />
          <MoneyRow label="Contractor Referral Share" value={c.contractorReferralShare} subtract />
          <MoneyRow label="Contractor Reimbursements" value={c.contractorReimbursements} />
          <MoneyRow label="Cumulative Contractor Entitlement" value={c.cumulativeContractorEntitlement} strong />
          <MoneyRow label="Prior Settlements / Advances" value={c.priorContractorDistributions + c.priorAdvances} subtract />
          <MoneyRow label="FINAL CONTRACTOR PAYMENT" value={c.finalContractorPayment} strong />
          {c.contractorCarryForward > 0 && <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-1 inline h-4 w-4" />Carry forward owed by contractor: <strong>{formatCurrency(c.contractorCarryForward)}</strong></div>}
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-base">Company and third-party distribution</CardTitle></CardHeader><CardContent><MoneyRow label="Admin Fee Retained" value={c.adminFee} /><MoneyRow label="Company Gross Share" value={c.companyGrossShare} /><MoneyRow label="Company-Funded Referral Share" value={c.companyReferralShare} subtract /><MoneyRow label="Contractor Reimbursements" value={c.contractorReimbursements} subtract /><MoneyRow label="Deductions Payable to Company" value={c.deductionsPayableToCompany} /><MoneyRow label="Cumulative Company Entitlement" value={c.cumulativeCompanyEntitlement} /><MoneyRow label="Prior Company Distributions" value={c.priorCompanyDistributions} subtract /><MoneyRow label="CURRENT COMPANY DISTRIBUTION" value={c.companyDistribution} strong /><MoneyRow label="Referral Commission" value={c.referralCommission} /><MoneyRow label="Deductions Payable to Third Parties" value={c.deductionsPayableToThirdParty} /><MoneyRow label="Cumulative Third-Party Entitlement" value={c.cumulativeThirdPartyEntitlement} /><MoneyRow label="Prior Third-Party Distributions" value={c.priorThirdPartyDistributions} subtract /><MoneyRow label="CURRENT THIRD-PARTY PAYMENTS" value={c.thirdPartyPayments} strong /></CardContent></Card>

        <Card className={c.reconciliationDifference === 0 ? 'border-emerald-400' : 'border-red-400'}><CardContent className="p-4"><div className="flex items-start gap-3">{c.reconciliationDifference === 0 ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <XCircle className="mt-0.5 h-5 w-5 text-red-600" />}<div><p className="font-semibold">Settlement check: {formatCurrency(c.reconciliationDifference)}</p><p className="text-xs text-muted-foreground">Contractor entitlement + company entitlement + third-party entitlement must equal collected revenue.</p></div></div></CardContent></Card>

        {detail.legacyFeeConflicts.length > 0 && <Card className="border-amber-400"><CardContent className="p-4"><div className="flex gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" /><div><p className="font-semibold">Legacy obligations require resolution</p><p className="text-xs text-muted-foreground">Waive or resolve these existing manual fees before finalizing to prevent duplicate payouts.</p><ul className="mt-2 text-sm">{detail.legacyFeeConflicts.map((row) => <li key={row.id}>{row.name} · {formatCurrency(row.amount)} · {row.feeState}</li>)}</ul></div></div></CardContent></Card>}

        {c.errors.length > 0 && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900"><ul className="list-disc space-y-1 pl-5">{c.errors.map((message) => <li key={message}>{message}</li>)}</ul></div>}
        <div className="no-print flex flex-wrap gap-2">{draft ? <><Button disabled={busy || !c.validForFinalization} onClick={() => { if (window.confirm('Finalize and lock this settlement? Amounts due will be created for contractor and referral payments.')) void run(() => finalizeSettlement(detail.settlement.id)) }}><CheckCircle2 className="mr-1 h-4 w-4" />Finalize settlement</Button><Button variant="outline" disabled={busy} onClick={() => { if (window.confirm('Delete this draft settlement?')) void deleteDraft() }}><Trash2 className="mr-1 h-4 w-4" />Delete draft</Button></> : detail.settlement.status === 'Finalized' && <Button variant="destructive" disabled={busy} onClick={() => { if (window.confirm('Void this unpaid settlement?')) void run(() => voidSettlement(detail.settlement.id)) }}><XCircle className="mr-1 h-4 w-4" />Void unpaid settlement</Button>}</div>
      </div>
    </div>

    <Card className="settlement-acknowledgment"><CardHeader><CardTitle>Payment Acknowledgment</CardTitle></CardHeader><CardContent className="space-y-8"><p className="text-sm">By signing below, both parties acknowledge that they reviewed this project settlement and agree that the compensation calculation reflects the agreed payment structure for this project.</p><div className="grid gap-10 sm:grid-cols-2"><div><p className="font-medium">Contractor / Partner: {terms.contractorName || '______________________________'}</p><div className="mt-10 border-b border-foreground" /><p className="mt-1 text-xs">Signature</p><div className="mt-8 border-b border-foreground" /><p className="mt-1 text-xs">Date</p></div><div><p className="font-medium">Company Representative: ______________________________</p><div className="mt-10 border-b border-foreground" /><p className="mt-1 text-xs">Signature</p><div className="mt-8 border-b border-foreground" /><p className="mt-1 text-xs">Date</p></div></div><div><Label>Notes / Exceptions</Label>{draft ? <Textarea value={detail.settlement.notes ?? ''} onChange={(event) => setDetail({ ...detail, settlement: { ...detail.settlement, notes: event.target.value } })} onBlur={() => void run(() => updateSettlement(detail.settlement.id, { notes: detail.settlement.notes, asOfDate: detail.settlement.asOfDate }))} /> : <p className="min-h-16 whitespace-pre-wrap border-b py-2 text-sm">{detail.settlement.notes || 'None'}</p>}</div></CardContent></Card>

    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent><DialogHeader><DialogTitle>Add settlement line</DialogTitle><DialogDescription>Each deduction must name its destination so the settlement remains balanced.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>Type</Label><SelectField value={manualLine.lineType} onChange={(value) => setManualLine({ ...manualLine, lineType: value as SettlementLineType })}>{MANUAL_LINE_TYPES.map((value) => <option key={value}>{value}</option>)}</SelectField></div><div><Label>Description</Label><Input value={manualLine.description} onChange={(event) => setManualLine({ ...manualLine, description: event.target.value })} /></div><div><Label>Amount</Label><Input type="number" min="0" step="0.01" value={manualLine.amount || ''} onChange={(event) => setManualLine({ ...manualLine, amount: Number(event.target.value) })} /></div>{manualLine.lineType === 'Contractor Deduction' && <><div><Label>Deduction recipient</Label><SelectField value={manualLine.payeeRole} onChange={(value) => setManualLine({ ...manualLine, payeeRole: value as 'Company' | 'Third Party' })}><option>Company</option><option>Third Party</option></SelectField></div>{manualLine.payeeRole === 'Third Party' && <div><Label>Third-party name</Label><Input value={manualLine.thirdPartyName} onChange={(event) => setManualLine({ ...manualLine, thirdPartyName: event.target.value })} /></div>}</>}</div><DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button disabled={busy || !manualLine.description.trim() || manualLine.amount <= 0 || (manualLine.lineType === 'Contractor Deduction' && manualLine.payeeRole === 'Third Party' && !manualLine.thirdPartyName.trim())} onClick={() => void addLine()}>Add line</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

function SettlementLines({ title, lines, draft, busy, onToggle, onAmount }: {
  title: string
  lines: SettlementLine[]
  draft: boolean
  busy: boolean
  onToggle: (line: SettlementLine, included: boolean) => Promise<void>
  onAmount: (line: SettlementLine, amount: number) => Promise<void>
}) {
  return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent>{lines.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">No source records found.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Include</TableHead><TableHead>Source</TableHead><TableHead>Details</TableHead><TableHead className="text-right">Settlement amount</TableHead></TableRow></TableHeader><TableBody>{lines.map((line) => <TableRow key={line.id} className={!line.included ? 'opacity-60' : ''}><TableCell><input type="checkbox" disabled={!draft || busy || line.lockedByPriorSettlement} checked={line.included} onChange={(event) => void onToggle(line, event.target.checked)} /></TableCell><TableCell><div className="font-medium">{line.description}</div><div className="text-xs text-muted-foreground">{line.category || line.sourceTable}</div></TableCell><TableCell className="text-xs"><div>{line.payerName || '—'} → {line.payeeName || '—'}</div>{Boolean(line.metadata.reference) && <div>Reference: {String(line.metadata.reference)}</div>}{Boolean(line.metadata.invoiceNumber) && <div>Invoice: {String(line.metadata.invoiceNumber)}</div>}{!line.included && <div className="text-amber-600">Excluded: {line.exclusionReason}</div>}{line.lockedByPriorSettlement && <div className="text-muted-foreground">Included in cumulative history</div>}{Boolean(line.metadata.sourceChanged) && <div className="text-amber-600">Source now shows {formatCurrency(Number(line.metadata.currentSourceAmount ?? 0))}; this settlement retains the prior snapshot.</div>}{Boolean(line.metadata.sourceDeleted) && <div className="text-amber-600">Source record was removed; this settlement retains the prior snapshot.</div>}</TableCell><TableCell className="text-right">{draft && !line.lockedByPriorSettlement ? <Input className="ml-auto w-32 text-right" type="number" min="0" step="0.01" defaultValue={line.amount} onBlur={(event) => { const value = Number(event.target.value); if (value !== line.amount) void onAmount(line, value) }} /> : formatCurrency(line.amount)}</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
}
