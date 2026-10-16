/* Generated database types lag additive financial migrations. Keep this shared
 * adapter identical for editable plans and read-only contractor totals. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export function calculationInput(
  claim: Row,
  jobs: Row[],
  budgets: Row[],
  ledger: Row[],
  expenses: Row[],
  payments: Row[],
) {
  return {
    claim: { totalApprovedBudget: claim.total_approved_budget, rcv: claim.rcv },
    services: jobs.map((row) => ({
      approvedEstimateAmount: row.approved_estimate_amount,
      hasSupplement: row.has_supplement,
      supplementApprovedAmount: row.supplement_approved_amount,
    })),
    budgets: budgets.map((row) => ({ budgetAmount: row.budget_amount })),
    ledger: ledger.map((row) => ({
      amount: row.amount,
      direction: row.direction,
      fieldsRaw: row.fields_raw,
    })),
    expenses: expenses.map((row) => ({
      id: row.id,
      amount: row.amount,
      expenseKind: row.expense_kind,
      calculationMode: row.calculation_mode,
      calculationBasis: row.calculation_basis,
      ratePercent: row.rate_percent,
      basisAmount: row.basis_amount,
      feeState: row.fee_state,
    })),
    payments: payments.map((row) => ({
      projectExpenseId: row.project_expense_id,
      amount: row.amount,
    })),
  };
}
