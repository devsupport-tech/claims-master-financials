import assert from "node:assert/strict";
import test from "node:test";

import { buildSettlementSeedRows } from "./settlement-snapshots.js";

test("cumulative seed carries manual and sourced history without duplication", () => {
  const rows = buildSettlementSeedRows({
    settlementId: "settlement-2",
    companyName: "CBRS Group",
    contractorName: "Partner",
    priorLines: [
      {
        settlement_id: "settlement-1", line_type: "Revenue", source_table: "financial_ledger",
        source_id: "revenue-1", description: "First check", amount: 25_000, included: true,
      },
      {
        settlement_id: "settlement-1", line_type: "Contractor Deduction", description: "Advance fee",
        amount: 250, included: true, metadata: { payeeRole: "Company" },
      },
    ],
    revenueSources: [
      { id: "revenue-1", entry_name: "First check edited", amount: 30_000 },
      { id: "revenue-2", entry_name: "Second check", amount: 10_000 },
    ],
    expenseSources: [],
  });

  assert.equal(rows.length, 3);
  assert.equal(rows[0].description, "First check");
  assert.equal(rows[0].amount, 25_000);
  assert.equal(rows[0].metadata.carriedFromSettlementId, "settlement-1");
  assert.equal(rows[0].metadata.sourceChanged, true);
  assert.equal(rows[0].metadata.currentSourceAmount, 30_000);
  assert.equal(rows[1].line_type, "Contractor Deduction");
  assert.equal(rows[1].metadata.carriedFromSettlementId, "settlement-1");
  assert.equal(rows[2].source_id, "revenue-2");
});

test("deleted source snapshots survive and new expenses require confirmation", () => {
  const rows = buildSettlementSeedRows({
    settlementId: "settlement-2",
    companyName: "CBRS Group",
    priorLines: [{
      settlement_id: "settlement-1", line_type: "Company Expense", source_table: "project_expenses",
      source_id: "deleted-expense", description: "Historical cost", amount: 500, included: true,
    }],
    revenueSources: [],
    expenseSources: [
      { id: "expense-2", expense_name: "Unconfirmed cost", amount: 300, reimbursable: false },
      { id: "expense-3", expense_name: "Confirmed cost", amount: 400, reimbursable: true },
      { id: "expense-4", expense_name: "Contractor-paid cost", payer_name: "Partner", amount: 200, reimbursable: true },
    ],
  });

  assert.equal(rows[0].metadata.sourceDeleted, true);
  assert.equal(rows[0].amount, 500);
  assert.equal(rows[1].included, false);
  assert.match(rows[1].exclusion_reason ?? "", /not marked/i);
  assert.equal(rows[2].included, true);
  assert.equal(rows[3].included, false);
  assert.match(rows[3].exclusion_reason ?? "", /company-paid/i);
});

test("a previously excluded source stays editable and is not re-added", () => {
  const rows = buildSettlementSeedRows({
    settlementId: "settlement-2",
    companyName: "CBRS Group",
    priorLines: [{
      settlement_id: "settlement-1", line_type: "Revenue", source_table: "financial_ledger",
      source_id: "revenue-1", description: "Deferred check", amount: 2_000, included: false,
      exclusion_reason: "Not cleared at prior cutoff",
    }],
    revenueSources: [{ id: "revenue-1", amount: 2_000 }],
    expenseSources: [],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].included, false);
  assert.equal(rows[0].exclusion_reason, "Not cleared at prior cutoff");
});
