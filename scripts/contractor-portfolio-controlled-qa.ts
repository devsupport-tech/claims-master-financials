// Opt-in localhost-only fixture. No production credentials or database access.
import express from 'express';
import { resolve } from 'node:path';
if (process.env.PORTFOLIO_LOCAL_QA !== '1') throw new Error('Set PORTFOLIO_LOCAL_QA=1');
process.env.SUPABASE_URL = 'http://127.0.0.1:3031';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-local-only';
const claimId = '33333333-3333-4333-8333-333333333333';
const data: Record<string, Array<Record<string, unknown>>> = {
  claims: [{ id: claimId, claim_id: 'QA_PORTFOLIO', first_name: 'Local', last_name: 'Fixture', contractor: 'QA Contractor', total_approved_budget: 5000, rcv: 5000, stage: 'Claim Filed', status: 'In progress' }],
  cost_budget_lines: [{ id: 'budget', claim_id: claimId, budget_amount: 2000 }],
  financial_ledger: [{ id: 'inflow', claim_id: claimId, amount: 3000, direction: 'Inflow' }],
  project_expenses: [
    { id: 'direct', claim_id: claimId, expense_kind: 'Labor', expense_name: 'QA labor', amount: 1000 },
    { id: 'fee', claim_id: claimId, expense_kind: 'Commission', expense_name: 'QA commission', amount: 500, fee_state: 'Due', payer_name: 'QA Contractor' },
  ],
  cost_payments: [{ id: 'payment', claim_id: claimId, project_expense_id: 'fee', amount: 100 }],
};
let reads: string[] = [];
let fail = false;
const database = express();
database.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://127.0.0.1:3032');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Expose-Headers', 'Content-Range');
  next();
});
database.options('/*path', (_req, res) => res.sendStatus(204));
database.get('/rest/v1/:table', (req, res) => {
  const table = String(req.params.table);
  reads.push(table);
  if (fail) { res.status(500).json({ message: 'Synthetic read failure' }); return; }
  let rows = data[table] ?? [];
  if (req.query.contractor === 'not.is.null') rows = rows.filter((row) => row.contractor != null);
  for (const field of ['id', 'claim_id']) {
    const filter = String(req.query[field] ?? '');
    if (filter.startsWith('eq.')) rows = rows.filter((row) => row[field] === filter.slice(3));
    if (filter.startsWith('in.(')) rows = rows.filter((row) => filter.slice(4, -1).split(',').includes(String(row[field])));
  }
  const count = rows.length;
  rows = rows.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const offset = Number(req.query.offset ?? 0);
  const limit = Number(req.query.limit ?? 500);
  res.header('Content-Range', `0-0/${count}`);
  const single = req.header('accept')?.includes('object+json');
  res.json(single ? rows[0] ?? null : rows.slice(offset, offset + limit));
});
database.use((_req, res) => res.status(405).json({ error: 'Fixture is read-only' }));
const dbServer = database.listen(3031, '127.0.0.1');
const { financialPlanningRouter } = await import('../server/routes/financial-planning.js');
const app = express();
app.get('/api/claims', (_req, res) => res.json(data.claims));
app.get('/api/sync/claims/:id/services', (_req, res) => res.json({ claimId, services: [] }));
app.get('/api/financial-planning/claims/:id/settlements', (_req, res) => res.json({ settlements: [], templates: [] }));
app.get('/qa/reads', (_req, res) => res.json(reads));
app.post('/qa/reset', (_req, res) => { reads = []; res.json({ ok: true }); });
app.post('/qa/fail/:value', (req, res) => { fail = req.params.value === 'on'; res.json({ fail }); });
app.use('/api/financial-planning', (req, res, next) => req.method === 'GET' ? next() : res.sendStatus(405), financialPlanningRouter);
app.use(express.static(resolve('dist')));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve('dist/index.html')));
const server = app.listen(3032, '127.0.0.1', () => console.log('Synthetic portfolio QA at http://127.0.0.1:3032'));
function close() { dbServer.closeAllConnections(); dbServer.close(); server.closeAllConnections(); server.close(); }
process.on('SIGINT', close);
process.on('SIGTERM', close);
