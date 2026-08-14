export interface PriorSettlementLine {
  settlement_id: string;
  line_type: string;
  source_table?: string | null;
  source_id?: string | null;
  description: string;
  category?: string | null;
  payer_name?: string | null;
  payee_name?: string | null;
  amount: number;
  included: boolean;
  exclusion_reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RevenueSource {
  id: string;
  entry_name?: string | null;
  entry_type?: string | null;
  payer_payee?: string | null;
  amount?: number | null;
  date?: string | null;
  check_number?: string | null;
}

export interface ExpenseSource {
  id: string;
  expense_name?: string | null;
  category?: string | null;
  expense_kind?: string | null;
  payer_name?: string | null;
  billing_entity?: string | null;
  vendor?: string | null;
  amount?: number | null;
  reimbursable?: boolean | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
}

export interface SettlementSeedRow {
  settlement_id: string;
  line_type: string;
  source_table: string | null;
  source_id: string | null;
  description: string;
  category: string | null;
  payer_name: string | null;
  payee_name: string | null;
  amount: number;
  included: boolean;
  exclusion_reason: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
}

function sourceKey(table: unknown, id: unknown) {
  return `${String(table ?? "")}:${String(id ?? "")}`;
}

export function buildSettlementSeedRows(input: {
  settlementId: string;
  companyName?: string | null;
  contractorName?: string | null;
  priorLines: PriorSettlementLine[];
  revenueSources: RevenueSource[];
  expenseSources: ExpenseSource[];
}): SettlementSeedRow[] {
  let sortOrder = 0;
  const priorSourceKeys = new Set(
    input.priorLines
      .filter((line) => line.source_id)
      .map((line) => sourceKey(line.source_table, line.source_id)),
  );
  const liveSourceAmounts = new Map<string, number>();
  for (const row of input.revenueSources) {
    liveSourceAmounts.set(sourceKey("financial_ledger", row.id), Number(row.amount ?? 0));
  }
  for (const row of input.expenseSources) {
    liveSourceAmounts.set(sourceKey("project_expenses", row.id), Number(row.amount ?? 0));
  }

  // The preceding settlement already contains the complete cumulative history,
  // including manual lines. Preserve its amounts even if live sources later change.
  const carried = input.priorLines.map((prior): SettlementSeedRow => {
    const key = sourceKey(prior.source_table, prior.source_id);
    const currentSourceAmount = prior.source_id ? liveSourceAmounts.get(key) : undefined;
    const sourceChanged = currentSourceAmount !== undefined && currentSourceAmount !== Number(prior.amount ?? 0);
    return {
      settlement_id: input.settlementId,
      line_type: prior.line_type,
      source_table: prior.source_table ?? null,
      source_id: prior.source_id ?? null,
      description: prior.description,
      category: prior.category ?? null,
      payer_name: prior.payer_name ?? null,
      payee_name: prior.payee_name ?? null,
      amount: Number(prior.amount ?? 0),
      included: Boolean(prior.included),
      exclusion_reason: prior.exclusion_reason ?? null,
      sort_order: sortOrder++,
      metadata: {
        ...(prior.metadata ?? {}),
        carriedFromSettlementId: prior.settlement_id,
        ...(prior.source_id && currentSourceAmount === undefined ? { sourceDeleted: true } : {}),
        ...(sourceChanged ? { sourceChanged: true, currentSourceAmount } : {}),
      },
    };
  });

  const newRevenue = input.revenueSources
    .filter((row) => !priorSourceKeys.has(sourceKey("financial_ledger", row.id)))
    .map((row): SettlementSeedRow => ({
      settlement_id: input.settlementId,
      line_type: "Revenue",
      source_table: "financial_ledger",
      source_id: row.id,
      description: row.entry_name ?? row.entry_type ?? "Collected revenue",
      category: row.entry_type ?? null,
      payer_name: row.payer_payee ?? null,
      payee_name: input.contractorName ?? null,
      amount: Number(row.amount ?? 0),
      included: true,
      exclusion_reason: null,
      sort_order: sortOrder++,
      metadata: { date: row.date ?? null, reference: row.check_number ?? null, sourceAmount: Number(row.amount ?? 0) },
    }));

  const companyName = String(input.companyName ?? "CBRS Group").trim();
  const newExpenses = input.expenseSources
    .filter((row) => !priorSourceKeys.has(sourceKey("project_expenses", row.id)))
    .map((row): SettlementSeedRow => {
      const payerName = String(row.payer_name ?? companyName).trim();
      const companyPaid = payerName.toLocaleLowerCase() === companyName.toLocaleLowerCase();
      const included = Boolean(row.reimbursable) && companyPaid;
      return {
      settlement_id: input.settlementId,
      line_type: "Company Expense",
      source_table: "project_expenses",
      source_id: row.id,
      description: row.expense_name ?? row.category ?? "Project expense",
      category: row.expense_kind ?? null,
      payer_name: payerName,
      payee_name: row.billing_entity ?? row.vendor ?? null,
      amount: Number(row.amount ?? 0),
      included,
      exclusion_reason: included
        ? null
        : !row.reimbursable
          ? "Not marked as a reimbursable actual cost"
          : "Not documented as company-paid or advanced",
      sort_order: sortOrder++,
      metadata: {
        invoiceNumber: row.invoice_number ?? null,
        invoiceDate: row.invoice_date ?? null,
        sourceAmount: Number(row.amount ?? 0),
      },
      };
    });

  return [...carried, ...newRevenue, ...newExpenses];
}
