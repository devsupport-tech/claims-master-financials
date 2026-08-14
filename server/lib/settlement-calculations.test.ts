import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateSettlement,
  type SettlementCalculationInput,
  type SettlementTerms,
} from "./settlement-calculations.js";

const baseTerms: SettlementTerms = {
  compensationType: "Production Partner",
  companyName: "CBRS Group",
  contractorName: "Restoration Partner",
  referralName: null,
  adminRatePercent: 10,
  adminFixedAmount: 0,
  contractorSplitPercent: 50,
  companySplitPercent: 50,
  commissionCalculationMode: "Percentage",
  commissionBasis: "Collected Revenue",
  commissionRatePercent: 0,
  commissionFixedAmount: 0,
  referralApplicable: false,
  referralBasis: "Collected Revenue",
  referralRatePercent: 0,
  referralFixedAmount: 0,
  referralPaidBy: "Company",
  referralContractorSharePercent: 0,
};

function input(overrides: Partial<SettlementCalculationInput> = {}): SettlementCalculationInput {
  return {
    terms: baseTerms,
    revenue: [{ amount: 25_000 }],
    companyExpenses: [{ amount: 8_500 }],
    contractorDeductions: [],
    contractorReimbursements: [],
    priorAdvances: [],
    priorDistributions: { contractor: 0, company: 0, thirdParty: 0 },
    ...overrides,
  };
}

test("authoritative 25,000 waterfall example reconciles exactly", () => {
  const result = calculateSettlement(input());
  assert.equal(result.adminFee, 2_500);
  assert.equal(result.netSplitPool, 14_000);
  assert.equal(result.contractorGrossShare, 7_000);
  assert.equal(result.finalContractorPayment, 7_000);
  assert.equal(result.companyDistribution, 18_000);
  assert.equal(result.thirdPartyPayments, 0);
  assert.equal(result.reconciliationDifference, 0);
  assert.equal(result.validForFinalization, true);
});

test("percentage and fixed admin fees are additive before company-paid costs", () => {
  const result = calculateSettlement(input({
    terms: { ...baseTerms, adminRatePercent: 5, adminFixedAmount: 250 },
  }));
  assert.equal(result.adminFee, 1_500);
  assert.equal(result.revenueAfterAdmin, 23_500);
  assert.equal(result.netSplitPool, 15_000);
  assert.equal(result.reconciliationDifference, 0);
});

test("authoritative 50,000 example applies a contractor-funded referral", () => {
  const result = calculateSettlement(input({
    terms: {
      ...baseTerms,
      contractorSplitPercent: 60,
      companySplitPercent: 40,
      referralApplicable: true,
      referralName: "Referral Partner",
      referralBasis: "Fixed Amount",
      referralFixedAmount: 1_000,
      referralPaidBy: "Contractor",
      referralContractorSharePercent: 100,
    },
    revenue: [{ amount: 50_000 }],
    companyExpenses: [{ amount: 8_000 }, { amount: 7_000 }, { amount: 2_000 }],
  }));
  assert.equal(result.adminFee, 5_000);
  assert.equal(result.netSplitPool, 28_000);
  assert.equal(result.contractorGrossShare, 16_800);
  assert.equal(result.finalContractorPayment, 15_800);
  assert.equal(result.companyDistribution, 33_200);
  assert.equal(result.thirdPartyPayments, 1_000);
  assert.equal(result.reconciliationDifference, 0);
});

test("referral bases and funding parties use the waterfall values", () => {
  const expected = new Map([
    ["Collected Revenue", 2_500],
    ["Revenue After Admin", 2_250],
    ["Net Split Pool", 1_400],
    ["Contractor Share", 700],
  ]);
  for (const [basis, amount] of expected) {
    const result = calculateSettlement(input({ terms: {
      ...baseTerms,
      referralApplicable: true,
      referralName: "Referral Partner",
      referralBasis: basis as SettlementTerms["referralBasis"],
      referralRatePercent: 10,
      referralPaidBy: "Split",
      referralContractorSharePercent: 40,
    } }));
    assert.equal(result.referralCommission, amount);
    assert.equal(result.contractorReferralShare, amount * 0.4);
    assert.equal(result.companyReferralShare, amount * 0.6);
    assert.equal(result.reconciliationDifference, 0);
  }
});

test("commission contractor supports percentage and flat calculations", () => {
  const percentage = calculateSettlement(input({ terms: {
    ...baseTerms,
    compensationType: "Commission Contractor",
    commissionBasis: "Revenue After Admin",
    commissionRatePercent: 20,
  } }));
  assert.equal(percentage.contractorGrossShare, 4_500);
  assert.equal(percentage.companyDistribution, 20_500);

  const flat = calculateSettlement(input({ terms: {
    ...baseTerms,
    compensationType: "Commission Contractor",
    commissionCalculationMode: "Flat",
    commissionBasis: "Fixed Amount",
    commissionFixedAmount: 3_250,
  } }));
  assert.equal(flat.contractorGrossShare, 3_250);
  assert.equal(flat.companyDistribution, 21_750);
});

test("referral-only settlements pay the referral and leave the remainder with the company", () => {
  const result = calculateSettlement(input({ terms: {
    ...baseTerms,
    compensationType: "Referral Only",
    contractorName: null,
    referralApplicable: true,
    referralName: "Lead Partner",
    referralBasis: "Collected Revenue",
    referralRatePercent: 5,
    referralPaidBy: "Company",
  } }));
  assert.equal(result.contractorGrossShare, 0);
  assert.equal(result.referralCommission, 1_250);
  assert.equal(result.companyDistribution, 23_750);
  assert.equal(result.thirdPartyPayments, 1_250);
  assert.equal(result.reconciliationDifference, 0);
});

test("deductions and reimbursements conserve money by destination", () => {
  const result = calculateSettlement(input({
    contractorDeductions: [
      { amount: 200, payeeRole: "Company" },
      { amount: 50, payeeRole: "Third Party" },
    ],
    contractorReimbursements: [{ amount: 400 }],
  }));
  assert.equal(result.finalContractorPayment, 7_150);
  assert.equal(result.companyDistribution, 17_800);
  assert.equal(result.thirdPartyPayments, 50);
  assert.equal(result.reconciliationDifference, 0);
});

test("cumulative settlements subtract prior distributions and carry negative contractor balances", () => {
  const next = calculateSettlement(input({
    priorDistributions: { contractor: 6_000, company: 10_000, thirdParty: 0 },
  }));
  assert.equal(next.finalContractorPayment, 1_000);
  assert.equal(next.companyDistribution, 8_000);

  const lateExpense = calculateSettlement(input({
    companyExpenses: [{ amount: 20_000 }],
    priorDistributions: { contractor: 2_000, company: 20_000, thirdParty: 0 },
  }));
  assert.equal(lateExpense.finalContractorPayment, 0);
  assert.ok(lateExpense.contractorCarryForward > 0);
  assert.equal(lateExpense.validForFinalization, true);
});

test("a second cumulative settlement pays only the new incremental entitlement", () => {
  const first = calculateSettlement(input());
  const second = calculateSettlement(input({
    revenue: [{ amount: 25_000 }, { amount: 10_000 }],
    companyExpenses: [{ amount: 8_500 }, { amount: 1_500 }],
    priorDistributions: {
      contractor: first.finalContractorPayment,
      company: first.companyDistribution,
      thirdParty: first.thirdPartyPayments,
    },
  }));
  assert.equal(second.collectedRevenue, 35_000);
  assert.equal(second.cumulativeContractorEntitlement, 10_750);
  assert.equal(second.finalContractorPayment, 3_750);
  assert.equal(second.companyDistribution, 6_250);
  assert.equal(second.finalContractorPayment + second.companyDistribution + second.thirdPartyPayments, 10_000);
});

test("prior advances remain cumulative without being deducted twice", () => {
  const first = calculateSettlement(input({ priorAdvances: [{ amount: 1_000 }] }));
  assert.equal(first.finalContractorPayment, 6_000);
  const second = calculateSettlement(input({
    revenue: [{ amount: 25_000 }, { amount: 10_000 }],
    companyExpenses: [{ amount: 8_500 }, { amount: 1_500 }],
    priorAdvances: [{ amount: 1_000 }],
    priorDistributions: {
      contractor: first.finalContractorPayment,
      company: first.companyDistribution,
      thirdParty: first.thirdPartyPayments,
    },
  }));
  assert.equal(second.finalContractorPayment, 3_750);
});

test("prior company or third-party over-distributions block finalization", () => {
  const result = calculateSettlement(input({
    priorDistributions: { contractor: 0, company: 20_000, thirdParty: 100 },
  }));
  assert.equal(result.validForFinalization, false);
  assert.ok(result.errors.some((message) => message.includes("company distributions")));
  assert.ok(result.errors.some((message) => message.includes("third-party distributions")));
});

test("rounding assigns the residual cent to the company", () => {
  const result = calculateSettlement(input({
    terms: { ...baseTerms, adminRatePercent: 0, contractorSplitPercent: 33.33, companySplitPercent: 66.67 },
    revenue: [{ amount: 100.01 }],
    companyExpenses: [],
  }));
  assert.equal(result.contractorGrossShare, 33.33);
  assert.equal(result.companyGrossShare, 66.68);
  assert.equal(result.reconciliationDifference, 0);
});

test("excluded lines do not affect the settlement", () => {
  const result = calculateSettlement(input({
    revenue: [{ amount: 25_000 }, { amount: 99_000, included: false }],
    companyExpenses: [{ amount: 8_500 }, { amount: 500, included: false }],
    contractorDeductions: [{ amount: 500, payeeRole: "Company", included: false }],
    contractorReimbursements: [{ amount: 500, included: false }],
    priorAdvances: [{ amount: 500, included: false }],
  }));
  assert.equal(result.collectedRevenue, 25_000);
  assert.equal(result.companyExpenses, 8_500);
  assert.equal(result.contractorDeductions, 0);
  assert.equal(result.contractorReimbursements, 0);
  assert.equal(result.priorAdvances, 0);
});

test("invalid splits, rates, negative pools, and missing parties block finalization", () => {
  const invalid = calculateSettlement(input({
    terms: {
      ...baseTerms,
      contractorName: "",
      adminRatePercent: 101,
      contractorSplitPercent: 60,
      companySplitPercent: 60,
    },
    companyExpenses: [{ amount: 30_000 }],
  }));
  assert.equal(invalid.validForFinalization, false);
  assert.ok(invalid.errors.some((message) => message.includes("Contractor name")));
  assert.ok(invalid.errors.some((message) => message.includes("Admin rate")));
  assert.ok(invalid.errors.some((message) => message.includes("total 100")));
  assert.ok(invalid.errors.some((message) => message.includes("Net Split Pool")));
});
