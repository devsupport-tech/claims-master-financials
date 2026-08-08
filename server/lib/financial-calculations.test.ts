import assert from "node:assert/strict";
import test from "node:test";

import { approvedRevenue, calculateFinancialPlan, feePreviewAmount } from "./financial-calculations.js";

test("approved revenue uses services, then approved claim budget, then RCV", () => {
  assert.equal(approvedRevenue({ totalApprovedBudget: 800, rcv: 900 }, []), 800);
  assert.equal(approvedRevenue({ totalApprovedBudget: 0, rcv: 900 }, []), 900);
  assert.equal(approvedRevenue(
    { totalApprovedBudget: 800, rcv: 900 },
    [{ approvedEstimateAmount: 500, hasSupplement: true, supplementApprovedAmount: 75 }],
  ), 575);
});

test("calculates budgets, fee previews, linked payments, and profit without double counting", () => {
  const result = calculateFinancialPlan({
    claim: { totalApprovedBudget: 10_000, rcv: 12_000 },
    services: [],
    budgets: [{ budgetAmount: 4_000 }],
    ledger: [
      { direction: "Inflow", amount: 6_000 },
      { direction: "Outflow", amount: 250 },
      { direction: "Outflow", amount: 500, fieldsRaw: { "Project Expense": ["direct"] } },
    ],
    expenses: [
      { id: "direct", amount: 3_500, expenseKind: "Labor" },
      {
        id: "fee",
        amount: 0,
        expenseKind: "Commission",
        calculationMode: "Percentage",
        calculationBasis: "Gross Profit Before Fees",
        ratePercent: 10,
        feeState: "Projected",
      },
    ],
    payments: [
      { projectExpenseId: "direct", amount: 1_000 },
      { projectExpenseId: "fee", amount: 200 },
    ],
  });

  assert.equal(result.metrics.grossProfitBeforeFees, 6_500);
  assert.equal(result.expenses.fee.previewAmount, 650);
  assert.equal(result.metrics.projectedProfit, 5_350);
  assert.equal(result.metrics.expectedProfit, 5_850);
  assert.equal(result.metrics.cashProfit, 4_550);
  assert.equal(result.metrics.otherUnlinkedOutflows, 250);
  assert.equal(result.expenses.fee.status, "Partial");
  assert.equal(result.expenses.fee.balance, 450);
});

test("waived fees do not reduce profit and paid due fees derive Paid status", () => {
  const result = calculateFinancialPlan({
    claim: { totalApprovedBudget: 2_000 },
    services: [],
    budgets: [],
    ledger: [],
    expenses: [
      { id: "waived", amount: 300, expenseKind: "Referral Fee", feeState: "Waived" },
      { id: "due", amount: 200, expenseKind: "Commission", feeState: "Due" },
    ],
    payments: [{ projectExpenseId: "due", amount: 200 }],
  });

  assert.equal(result.metrics.feeObligations, 200);
  assert.equal(result.expenses.waived.status, "Waived");
  assert.equal(result.expenses.due.status, "Paid");
});

test("percentage fees support approved, collected, and gross-profit bases", () => {
  const values = { approvedRevenue: 10_000, collectedRevenue: 6_000, grossProfitBeforeFees: 4_000 };
  const base = { id: "fee", amount: 0, expenseKind: "Commission", calculationMode: "Percentage", ratePercent: 5 };
  assert.equal(feePreviewAmount({ ...base, calculationBasis: "Approved Revenue" }, values), 500);
  assert.equal(feePreviewAmount({ ...base, calculationBasis: "Collected Revenue" }, values), 300);
  assert.equal(feePreviewAmount({ ...base, calculationBasis: "Gross Profit Before Fees" }, values), 200);
  assert.equal(feePreviewAmount({ ...base, calculationBasis: "Gross Profit Before Fees" }, { ...values, grossProfitBeforeFees: -100 }), 0);
});

test("flat/manual fees keep their amount and projected fees report stale snapshots", () => {
  const result = calculateFinancialPlan({
    claim: { totalApprovedBudget: 5_000 }, services: [], budgets: [], ledger: [], payments: [],
    expenses: [
      { id: "flat", amount: 250, expenseKind: "Referral Fee", calculationMode: "Flat", feeState: "Projected" },
      { id: "manual", amount: 125, expenseKind: "Commission", calculationMode: "Manual", feeState: "Projected" },
      { id: "stale", amount: 100, expenseKind: "Commission", calculationMode: "Percentage", calculationBasis: "Approved Revenue", ratePercent: 10, feeState: "Projected" },
    ],
  });
  assert.equal(result.expenses.flat.previewAmount, 250);
  assert.equal(result.expenses.manual.previewAmount, 125);
  assert.equal(result.expenses.stale.previewAmount, 500);
  assert.equal(result.expenses.stale.staleProjectedAmount, true);
});
