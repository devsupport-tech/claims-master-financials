const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')
const ROOT = `${API_BASE_URL}/financial-planning`

export type BudgetCategory = 'Labor' | 'Materials' | 'Subcontractors' | 'Other'
export type ExpenseKind = 'Labor' | 'Materials' | 'Subcontractor' | 'General' | 'Commission' | 'Referral Fee' | 'Other'
export type FeeType = 'Commission' | 'Referral Fee'
export type CalculationMode = 'Percentage' | 'Flat' | 'Manual'
export type CalculationBasis = 'Approved Revenue' | 'Collected Revenue' | 'Gross Profit Before Fees'
export type PartyRole = 'CBRS Group' | 'Contractor' | 'Referral' | 'Fixed'

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
