export interface ContractorSummary {
  contractor: string
  projectCount: number
  approvedRevenue: number
  collectedRevenue: number
  budget: number
  committedCosts: number
  paidCosts: number
  feesOwedByContractor: number
  feesOwedToContractor: number
  referralBalance: number
  projectedProfit: number
  expectedProfit: number
  claims: Array<{
    id: string
    claimCode: string
    customerName: string
    approvedRevenue: number
    projectedProfit: number
    expectedProfit: number
  }>
}
