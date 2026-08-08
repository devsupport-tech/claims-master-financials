import { useEffect, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import { getContractorSummary, type ContractorSummary } from '@/services/financial-planning'

interface ContractorPortfolioProps {
  onSelectClaim: (claimId: string) => void
  refreshSignal?: number
}

export function ContractorPortfolio({ onSelectClaim, refreshSignal = 0 }: ContractorPortfolioProps) {
  const [rows, setRows] = useState<ContractorSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getContractorSummary().then((data) => { setRows(data); setError('') })
      .catch((err) => setError((err as Error).message)).finally(() => setLoading(false))
  }, [refreshSignal])

  function exportCsv() {
    const columns: Array<[string, keyof ContractorSummary]> = [
      ['Contractor', 'contractor'], ['Project Count', 'projectCount'], ['Approved Revenue', 'approvedRevenue'],
      ['Collected Revenue', 'collectedRevenue'], ['Budget', 'budget'], ['Committed Costs', 'committedCosts'],
      ['Paid Costs', 'paidCosts'], ['Fees Owed By', 'feesOwedByContractor'], ['Fees Owed To', 'feesOwedToContractor'],
      ['Referral Balance', 'referralBalance'], ['Projected Profit', 'projectedProfit'], ['Expected Profit', 'expectedProfit'],
    ]
    const csv = [columns.map(([label]) => label), ...rows.map((row) => columns.map(([, key]) => row[key]))]
      .map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'contractor-financial-summary.csv'; anchor.click(); URL.revokeObjectURL(url)
  }

  return (
    <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Contractor portfolio</CardTitle><p className="mt-1 text-sm text-muted-foreground">Claims, costs, fee balances, and profitability grouped by the claim contractor.</p></div><Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}><Download className="mr-1 h-4 w-4" /> CSV</Button></div></CardHeader><CardContent>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {loading ? <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin" />Loading contractor totals…</div> : (
        <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Contractor / claims</TableHead><TableHead className="text-right">Approved / collected</TableHead><TableHead className="text-right">Budget / committed / paid</TableHead><TableHead className="text-right">Owes / owed</TableHead><TableHead className="text-right">Referral</TableHead><TableHead className="text-right">Projected / expected profit</TableHead></TableRow></TableHeader><TableBody>
          {rows.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No contractor financial plans yet.</TableCell></TableRow> : rows.map((row) => <TableRow key={row.contractor}>
            <TableCell><div className="font-medium">{row.contractor} · {row.projectCount}</div><div className="mt-1 flex max-w-[260px] flex-wrap gap-x-2">{row.claims.map((claim) => <button key={claim.id} className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => onSelectClaim(claim.id)}>{claim.claimCode}</button>)}</div></TableCell>
            <TableCell className="text-right"><div>{formatCurrency(row.approvedRevenue)}</div><div className="text-xs text-muted-foreground">{formatCurrency(row.collectedRevenue)}</div></TableCell>
            <TableCell className="text-right"><div>{formatCurrency(row.budget)}</div><div className="text-xs text-muted-foreground">{formatCurrency(row.committedCosts)} / {formatCurrency(row.paidCosts)}</div></TableCell>
            <TableCell className="text-right"><div>{formatCurrency(row.feesOwedByContractor)}</div><div className="text-xs text-muted-foreground">{formatCurrency(row.feesOwedToContractor)}</div></TableCell>
            <TableCell className="text-right">{formatCurrency(row.referralBalance)}</TableCell>
            <TableCell className="text-right"><div>{formatCurrency(row.projectedProfit)}</div><div className="text-xs text-muted-foreground">{formatCurrency(row.expectedProfit)}</div></TableCell>
          </TableRow>)}
        </TableBody></Table></div>
      )}
    </CardContent></Card>
  )
}
