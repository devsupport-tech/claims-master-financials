const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')
const ROOT = `${API_BASE_URL}/financial-planning`

export type BudgetCategory = 'Labor' | 'Materials' | 'Subcontractors' | 'Other'
export type ExpenseKind = 'Labor' | 'Materials' | 'Subcontractor' | 'General' | 'Commission' | 'Referral Fee' | 'Contractor Settlement' | 'Other'
export type FeeType = 'Commission' | 'Referral Fee'
export type CalculationMode = 'Percentage' | 'Flat' | 'Manual'
export type CalculationBasis = 'Approved Revenue' | 'Collected Revenue' | 'Gross Profit Before Fees'
export type PartyRole = 'CBRS Group' | 'Contractor' | 'Referral' | 'Fixed'
export type CompensationType = 'Production Partner' | 'Commission Contractor' | 'Referral Only'
export type SettlementStatus = 'Draft' | 'Finalized' | 'Paid' | 'Void'
export type SettlementReferralBasis = 'Collected Revenue' | 'Revenue After Admin' | 'Net Split Pool' | 'Contractor Share' | 'Fixed Amount'
export type SettlementCommissionBasis = 'Collected Revenue' | 'Revenue After Admin' | 'Net Split Pool' | 'Gross Profit Before Fees' | 'Fixed Amount'
export type SettlementReferralPaidBy = 'Company' | 'Contractor' | 'Split'
export type SettlementLineType = 'Revenue' | 'Company Expense' | 'Contractor Deduction' | 'Contractor Reimbursement' | 'Prior Advance'

export interface BudgetLine {
  id: string
  claimId: string
  moduleId: string | null
  category: BudgetCategory
  description: string | null
  budgetAmount: number
}

export interface PlanningPayment {
  id: string
  claimId: string | null
  projectExpenseId: string | null
  paymentName: string | null
  amount: number
  paymentDate: string | null
  method: string | null
  checkNumber: string | null
  notes: string | null
}

export interface PlanningExpense {
  id: string
  claimId: string
  moduleId: string | null
  moduleName: string | null
  name: string
  expenseKind: ExpenseKind
  payerName: string | null
  payeeName: string | null
  amount: number
  invoiceNumber: string | null
  invoiceDate: string | null
  dueDate: string | null
  scopeNotes: string | null
  calculationMode: CalculationMode | null
  calculationBasis: CalculationBasis | null
  ratePercent: number | null
  basisAmount: number | null
  feeState: 'Projected' | 'Due' | 'Waived' | null
  lockedAt: string | null
  sourceTemplateId: string | null
  sourceContractorName: string | null
  sourceSettlementId: string | null
  effectiveAmount: number
  paidAmount: number
  balance: number
  previewAmount: number
  staleProjectedAmount: boolean
  status: 'Projected' | 'Due' | 'Partial' | 'Paid' | 'Waived'
}

export interface FeeTemplate {
  id: string
  contractorName: string
  label: string
  feeType: FeeType
  payerRole: PartyRole
  payeeRole: PartyRole
  fixedPayerName: string | null
  fixedPayeeName: string | null
  calculationMode: CalculationMode
  calculationBasis: CalculationBasis | null
  ratePercent: number | null
  defaultAmount: number | null
  active: boolean
  notes: string | null
  alreadyApplied?: boolean
}

export interface FinancialPlanMetrics {
  approvedRevenue: number
  collectedRevenue: number
  budgetedDirectCost: number
  committedDirectCost: number
  paidDirectCost: number
  feeObligations: number
  paidFees: number
  projectedFees: number
  otherUnlinkedOutflows: number
  remainingBudget: number
  grossProfitBeforeFees: number
  projectedProfit: number
  expectedProfit: number
  cashProfit: number
}

export interface FinancialPlan {
  claim: {
    id: string
    claimCode: string
    customerName: string
    contractor: string | null
    referralName: string | null
    rcv: number
    totalApprovedBudget: number
  }
  modules: Array<{ id: string; name: string; archivedAt: string | null }>
  budgets: BudgetLine[]
  expenses: PlanningExpense[]
  payments: PlanningPayment[]
  metrics: FinancialPlanMetrics
  availableTemplates: FeeTemplate[]
  contractorDefaultsOutdated: boolean
}

export interface SettlementTerms {
  compensationType: CompensationType
  companyName: string
  contractorName: string | null
  referralName: string | null
  adminRatePercent: number
  adminFixedAmount: number
  contractorSplitPercent: number
  companySplitPercent: number
  commissionCalculationMode: 'Percentage' | 'Flat'
  commissionBasis: SettlementCommissionBasis
  commissionRatePercent: number
  commissionFixedAmount: number
  referralApplicable: boolean
  referralBasis: SettlementReferralBasis
  referralRatePercent: number
  referralFixedAmount: number
  referralPaidBy: SettlementReferralPaidBy
  referralContractorSharePercent: number
}

export interface SettlementTemplate extends SettlementTerms {
  id: string
  contractorName: string
  label: string
  active: boolean
  notes: string | null
  createdAt?: string
  updatedAt?: string
}

export interface ClaimSettlement extends SettlementTerms {
  id: string
  claimId: string
  templateId: string | null
  settlementNumber: number
  status: SettlementStatus
  asOfDate: string
  notes: string | null
  finalizedAt: string | null
  voidedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SettlementLine {
  id: string
  settlementId: string
  lineType: SettlementLineType
  sourceTable: string | null
  sourceId: string | null
  description: string
  category: string | null
  payerName: string | null
  payeeName: string | null
  amount: number
  included: boolean
  exclusionReason: string | null
  sortOrder: number
  metadata: Record<string, unknown>
  lockedByPriorSettlement: boolean
}

export interface SettlementCalculation {
  collectedRevenue: number
  adminFee: number
  revenueAfterAdmin: number
  companyExpenses: number
  grossProfitBeforeFees: number
  netSplitPool: number
  contractorGrossShare: number
  companyGrossShare: number
  referralBasisAmount: number
  referralCommission: number
  contractorReferralShare: number
  companyReferralShare: number
  contractorDeductions: number
  deductionsPayableToCompany: number
  deductionsPayableToThirdParty: number
  contractorReimbursements: number
  priorAdvances: number
  cumulativeContractorEntitlement: number
  cumulativeCompanyEntitlement: number
  cumulativeThirdPartyEntitlement: number
  priorContractorDistributions: number
  priorCompanyDistributions: number
  priorThirdPartyDistributions: number
  finalContractorPayment: number
  companyDistribution: number
  thirdPartyPayments: number
  contractorCarryForward: number
  reconciliationDifference: number
  errors: string[]
  validForFinalization: boolean
}

export interface SettlementDetail {
  settlement: ClaimSettlement
  claim: { id: string; claimCode: string; customerName: string; address: string; contractor: string | null; referralName: string | null }
  lines: SettlementLine[]
  calculation: SettlementCalculation
  priorSettlements: ClaimSettlement[]
  legacyFeeConflicts: Array<{ id: string; name: string; expenseKind: string; payeeName: string | null; amount: number; feeState: string | null }>
}

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ROOT}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const payload = await response.json().catch(() => null) as { error?: string } | T | null
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'error' in payload
      ? String(payload.error)
      : `Financial request failed with status ${response.status}`)
  }
  return payload as T
}

function body(value: unknown): string {
  return JSON.stringify(value)
}

export const getFinancialPlan = (claimRef: string) =>
  request<FinancialPlan>(`/claims/${encodeURIComponent(claimRef)}`)

export const getContractorSummary = () => request<ContractorSummary[]>('/contractors')

export const getSettlementTemplates = () => request<SettlementTemplate[]>('/settlement-templates')

export const createSettlementTemplate = (value: Omit<SettlementTemplate, 'id'>) =>
  request<SettlementTemplate>('/settlement-templates', { method: 'POST', body: body(value) })

export const updateSettlementTemplate = (id: string, value: Omit<SettlementTemplate, 'id'>) =>
  request<SettlementTemplate>(`/settlement-templates/${id}`, { method: 'PATCH', body: body(value) })

export const deactivateSettlementTemplate = (id: string) =>
  request<{ ok: boolean }>(`/settlement-templates/${id}`, { method: 'DELETE' })

export const getClaimSettlements = (claimRef: string) =>
  request<ClaimSettlement[]>(`/claims/${encodeURIComponent(claimRef)}/settlements`)

export const createSettlementDraft = (claimRef: string, value: { templateId?: string; asOfDate?: string } = {}) =>
  request<SettlementDetail>(`/claims/${encodeURIComponent(claimRef)}/settlements`, { method: 'POST', body: body(value) })

export const getSettlement = (id: string) => request<SettlementDetail>(`/settlements/${id}`)

export const updateSettlement = (id: string, value: Partial<SettlementTerms> & {
  asOfDate?: string
  notes?: string | null
  lines?: Array<Partial<SettlementLine> & { id: string }>
}) => request<SettlementDetail>(`/settlements/${id}`, { method: 'PATCH', body: body(value) })

export const addSettlementLine = (id: string, value: {
  lineType: SettlementLineType
  description: string
  category?: string
  payerName?: string
  payeeName?: string
  amount: number
  included?: boolean
  exclusionReason?: string
  metadata?: Record<string, unknown>
}) => request<SettlementDetail>(`/settlements/${id}/lines`, { method: 'POST', body: body(value) })

export const deleteSettlementLine = (id: string) =>
  request<SettlementDetail>(`/settlement-lines/${id}`, { method: 'DELETE' })

export const deleteSettlementDraft = (id: string) =>
  request<{ ok: boolean; id: string }>(`/settlements/${id}`, { method: 'DELETE' })

export const finalizeSettlement = (id: string) =>
  request<SettlementDetail>(`/settlements/${id}/finalize`, { method: 'POST' })

export const voidSettlement = (id: string) =>
  request<SettlementDetail>(`/settlements/${id}/void`, { method: 'POST' })

export const getFeeTemplates = () => request<FeeTemplate[]>('/templates')

export const createFeeTemplate = (value: Omit<FeeTemplate, 'id'>) =>
  request<FeeTemplate>('/templates', { method: 'POST', body: body(value) })

export const updateFeeTemplate = (id: string, value: Omit<FeeTemplate, 'id'>) =>
  request<FeeTemplate>(`/templates/${id}`, { method: 'PATCH', body: body(value) })

export const deactivateFeeTemplate = (id: string) =>
  request<{ ok: boolean }>(`/templates/${id}`, { method: 'DELETE' })

export const applyContractorDefaults = (claimRef: string, templateIds?: string[]) =>
  request<{ applied: number; skipped: Array<{ templateId: string; reason: string }>; plan: FinancialPlan }>(
    `/claims/${encodeURIComponent(claimRef)}/apply-template`,
    { method: 'POST', body: body({ templateIds }) },
  )

export const createBudgetLine = (claimRef: string, value: Omit<BudgetLine, 'id' | 'claimId'>) =>
  request<BudgetLine>(`/claims/${encodeURIComponent(claimRef)}/budgets`, { method: 'POST', body: body(value) })

export const updateBudgetLine = (id: string, value: Partial<Omit<BudgetLine, 'id' | 'claimId'>>) =>
  request<BudgetLine>(`/budgets/${id}`, { method: 'PATCH', body: body(value) })

export const deleteBudgetLine = (id: string) =>
  request<{ ok: boolean }>(`/budgets/${id}`, { method: 'DELETE' })

export interface ExpenseInput {
  moduleId?: string | null
  name: string
  expenseKind: ExpenseKind
  payerName?: string
  payeeName: string
  amount: number
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  scopeNotes?: string
  calculationMode?: CalculationMode
  calculationBasis?: CalculationBasis
  ratePercent?: number
  feeState?: 'Projected' | 'Waived'
}

export const createPlanningExpense = (claimRef: string, value: ExpenseInput) =>
  request<{ id: string; plan: FinancialPlan }>(`/claims/${encodeURIComponent(claimRef)}/expenses`, {
    method: 'POST', body: body(value),
  })

export const updatePlanningExpense = (id: string, value: Partial<ExpenseInput>) =>
  request<{ id: string; plan: FinancialPlan }>(`/expenses/${id}`, { method: 'PATCH', body: body(value) })

export const deletePlanningExpense = (id: string) =>
  request<{ ok: boolean; plan: FinancialPlan }>(`/expenses/${id}`, { method: 'DELETE' })

export const markPlanningFeeDue = (id: string) =>
  request<{ id: string; plan: FinancialPlan }>(`/expenses/${id}/mark-due`, { method: 'POST' })

export const createPlanningPayment = (expenseId: string, value: {
  amount: number
  paymentDate: string
  method?: string
  checkNumber?: string
  notes?: string
}) => request<{ id: string; plan: FinancialPlan }>(`/expenses/${expenseId}/payments`, {
  method: 'POST', body: body(value),
})

export const deletePlanningPayment = (id: string) =>
  request<{ ok: boolean; plan: FinancialPlan | null }>(`/payments/${id}`, { method: 'DELETE' })
