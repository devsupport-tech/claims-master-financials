import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { loadContractorPortfolio } from './contractor-portfolio.js';

type Row = { id: string } & Record<string, unknown>;
type Data = Record<string, Row[]>;
function fixture(data: Data, cap = Infinity, fail?: (table: string, offset: number) => boolean) {
  const requests: URL[] = [];
  let active = 0;
  let peak = 0;
  const db = createClient('https://portfolio.invalid', 'qa-only', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      const table = url.pathname.split('/').at(-1)!;
      assert.ok(['claims', 'job_costing', 'cost_budget_lines', 'financial_ledger', 'project_expenses', 'cost_payments'].includes(table));
      assert.notEqual(url.searchParams.get('select'), '*');
      assert.equal(url.searchParams.get('order'), 'id.asc');
      active += 1;
      peak = Math.max(active, peak);
      await Promise.resolve();
      active -= 1;
      const offset = Number(url.searchParams.get('offset') ?? 0);
      if (fail?.(table, offset)) return new Response(JSON.stringify({ message: 'fixture read failed' }), { status: 500 });
      let rows = data[table] ?? [];
      if (table === 'claims') {
        assert.equal(url.searchParams.get('contractor'), 'not.is.null');
        rows = rows.filter((row) => row.contractor != null);
      } else {
        const ids = url.searchParams.get('claim_id')!;
        assert.ok(ids.startsWith('in.('));
        const allowed = ids.slice(4, -1).split(',');
        assert.ok(allowed.length <= 100);
        rows = rows.filter((row) => allowed.includes(String(row.claim_id)));
      }
      rows = rows.slice().sort((a, b) => a.id.localeCompare(b.id));
      const limit = Math.min(Number(url.searchParams.get('limit')), cap);
      return new Response(JSON.stringify(rows.slice(offset, offset + limit)), {
        headers: { 'Content-Type': 'application/json', 'Content-Range': `0-0/${rows.length}` },
      });
    } },
  });
  return { db, requests, peak: () => peak };
}

const claim = (id: string, contractor: string | null = 'Acme'): Row => ({
  id, claim_id: `QA_${id}`, first_name: 'Alex', last_name: 'Test', contractor,
  total_approved_budget: 1000, rcv: 2000,
});

test('empty portfolio performs one scoped claims read and no child reads', async () => {
  const f = fixture({ claims: [claim('null', null)] });
  assert.deepEqual(await loadContractorPortfolio(f.db), []);
  assert.equal(f.requests.length, 1);
});

test('100 claims use six SELECT requests, no modules/templates or per-claim queries', async () => {
  const f = fixture({ claims: Array.from({ length: 100 }, (_, i) => claim(String(i))) });
  const result = await loadContractorPortfolio(f.db);
  assert.equal(result[0].projectCount, 100);
  assert.equal(result[0].approvedRevenue, 100_000);
  assert.equal(f.requests.length, 6);
  assert.ok(f.peak() <= 5);
});

test('chunks stay bounded and grouping crosses chunk boundaries without lost claims', async () => {
  const f = fixture({ claims: Array.from({ length: 201 }, (_, i) => claim(String(i))) });
  const [result] = await loadContractorPortfolio(f.db);
  assert.equal(result.projectCount, 201);
  assert.equal(result.claims.length, 201);
  assert.equal(result.approvedRevenue, 201_000);
  assert.equal(f.requests.length, 16);
  assert.ok(f.peak() <= 5);
});

test('paginates claims and child rows, including a server cap below requested page size', async () => {
  const f = fixture({
    claims: [claim('a'), claim('b'), claim('c')],
    job_costing: Array.from({ length: 7 }, (_, i) => ({
      id: String(i), claim_id: 'a', approved_estimate_amount: 10.25,
    })),
    cost_payments: Array.from({ length: 5 }, (_, i) => ({
      id: String(i), claim_id: 'a', project_expense_id: 'cost', amount: 0.1,
    })),
    project_expenses: [{ id: 'cost', claim_id: 'a', expense_kind: 'Labor', amount: 1 }],
  }, 2);
  const [result] = await loadContractorPortfolio(f.db);
  assert.equal(result.projectCount, 3);
  assert.equal(result.approvedRevenue, 2071.75);
  assert.equal(result.paidCosts, 0.5);
  assert.equal(f.requests.filter((url) => url.pathname.endsWith('/job_costing')).length, 4);
});

test('pages beyond the default 1000-row cap are included', async () => {
  const f = fixture({
    claims: [claim('a')],
    financial_ledger: Array.from({ length: 1001 }, (_, i) => ({
      id: String(i), claim_id: 'a', direction: 'Inflow', amount: 0.01,
    })),
  });
  assert.equal((await loadContractorPortfolio(f.db))[0].collectedRevenue, 10.01);
  assert.equal(f.requests.filter((url) => url.pathname.endsWith('/financial_ledger')).length, 3);
});

test('preserves grouping, revenue fallbacks, fee snapshots, waived fees, and payment balances', async () => {
  const f = fixture({
    claims: [claim('a', ' Acme '), { ...claim('b', 'acme'), total_approved_budget: 0 }, claim('c', ''), claim('n', null)],
    job_costing: [{ id: 'j', claim_id: 'a', approved_estimate_amount: 5000, has_supplement: true, supplement_approved_amount: 100 }],
    cost_budget_lines: [{ id: 'b', claim_id: 'a', budget_amount: 1000 }],
    financial_ledger: [
      { id: 'i', claim_id: 'a', direction: 'Inflow', amount: 4000 },
      { id: 'o', claim_id: 'a', direction: 'Outflow', amount: 25 },
      { id: 'linked', claim_id: 'a', direction: 'Outflow', amount: 100, fields_raw: { 'Project Expense': ['direct'] } },
    ],
    project_expenses: [
      { id: 'direct', claim_id: 'a', expense_kind: 'Labor', amount: 1000 },
      { id: 'commission', claim_id: 'a', expense_kind: 'Commission', amount: 10, calculation_mode: 'Percentage', calculation_basis: 'Approved Revenue', rate_percent: 10, fee_state: 'Projected', payer_name: 'Acme' },
      { id: 'referral', claim_id: 'a', expense_kind: 'Referral Fee', amount: 200, fee_state: 'Due', payer_name: 'Other', vendor: 'Acme' },
      { id: 'settlement', claim_id: 'a', expense_kind: 'Contractor Settlement', amount: 300, fee_state: 'Due', billing_entity: 'Acme' },
      { id: 'waived', claim_id: 'a', expense_kind: 'Referral Fee', amount: 999, fee_state: 'Waived', payer_name: 'Acme' },
      { id: 'foreign', claim_id: 'n', expense_kind: 'Labor', amount: 99999 },
    ],
    cost_payments: [
      { id: 'p1', claim_id: 'a', project_expense_id: 'direct', amount: 400 },
      { id: 'p2', claim_id: 'a', project_expense_id: 'commission', amount: 100 },
      { id: 'p3', claim_id: 'a', project_expense_id: 'referral', amount: 50 },
      { id: 'p4', claim_id: 'a', project_expense_id: 'settlement', amount: 300 },
    ],
  });
  const [acme, unassigned] = await loadContractorPortfolio(f.db);
  assert.deepEqual(acme, {
    contractor: 'Acme', projectCount: 2, approvedRevenue: 7100, collectedRevenue: 4000,
    budget: 1000, committedCosts: 1000, paidCosts: 400, feesOwedByContractor: 410,
    feesOwedToContractor: 150, referralBalance: 150, projectedProfit: 5090,
    expectedProfit: 5090,
    claims: [
      { id: 'a', claimCode: 'QA_a', customerName: 'Alex Test', approvedRevenue: 5100, projectedProfit: 3090, expectedProfit: 3090 },
      { id: 'b', claimCode: 'QA_b', customerName: 'Alex Test', approvedRevenue: 2000, projectedProfit: 2000, expectedProfit: 2000 },
    ],
  });
  assert.equal(unassigned.contractor, 'Unassigned');
  assert.equal(unassigned.projectCount, 1);
});

test('a failed claims or later child page rejects rather than returning partial totals', async () => {
  const first = fixture({ claims: [claim('a')] }, 2, (table) => table === 'claims');
  await assert.rejects(loadContractorPortfolio(first.db), /claims: fixture read failed/);
  const later = fixture({
    claims: [claim('a')],
    financial_ledger: Array.from({ length: 3 }, (_, i) => ({ id: String(i), claim_id: 'a' })),
  }, 2, (table, offset) => table === 'financial_ledger' && offset > 0);
  await assert.rejects(loadContractorPortfolio(later.db), /financial_ledger: fixture read failed/);
});
