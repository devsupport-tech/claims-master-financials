import assert from "node:assert/strict";
import test from "node:test";

import { buildThirdPartyObligations } from "./settlement-obligations.js";

test("creates separate obligations for referral and deduction recipients", () => {
  const result = buildThirdPartyObligations({
    settlementNumber: 1,
    asOfDate: "2026-08-13",
    companyName: "CBRS Group",
    contractorName: "Partner",
    referralName: "Lead Source",
    referralPaidBy: "Split",
    referralCommission: 1_000,
    deductions: [
      { amount: 250, description: "Equipment charge", payerName: "Partner", payeeName: "Equipment Vendor", payeeRole: "Third Party" },
      { amount: 100, description: "Company recovery", payerName: "Partner", payeeName: "CBRS Group", payeeRole: "Company" },
    ],
    priorObligations: [],
    expectedCurrentTotal: 1_250,
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.obligations.map((row) => [row.billing_entity, row.amount]), [
    ["Lead Source", 1_000],
    ["Equipment Vendor", 250],
  ]);
});

test("cumulative obligations subtract prior amounts by recipient", () => {
  const result = buildThirdPartyObligations({
    settlementNumber: 2,
    asOfDate: "2026-08-13",
    companyName: "CBRS Group",
    contractorName: "Partner",
    referralName: "Lead Source",
    referralPaidBy: "Company",
    referralCommission: 1_500,
    deductions: [{ amount: 400, payerName: "Partner", payeeName: "Equipment Vendor", payeeRole: "Third Party" }],
    priorObligations: [{ payeeName: "Lead Source", amount: 1_000 }, { payeeName: "Equipment Vendor", amount: 250 }],
    expectedCurrentTotal: 650,
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.obligations.map((row) => [row.billing_entity, row.amount]), [
    ["Lead Source", 500],
    ["Equipment Vendor", 150],
  ]);
});

test("blocks missing recipients and cumulative over-distribution", () => {
  const result = buildThirdPartyObligations({
    settlementNumber: 2,
    asOfDate: "2026-08-13",
    companyName: "CBRS Group",
    contractorName: "Partner",
    referralPaidBy: "Company",
    referralCommission: 0,
    deductions: [{ amount: 100, description: "Unknown recipient", payeeRole: "Third Party" }],
    priorObligations: [{ payeeName: "Former Lead", amount: 200 }],
    expectedCurrentTotal: -100,
  });
  assert.ok(result.errors.some((message) => message.includes("recipient is required")));
  assert.ok(result.errors.some((message) => message.includes("exceed")));
});
