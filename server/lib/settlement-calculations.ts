export type CompensationType = "Production Partner" | "Commission Contractor" | "Referral Only";
export type CalculationBasis =
  | "Collected Revenue"
  | "Revenue After Admin"
  | "Net Split Pool"
  | "Gross Profit Before Fees"
  | "Contractor Share"
  | "Fixed Amount";
export type ReferralPaidBy = "Company" | "Contractor" | "Split";

export interface SettlementTerms {
  compensationType: CompensationType;
  companyName: string;
  contractorName?: string | null;
  referralName?: string | null;
  adminRatePercent: number;
  adminFixedAmount: number;
  contractorSplitPercent: number;
  companySplitPercent: number;
  commissionCalculationMode: "Percentage" | "Flat";
  commissionBasis: Exclude<CalculationBasis, "Contractor Share">;
  commissionRatePercent: number;
  commissionFixedAmount: number;
  referralApplicable: boolean;
  referralBasis: Exclude<CalculationBasis, "Gross Profit Before Fees">;
  referralRatePercent: number;
  referralFixedAmount: number;
  referralPaidBy: ReferralPaidBy;
  referralContractorSharePercent: number;
}

export interface SettlementAmountLine {
  id?: string;
  description?: string;
  amount: number;
  included?: boolean;
}

export interface SettlementDeductionLine extends SettlementAmountLine {
  payeeRole: "Company" | "Third Party";
}

export interface PriorSettlementDistributions {
  contractor: number;
  company: number;
  thirdParty: number;
}

export interface SettlementCalculationInput {
  terms: SettlementTerms;
  revenue: SettlementAmountLine[];
  companyExpenses: SettlementAmountLine[];
  contractorDeductions: SettlementDeductionLine[];
  contractorReimbursements: SettlementAmountLine[];
  priorAdvances: SettlementAmountLine[];
  priorDistributions: PriorSettlementDistributions;
}

export interface SettlementCalculation {
  collectedRevenue: number;
  adminFee: number;
  revenueAfterAdmin: number;
  companyExpenses: number;
  grossProfitBeforeFees: number;
  netSplitPool: number;
  contractorGrossShare: number;
  companyGrossShare: number;
  referralBasisAmount: number;
  referralCommission: number;
  contractorReferralShare: number;
  companyReferralShare: number;
  contractorDeductions: number;
  deductionsPayableToCompany: number;
  deductionsPayableToThirdParty: number;
  contractorReimbursements: number;
  priorAdvances: number;
  cumulativeContractorEntitlement: number;
  cumulativeCompanyEntitlement: number;
  cumulativeThirdPartyEntitlement: number;
  priorContractorDistributions: number;
  priorCompanyDistributions: number;
  priorThirdPartyDistributions: number;
  finalContractorPayment: number;
  companyDistribution: number;
  thirdPartyPayments: number;
  contractorCarryForward: number;
  reconciliationDifference: number;
  errors: string[];
  validForFinalization: boolean;
}

function finite(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function toCents(value: unknown): number {
  return Math.round((finite(value) + Number.EPSILON) * 100);
}

export function fromCents(value: number): number {
  return Math.round(value) / 100;
}

function percentOfCents(amountCents: number, ratePercent: number): number {
  return Math.round(amountCents * finite(ratePercent) / 100);
}

function includedTotal(lines: SettlementAmountLine[]): number {
  return lines.reduce((sum, line) => line.included === false ? sum : sum + toCents(line.amount), 0);
}

function validPercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function amountForBasis(
  basis: CalculationBasis,
  values: {
    collected: number;
    afterAdmin: number;
    netSplitPool: number;
    grossProfitBeforeFees: number;
    contractorShare: number;
    fixed: number;
  },
): number {
  if (basis === "Revenue After Admin") return values.afterAdmin;
  if (basis === "Net Split Pool") return values.netSplitPool;
  if (basis === "Gross Profit Before Fees") return values.grossProfitBeforeFees;
  if (basis === "Contractor Share") return values.contractorShare;
  if (basis === "Fixed Amount") return values.fixed;
  return values.collected;
}

export function calculateSettlement(input: SettlementCalculationInput): SettlementCalculation {
  const { terms } = input;
  const errors: string[] = [];
  const collected = includedTotal(input.revenue);
  const expenses = includedTotal(input.companyExpenses);
  const adminRate = finite(terms.adminRatePercent);
  const adminFixed = toCents(terms.adminFixedAmount);

  if (!terms.companyName.trim()) errors.push("Company name is required");
  if (!validPercent(adminRate)) errors.push("Admin rate must be between 0 and 100");
  if (adminFixed < 0) errors.push("Fixed admin fee cannot be negative");
  if (terms.compensationType !== "Referral Only" && !String(terms.contractorName ?? "").trim()) {
    errors.push("Contractor name is required");
  }

  const adminFee = percentOfCents(collected, adminRate) + adminFixed;
  const afterAdmin = collected - adminFee;
  const grossProfitBeforeFees = collected - expenses;
  const netSplitPool = afterAdmin - expenses;
  if (netSplitPool < 0) errors.push("Net Split Pool cannot be negative when finalizing a settlement");

  let contractorGross = 0;
  let companyGross = netSplitPool;
  if (terms.compensationType === "Production Partner") {
    const contractorSplit = finite(terms.contractorSplitPercent);
    const companySplit = finite(terms.companySplitPercent);
    if (!validPercent(contractorSplit) || !validPercent(companySplit) || contractorSplit + companySplit !== 100) {
      errors.push("Contractor and company split percentages must total 100");
    }
    contractorGross = percentOfCents(netSplitPool, contractorSplit);
    companyGross = netSplitPool - contractorGross;
  } else if (terms.compensationType === "Commission Contractor") {
    if (terms.commissionCalculationMode === "Flat" || terms.commissionBasis === "Fixed Amount") {
      contractorGross = toCents(terms.commissionFixedAmount);
    } else {
      if (!validPercent(finite(terms.commissionRatePercent))) {
        errors.push("Commission rate must be between 0 and 100");
      }
      const basis = amountForBasis(terms.commissionBasis, {
        collected,
        afterAdmin,
        netSplitPool,
        grossProfitBeforeFees,
        contractorShare: 0,
        fixed: toCents(terms.commissionFixedAmount),
      });
      contractorGross = percentOfCents(basis, terms.commissionRatePercent);
    }
    companyGross = netSplitPool - contractorGross;
    if (companyGross < 0) errors.push("Contractor commission exceeds the Net Split Pool");
  }

  const referralEnabled = terms.referralApplicable || terms.compensationType === "Referral Only";
  if (referralEnabled && !String(terms.referralName ?? "").trim()) errors.push("Referral recipient is required");
  if (!validPercent(finite(terms.referralRatePercent))) errors.push("Referral rate must be between 0 and 100");
  const referralBasis = referralEnabled
    ? amountForBasis(terms.referralBasis, {
      collected,
      afterAdmin,
      netSplitPool,
      grossProfitBeforeFees,
      contractorShare: contractorGross,
      fixed: toCents(terms.referralFixedAmount),
    })
    : 0;
  const referral = !referralEnabled
    ? 0
    : terms.referralBasis === "Fixed Amount"
      ? toCents(terms.referralFixedAmount)
      : percentOfCents(referralBasis, terms.referralRatePercent);

  let contractorReferral = 0;
  if (terms.referralPaidBy === "Contractor") contractorReferral = referral;
  if (terms.referralPaidBy === "Split") {
    if (!validPercent(finite(terms.referralContractorSharePercent))) {
      errors.push("Contractor referral funding percentage must be between 0 and 100");
    }
    contractorReferral = percentOfCents(referral, terms.referralContractorSharePercent);
  }
  const companyReferral = referral - contractorReferral;

  const deductions = includedTotal(input.contractorDeductions);
  const deductionsCompany = input.contractorDeductions.reduce((sum, line) =>
    line.included === false || line.payeeRole !== "Company" ? sum : sum + toCents(line.amount), 0);
  const deductionsThirdParty = deductions - deductionsCompany;
  const reimbursements = includedTotal(input.contractorReimbursements);
  const advances = includedTotal(input.priorAdvances);

  const cumulativeContractor = contractorGross - contractorReferral - deductions + reimbursements;
  const cumulativeCompany = companyGross + adminFee + expenses - companyReferral - reimbursements + deductionsCompany;
  const cumulativeThirdParty = referral + deductionsThirdParty;
  const reconciliation = collected - cumulativeContractor - cumulativeCompany - cumulativeThirdParty;
  if (reconciliation !== 0) errors.push("Settlement distributions do not reconcile to collected revenue");

  const priorContractor = toCents(input.priorDistributions.contractor);
  const priorCompany = toCents(input.priorDistributions.company);
  const priorThirdParty = toCents(input.priorDistributions.thirdParty);
  const contractorCurrent = cumulativeContractor - priorContractor - advances;
  const contractorPayment = Math.max(contractorCurrent, 0);
  const contractorCarryForward = Math.max(-contractorCurrent, 0);
  const companyCurrent = cumulativeCompany - priorCompany;
  const thirdPartyCurrent = cumulativeThirdParty - priorThirdParty;
  if (companyCurrent < 0) errors.push("Prior company distributions exceed the current cumulative entitlement");
  if (thirdPartyCurrent < 0) errors.push("Prior third-party distributions exceed the current cumulative entitlement");

  const result = {
    collectedRevenue: collected,
    adminFee,
    revenueAfterAdmin: afterAdmin,
    companyExpenses: expenses,
    grossProfitBeforeFees,
    netSplitPool,
    contractorGrossShare: contractorGross,
    companyGrossShare: companyGross,
    referralBasisAmount: referralBasis,
    referralCommission: referral,
    contractorReferralShare: contractorReferral,
    companyReferralShare: companyReferral,
    contractorDeductions: deductions,
    deductionsPayableToCompany: deductionsCompany,
    deductionsPayableToThirdParty: deductionsThirdParty,
    contractorReimbursements: reimbursements,
    priorAdvances: advances,
    cumulativeContractorEntitlement: cumulativeContractor,
    cumulativeCompanyEntitlement: cumulativeCompany,
    cumulativeThirdPartyEntitlement: cumulativeThirdParty,
    priorContractorDistributions: priorContractor,
    priorCompanyDistributions: priorCompany,
    priorThirdPartyDistributions: priorThirdParty,
    finalContractorPayment: contractorPayment,
    companyDistribution: companyCurrent,
    thirdPartyPayments: thirdPartyCurrent,
    contractorCarryForward,
    reconciliationDifference: reconciliation,
  };

  return {
    ...Object.fromEntries(Object.entries(result).map(([key, value]) => [key, fromCents(value)])) as Omit<SettlementCalculation, "errors" | "validForFinalization">,
    errors,
    validForFinalization: errors.length === 0,
  };
}
