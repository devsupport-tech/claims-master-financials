import { fromCents, toCents } from "./settlement-calculations.js";

export interface ThirdPartyDeduction {
  amount: number;
  included?: boolean;
  description?: string;
  payerName?: string | null;
  payeeName?: string | null;
  payeeRole: "Company" | "Third Party";
}

export interface PriorThirdPartyObligation {
  payeeName?: string | null;
  amount: number;
}

export interface ThirdPartyObligation {
  expense_name: string;
  category: string;
  expense_kind: "Referral Fee";
  payer_name: string;
  billing_entity: string;
  amount: number;
  date: string;
  basis_amount: number;
  notes: string;
}

interface Entitlement {
  name: string;
  amountCents: number;
  payerName: string;
  category: string;
  descriptions: string[];
}

function key(name: string) {
  return name.trim().toLocaleLowerCase();
}

export function buildThirdPartyObligations(input: {
  settlementNumber: number;
  asOfDate: string;
  companyName: string;
  contractorName?: string | null;
  referralName?: string | null;
  referralPaidBy: "Company" | "Contractor" | "Split";
  referralCommission: number;
  deductions: ThirdPartyDeduction[];
  priorObligations: PriorThirdPartyObligation[];
  expectedCurrentTotal: number;
}): { obligations: ThirdPartyObligation[]; errors: string[] } {
  const errors: string[] = [];
  const entitlements = new Map<string, Entitlement>();
  const addEntitlement = (name: string, amountCents: number, payerName: string, category: string, description: string) => {
    const id = key(name);
    const current = entitlements.get(id);
    entitlements.set(id, current ? {
      ...current,
      amountCents: current.amountCents + amountCents,
      descriptions: [...current.descriptions, description],
    } : { name: name.trim(), amountCents, payerName, category, descriptions: [description] });
  };

  const referralCents = toCents(input.referralCommission);
  if (referralCents > 0) {
    const recipient = String(input.referralName ?? "").trim();
    if (!recipient) errors.push("Referral recipient is required for the referral obligation");
    else addEntitlement(
      recipient,
      referralCents,
      input.referralPaidBy === "Contractor" ? String(input.contractorName ?? "").trim() : input.companyName,
      "Referral Fee",
      "Referral commission",
    );
  }

  for (const deduction of input.deductions) {
    if (deduction.included === false || deduction.payeeRole !== "Third Party") continue;
    const recipient = String(deduction.payeeName ?? "").trim();
    if (!recipient) {
      errors.push(`Third-party recipient is required for deduction: ${deduction.description ?? "Unnamed deduction"}`);
      continue;
    }
    addEntitlement(
      recipient,
      toCents(deduction.amount),
      String(deduction.payerName ?? input.contractorName ?? "").trim(),
      "Contractor Deduction",
      deduction.description ?? "Contractor deduction",
    );
  }

  const priorByRecipient = new Map<string, number>();
  for (const prior of input.priorObligations) {
    const recipient = String(prior.payeeName ?? "").trim();
    if (!recipient) continue;
    const id = key(recipient);
    priorByRecipient.set(id, (priorByRecipient.get(id) ?? 0) + toCents(prior.amount));
  }

  const obligations: ThirdPartyObligation[] = [];
  const recipientKeys = new Set([...entitlements.keys(), ...priorByRecipient.keys()]);
  for (const id of recipientKeys) {
    const entitlement = entitlements.get(id);
    const currentCents = (entitlement?.amountCents ?? 0) - (priorByRecipient.get(id) ?? 0);
    if (currentCents < 0) {
      errors.push(`Prior distributions to ${entitlement?.name ?? id} exceed the current cumulative entitlement`);
      continue;
    }
    if (!entitlement || currentCents === 0) continue;
    if (!entitlement.payerName) {
      errors.push(`Payer is required for the obligation to ${entitlement.name}`);
      continue;
    }
    obligations.push({
      expense_name: `Settlement #${input.settlementNumber} · ${entitlement.descriptions.join("; ")}`,
      category: entitlement.category,
      expense_kind: "Referral Fee",
      payer_name: entitlement.payerName,
      billing_entity: entitlement.name,
      amount: fromCents(currentCents),
      date: input.asOfDate,
      basis_amount: fromCents(entitlement.amountCents),
      notes: `Locked third-party payment from finalized settlement #${input.settlementNumber}`,
    });
  }

  const obligationTotal = obligations.reduce((sum, obligation) => sum + toCents(obligation.amount), 0);
  if (obligationTotal !== toCents(input.expectedCurrentTotal)) {
    errors.push("Recipient-specific third-party obligations do not match the settlement calculation");
  }
  return { obligations, errors };
}
