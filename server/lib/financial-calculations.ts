export type FeeCalculationBasis =
  | "Approved Revenue"
  | "Collected Revenue"
  | "Gross Profit Before Fees";

export type FeeCalculationMode = "Percentage" | "Flat" | "Manual";

export interface ClaimRevenueSource {
  totalApprovedBudget?: number | null;
  rcv?: number | null;
}

export interface ServiceBudgetSource {
  approvedEstimateAmount?: number | null;
  hasSupplement?: boolean | null;
  supplementApprovedAmount?: number | null;
}

export interface BudgetSource {
  budgetAmount?: number | null;
}

export interface LedgerSource {
  amount?: number | null;
  direction?: string | null;
  fieldsRaw?: unknown;
}

export interface ExpenseSource {
  id: string;
  amount?: number | null;
  expenseKind?: string | null;
  calculationMode?: string | null;
  calculationBasis?: string | null;
  ratePercent?: number | null;
  basisAmount?: number | null;
  feeState?: string | null;
}

export interface PaymentSource {
  projectExpenseId?: string | null;
  amount?: number | null;
}

export interface FinancialPlanInput {
  claim: ClaimRevenueSource;
  services: ServiceBudgetSource[];
  budgets: BudgetSource[];
  ledger: LedgerSource[];
  expenses: ExpenseSource[];
  payments: PaymentSource[];
}

export interface ExpenseCalculation {
  effectiveAmount: number;
  paidAmount: number;
  balance: number;
  previewAmount: number;
  staleProjectedAmount: boolean;
  status: "Projected" | "Due" | "Partial" | "Paid" | "Waived";
}

export interface FinancialPlanMetrics {
  approvedRevenue: number;
  collectedRevenue: number;
  budgetedDirectCost: number;
  committedDirectCost: number;
  paidDirectCost: number;
  feeObligations: number;
  paidFees: number;
  projectedFees: number;
  otherUnlinkedOutflows: number;
  remainingBudget: number;
  grossProfitBeforeFees: number;
  projectedProfit: number;
  expectedProfit: number;
  cashProfit: number;
}

const FEE_KINDS = new Set(["Commission", "Referral Fee"]);

export function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

export function isFeeKind(kind: string | null | undefined): boolean {
  return FEE_KINDS.has(String(kind ?? ""));
}

export function approvedRevenue(
  claim: ClaimRevenueSource,
  services: ServiceBudgetSource[],
): number {
  const serviceTotal = money(services.reduce((sum, service) => {
    const approved = money(service.approvedEstimateAmount);
    const supplement = service.hasSupplement ? money(service.supplementApprovedAmount) : 0;
    return sum + approved + supplement;
  }, 0));
  if (serviceTotal > 0) return serviceTotal;
  const approvedBudget = money(claim.totalApprovedBudget);
  return approvedBudget > 0 ? approvedBudget : money(claim.rcv);
}

export function feeBasisAmount(
  basis: string | null | undefined,
  values: Pick<FinancialPlanMetrics, "approvedRevenue" | "collectedRevenue" | "grossProfitBeforeFees">,
): number {
  const value = basis === "Collected Revenue"
    ? values.collectedRevenue
    : basis === "Gross Profit Before Fees"
      ? values.grossProfitBeforeFees
      : values.approvedRevenue;
  return money(Math.max(value, 0));
}

export function feePreviewAmount(
  expense: ExpenseSource,
  values: Pick<FinancialPlanMetrics, "approvedRevenue" | "collectedRevenue" | "grossProfitBeforeFees">,
): number {
  if (expense.calculationMode !== "Percentage") return money(expense.amount);
  const basis = feeBasisAmount(expense.calculationBasis, values);
  return money(basis * money(expense.ratePercent) / 100);
}

function hasLinkedExpense(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const value = (raw as Record<string, unknown>)["Project Expense"];
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

export function calculateFinancialPlan(input: FinancialPlanInput): {
  metrics: FinancialPlanMetrics;
  expenses: Record<string, ExpenseCalculation>;
} {
  const approved = approvedRevenue(input.claim, input.services);
  const collected = money(input.ledger.reduce((sum, entry) =>
    entry.direction === "Inflow" ? sum + money(entry.amount) : sum, 0));
  const budgeted = money(input.budgets.reduce((sum, line) => sum + money(line.budgetAmount), 0));
  const directExpenses = input.expenses.filter((expense) => !isFeeKind(expense.expenseKind));
  const feeExpenses = input.expenses.filter((expense) => isFeeKind(expense.expenseKind));
  const committed = money(directExpenses.reduce((sum, expense) => sum + money(expense.amount), 0));
  const paymentsByExpense = new Map<string, number>();
  for (const payment of input.payments) {
    if (!payment.projectExpenseId) continue;
    paymentsByExpense.set(
      payment.projectExpenseId,
      money((paymentsByExpense.get(payment.projectExpenseId) ?? 0) + money(payment.amount)),
    );
  }
  const paidDirect = money(directExpenses.reduce(
    (sum, expense) => sum + (paymentsByExpense.get(expense.id) ?? 0), 0,
  ));
  const paidFees = money(feeExpenses.reduce(
    (sum, expense) => sum + (paymentsByExpense.get(expense.id) ?? 0), 0,
  ));
  const gross = money(approved - committed);
  const basisValues = {
    approvedRevenue: approved,
    collectedRevenue: collected,
    grossProfitBeforeFees: gross,
  };

  let allFees = 0;
  const expenseCalculations: Record<string, ExpenseCalculation> = {};
  for (const expense of input.expenses) {
    const paid = paymentsByExpense.get(expense.id) ?? 0;
    const isFee = isFeeKind(expense.expenseKind);
    const preview = isFee ? feePreviewAmount(expense, basisValues) : money(expense.amount);
    const waived = expense.feeState === "Waived";
    const effective = waived ? 0 : expense.feeState === "Due" ? money(expense.amount) : preview;
    if (isFee) allFees = money(allFees + effective);
    const balance = money(Math.max(effective - paid, 0));
    const status = waived
      ? "Waived"
      : paid > 0 && balance === 0
        ? "Paid"
        : paid > 0
          ? "Partial"
          : expense.feeState === "Due"
            ? "Due"
            : "Projected";
    expenseCalculations[expense.id] = {
      effectiveAmount: effective,
      paidAmount: paid,
      balance,
      previewAmount: preview,
      staleProjectedAmount:
        isFee && expense.feeState === "Projected" && money(expense.amount) !== preview,
      status,
    };
  }

  const otherOutflows = money(input.ledger.reduce((sum, entry) =>
    entry.direction === "Outflow" && !hasLinkedExpense(entry.fieldsRaw)
      ? sum + money(entry.amount)
      : sum, 0));
  const remainingBudget = money(budgeted - committed);
  const metrics: FinancialPlanMetrics = {
    approvedRevenue: approved,
    collectedRevenue: collected,
    budgetedDirectCost: budgeted,
    committedDirectCost: committed,
    paidDirectCost: paidDirect,
    feeObligations: allFees,
    paidFees,
    projectedFees: allFees,
    otherUnlinkedOutflows: otherOutflows,
    remainingBudget,
    grossProfitBeforeFees: gross,
    projectedProfit: money(approved - budgeted - allFees),
    expectedProfit: money(approved - committed - allFees),
    cashProfit: money(collected - paidDirect - paidFees - otherOutflows),
  };
  return { metrics, expenses: expenseCalculations };
}
