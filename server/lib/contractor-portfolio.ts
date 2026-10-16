import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContractorSummary } from '../../src/types/contractor-summary.js';
import { calculateFinancialPlan, isFeeKind, money } from './financial-calculations.js';
import { calculationInput } from './financial-plan-input.js';

// Read only the fields used by the existing financial calculator and response.
const COLUMNS = {
  claims: 'id,claim_id,first_name,last_name,contractor,total_approved_budget,rcv',
  job_costing: 'id,claim_id,approved_estimate_amount,has_supplement,supplement_approved_amount',
  cost_budget_lines: 'id,claim_id,budget_amount',
  financial_ledger: 'id,claim_id,amount,direction,fields_raw',
  project_expenses: 'id,claim_id,amount,expense_kind,calculation_mode,calculation_basis,rate_percent,basis_amount,fee_state,payer_name,billing_entity,vendor',
  cost_payments: 'id,claim_id,project_expense_id,amount',
} as const;
type Table = keyof typeof COLUMNS;
type Row = { id: string; claim_id?: string | null } & Record<string, unknown>;
const PAGE_SIZE = 500;
const CLAIM_BATCH_SIZE = 100;

async function readRows(db: SupabaseClient, table: Table, claimIds?: string[]): Promise<Row[]> {
  const rows: Row[] = [];
  let total = Infinity;
  while (rows.length < total) {
    let query = db.from(table).select(COLUMNS[table], rows.length === 0 ? { count: 'exact' } : {})
      .order('id').range(rows.length, rows.length + PAGE_SIZE - 1);
    query = table === 'claims' ? query.not('contractor', 'is', null) : query.in('claim_id', claimIds!);
    const { data, error, count } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (rows.length === 0) {
      if (count == null) throw new Error(`${table}: missing pagination count`);
      total = count;
    }
    const page = (data ?? []) as unknown as Row[];
    if (page.length === 0 && rows.length < total) throw new Error(`${table}: incomplete pagination`);
    rows.push(...page);
  }
  return rows;
}

function byClaim(rows: Row[]) {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const id = row.claim_id;
    if (!id) continue;
    const group = grouped.get(id) ?? [];
    group.push(row);
    grouped.set(id, group);
  }
  return grouped;
}

export async function loadContractorPortfolio(db: SupabaseClient): Promise<ContractorSummary[]> {
  const claims = await readRows(db, 'claims');
  const grouped = new Map<string, ContractorSummary>();
  // Sequential chunks bound both URL size and memory. At most five reads run
  // together, regardless of how many contractor claims exist.
  for (let start = 0; start < claims.length; start += CLAIM_BATCH_SIZE) {
    const batch = claims.slice(start, start + CLAIM_BATCH_SIZE);
    const ids = batch.map((claim) => claim.id);
    const [jobs, budgets, ledger, expenses, payments] = await Promise.all([
      readRows(db, 'job_costing', ids).then(byClaim),
      readRows(db, 'cost_budget_lines', ids).then(byClaim),
      readRows(db, 'financial_ledger', ids).then(byClaim),
      readRows(db, 'project_expenses', ids).then(byClaim),
      readRows(db, 'cost_payments', ids).then(byClaim),
    ]);
    for (const claim of batch) {
      const claimExpenses = expenses.get(claim.id) ?? [];
      const calculation = calculateFinancialPlan(calculationInput(
        claim, jobs.get(claim.id) ?? [], budgets.get(claim.id) ?? [],
        ledger.get(claim.id) ?? [], claimExpenses, payments.get(claim.id) ?? [],
      ));
      const metrics = calculation.metrics;
      const contractor = String(claim.contractor ?? '').trim() || 'Unassigned';
      const key = contractor.toLowerCase();
      const row = grouped.get(key) ?? {
        contractor, projectCount: 0, approvedRevenue: 0, collectedRevenue: 0,
        budget: 0, committedCosts: 0, paidCosts: 0, feesOwedByContractor: 0,
        feesOwedToContractor: 0, referralBalance: 0, projectedProfit: 0,
        expectedProfit: 0, claims: [],
      };
      row.projectCount += 1;
      row.approvedRevenue = money(row.approvedRevenue + metrics.approvedRevenue);
      row.collectedRevenue = money(row.collectedRevenue + metrics.collectedRevenue);
      row.budget = money(row.budget + metrics.budgetedDirectCost);
      row.committedCosts = money(row.committedCosts + metrics.committedDirectCost);
      row.paidCosts = money(row.paidCosts + metrics.paidDirectCost);
      row.projectedProfit = money(row.projectedProfit + metrics.projectedProfit);
      row.expectedProfit = money(row.expectedProfit + metrics.expectedProfit);
      for (const expense of claimExpenses) {
        const derived = calculation.expenses[expense.id];
        if (!isFeeKind(expense.expense_kind as string | null) || derived.status === 'Waived') continue;
        if (String(expense.payer_name ?? '').toLowerCase() === key) {
          row.feesOwedByContractor = money(row.feesOwedByContractor + derived.balance);
        }
        if (String(expense.billing_entity ?? expense.vendor ?? '').toLowerCase() === key) {
          row.feesOwedToContractor = money(row.feesOwedToContractor + derived.balance);
        }
        if (expense.expense_kind === 'Referral Fee') {
          row.referralBalance = money(row.referralBalance + derived.balance);
        }
      }
      row.claims.push({
        id: claim.id, claimCode: claim.claim_id ?? '',
        customerName: [claim.first_name, claim.last_name].filter(Boolean).join(' '),
        approvedRevenue: metrics.approvedRevenue, projectedProfit: metrics.projectedProfit,
        expectedProfit: metrics.expectedProfit,
      });
      grouped.set(key, row);
    }
  }
  return [...grouped.values()].sort((a, b) => a.contractor.localeCompare(b.contractor));
}
