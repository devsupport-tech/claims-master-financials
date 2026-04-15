import Airtable from 'airtable';

const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('Missing Airtable configuration');
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

const TABLES = {
  CLAIMS: 'Claims',
  FINANCIAL_LEDGER: 'Financial Ledger',
  ADJUSTER_REPORTS: 'Adjuster Reports',
  MORTGAGE_RELEASES: 'Mortgage Releases',
  JOB_COSTING: 'Job Costing',
};

// ==========================================
// CLAIMS
// ==========================================

export async function getAllClaims() {
  const records = await base(TABLES.CLAIMS).select().all();
  return records.map(record => ({
    id: record.id,
    ...record.fields,
  }));
}

export async function getClaimByClaimId(claimId: string) {
  const records = await base(TABLES.CLAIMS)
    .select({
      filterByFormula: `{Claim ID} = '${claimId}'`,
      maxRecords: 1,
    })
    .firstPage();

  if (records.length === 0) return null;
  return { id: records[0].id, ...records[0].fields };
}

export async function createClaim(data: Record<string, any>) {
  const record = await base(TABLES.CLAIMS).create(data);
  return { id: record.id, ...record.fields };
}

export async function updateClaim(recordId: string, data: Record<string, any>) {
  const record = await base(TABLES.CLAIMS).update(recordId, data);
  return { id: record.id, ...record.fields };
}

export async function deleteClaim(recordId: string) {
  await base(TABLES.CLAIMS).destroy(recordId);
}

// ==========================================
// FINANCIAL LEDGER
// ==========================================

export async function getFinancialLedger(claimRecordId?: string) {
  // No server-side filterByFormula on {Claim}: Airtable's ARRAYJOIN on a linked
  // field returns primary-field values, not record IDs, so a SEARCH for a rec...
  // id would never match. Fetch all and filter by linked record IDs client-side.
  const records = await base(TABLES.FINANCIAL_LEDGER)
    .select({ sort: [{ field: 'Date', direction: 'desc' }] })
    .all();
  const mapped = records.map(record => ({ id: record.id, ...record.fields }));
  if (!claimRecordId) return mapped;
  return mapped.filter((r: any) => Array.isArray(r.Claim) && r.Claim.includes(claimRecordId));
}

export async function createLedgerEntry(data: Record<string, any>) {
  const record = await base(TABLES.FINANCIAL_LEDGER).create(data);
  return { id: record.id, ...record.fields };
}

export async function updateLedgerEntry(recordId: string, data: Record<string, any>) {
  const record = await base(TABLES.FINANCIAL_LEDGER).update(recordId, data);
  return { id: record.id, ...record.fields };
}

export async function deleteLedgerEntry(recordId: string) {
  await base(TABLES.FINANCIAL_LEDGER).destroy(recordId);
}

// ==========================================
// ADJUSTER REPORTS
// ==========================================

export async function getAdjusterReports(claimRecordId?: string) {
  const records = await base(TABLES.ADJUSTER_REPORTS)
    .select({ sort: [{ field: 'Version', direction: 'asc' }] })
    .all();
  const mapped = records.map(record => ({ id: record.id, ...record.fields }));
  if (!claimRecordId) return mapped;
  return mapped.filter((r: any) => Array.isArray(r.Claim) && r.Claim.includes(claimRecordId));
}

export async function createAdjusterReport(data: Record<string, any>) {
  const record = await base(TABLES.ADJUSTER_REPORTS).create(data);
  return { id: record.id, ...record.fields };
}

export async function updateAdjusterReport(recordId: string, data: Record<string, any>) {
  const record = await base(TABLES.ADJUSTER_REPORTS).update(recordId, data);
  return { id: record.id, ...record.fields };
}

export async function deleteAdjusterReport(recordId: string) {
  await base(TABLES.ADJUSTER_REPORTS).destroy(recordId);
}

// ==========================================
// MORTGAGE RELEASES
// ==========================================

export async function getMortgageReleases(claimRecordId?: string) {
  const records = await base(TABLES.MORTGAGE_RELEASES)
    .select({ sort: [{ field: 'Release Number', direction: 'asc' }] })
    .all();
  const mapped = records.map(record => ({ id: record.id, ...record.fields }));
  if (!claimRecordId) return mapped;
  return mapped.filter((r: any) => Array.isArray(r.Claim) && r.Claim.includes(claimRecordId));
}

export async function createMortgageRelease(data: Record<string, any>) {
  const record = await base(TABLES.MORTGAGE_RELEASES).create(data);
  return { id: record.id, ...record.fields };
}

export async function updateMortgageRelease(recordId: string, data: Record<string, any>) {
  const record = await base(TABLES.MORTGAGE_RELEASES).update(recordId, data);
  return { id: record.id, ...record.fields };
}

export async function deleteMortgageRelease(recordId: string) {
  await base(TABLES.MORTGAGE_RELEASES).destroy(recordId);
}

// ==========================================
// JOB COSTING
// ==========================================

export async function getJobCosting(claimRecordId?: string) {
  const records = await base(TABLES.JOB_COSTING)
    .select({ sort: [{ field: 'Trade Category', direction: 'asc' }] })
    .all();
  const mapped = records.map(record => ({ id: record.id, ...record.fields }));
  if (!claimRecordId) return mapped;
  return mapped.filter((r: any) => Array.isArray(r.Claim) && r.Claim.includes(claimRecordId));
}

export async function createJobCost(data: Record<string, any>) {
  const record = await base(TABLES.JOB_COSTING).create(data);
  return { id: record.id, ...record.fields };
}

export async function updateJobCost(recordId: string, data: Record<string, any>) {
  const record = await base(TABLES.JOB_COSTING).update(recordId, data);
  return { id: record.id, ...record.fields };
}

export async function deleteJobCost(recordId: string) {
  await base(TABLES.JOB_COSTING).destroy(recordId);
}

// ==========================================
// AGGREGATIONS
// ==========================================

export async function getClaimFinancialSummary(claimRecordId: string) {
  const [claim, ledger, reports, releases, costs] = await Promise.all([
    base(TABLES.CLAIMS).find(claimRecordId),
    getFinancialLedger(claimRecordId),
    getAdjusterReports(claimRecordId),
    getMortgageReleases(claimRecordId),
    getJobCosting(claimRecordId),
  ]);

  const claimData = claim.fields;
  const latestReport = reports.length > 0 ? reports[reports.length - 1] : null;

  // Calculate ledger totals
  const insuranceIn = ledger
    .filter((e: any) => e['Entry Type'] === 'Insurance Payment' && e.Direction === 'Inflow')
    .reduce((sum: number, e: any) => sum + (e.Amount || 0), 0);

  const homeownerIn = ledger
    .filter((e: any) => e['Entry Type'] === 'Homeowner Payment' && e.Direction === 'Inflow')
    .reduce((sum: number, e: any) => sum + (e.Amount || 0), 0);

  const mortgageIn = ledger
    .filter((e: any) => e['Entry Type'] === 'Mortgage Release' && e.Direction === 'Inflow')
    .reduce((sum: number, e: any) => sum + (e.Amount || 0), 0);

  const vendorOut = ledger
    .filter((e: any) => e['Entry Type'] === 'Vendor Payment' && e.Direction === 'Outflow')
    .reduce((sum: number, e: any) => sum + (e.Amount || 0), 0);

  // Calculate mortgage held
  const totalMortgageHeld = releases.length > 0 ? (releases[0] as any)['Total Held by Mortgage'] || 0 : 0;
  const totalMortgageReleased = releases
    .filter((r: any) => ['Check Received', 'Deposited'].includes(r['Release Status']))
    .reduce((sum: number, r: any) => sum + (r['Release Amount'] || 0), 0);

  // Calculate job costing
  const totalBudget = costs.reduce((sum: number, c: any) => sum + (c['Xactimate Budget'] || 0), 0);
  const totalActual = costs.reduce((sum: number, c: any) => sum + (c['Actual Cost'] || 0), 0);

  const totalRCV = (latestReport as any)?.['RCV Amount'] || claimData.RCV || 0;
  const totalDepreciation = (latestReport as any)?.Depreciation || claimData.Depreciation || 0;
  const totalACV = (latestReport as any)?.['ACV Amount'] || claimData.ACV || 0;
  const deductible = (latestReport as any)?.Deductible || claimData.Deductible || 0;

  const totalReceived = insuranceIn + homeownerIn + mortgageIn;
  const mortgageHeld = totalMortgageHeld - totalMortgageReleased;

  return {
    claimId: claimData['Claim ID'] || '',
    claimRecordId,
    customer: claimData['Last Name'] || '',
    address: claimData.Address || '',
    carrier: claimData.Carrier || '',

    // Insurance figures
    totalRCV,
    totalDepreciation,
    totalACV,
    totalOAndP: (latestReport as any)?.['O&P Amount'] || claimData['O&P'] || 0,
    deductible,
    netToInsured: totalACV - deductible,

    // Payments received
    insurancePaymentsReceived: insuranceIn,
    homeownerPaymentsReceived: homeownerIn,
    mortgageReleasesReceived: mortgageIn,
    totalReceived,

    // Outstanding
    insuranceOutstanding: totalACV - insuranceIn,
    depreciationRecoverable: totalDepreciation,
    mortgageHeld,
    homeownerOwed: Math.max(0, deductible - homeownerIn),
    totalOutstanding: (totalACV - insuranceIn) + totalDepreciation + mortgageHeld,

    // Job costing
    totalBudget,
    totalActualCosts: totalActual,
    totalVariance: totalBudget - totalActual,
    variancePercent: totalBudget > 0 ? ((totalBudget - totalActual) / totalBudget) * 100 : 0,

    // Profit
    grossProfit: totalReceived - vendorOut,
    profitMargin: totalReceived > 0 ? ((totalReceived - vendorOut) / totalReceived) * 100 : 0,

    // Counts
    adjusterReportCount: reports.length,
    mortgageReleaseCount: releases.length,
    pendingInspections: releases.filter((r: any) =>
      ['Pending Request', 'Requested', 'Scheduled'].includes(r['Inspection Status'])
    ).length,
  };
}

// ==========================================
// PORTFOLIO OVERVIEW (ALL CLAIMS)
// ==========================================

export interface RecentActivity {
  id: string;
  type: 'Ledger' | 'Report' | 'Release' | 'Cost' | 'Payment';
  date: string;
  name: string;
  amount: number;
  claimId: string;
}

export interface PortfolioOverviewData {
  // Counts
  totalClaims: number;
  claimsByStatus: Record<string, number>;

  // Financials
  totalRCV: number;
  totalACV: number;
  totalReceived: number;
  totalOutstanding: number;
  grossProfit: number;
  profitMargin: number;

  // Job costing
  totalBudget: number;
  totalActualCosts: number;
  totalVariance: number;
  variancePercent: number;

  // Recent activity
  recentActivity: RecentActivity[];
}

export async function getPortfolioOverview(
  claimsMasterData?: any[],
  paymentsLogData?: any[],
): Promise<PortfolioOverviewData> {
  // Financials base: needed for transaction details (ledger, costs) and claim ID resolution
  const [financialClaims, ledger, reports, releases, costs] = await Promise.all([
    getAllClaims(),
    getFinancialLedger(),
    getAdjusterReports(),
    getMortgageReleases(),
    getJobCosting(),
  ]);

  // ── Claims Master is the source of truth ──
  const claims = claimsMasterData || [];

  // Build a set of valid Claim IDs from Claims Master
  const validClaimIds = new Set(claims.map((c: any) => c['Claim ID']).filter(Boolean));

  // Map financial base record IDs → Claim IDs (for filtering financial records)
  const claimIdMap: Record<string, string> = {};
  financialClaims.forEach((c: any) => { claimIdMap[c.id] = c['Claim ID'] || ''; });

  // Only include financial records whose linked claim exists in Claims Master
  function belongsToClaimsMaster(record: any): boolean {
    const linked = record.Claim;
    if (Array.isArray(linked) && linked.length > 0) {
      const claimId = claimIdMap[linked[0]];
      return claimId ? validClaimIds.has(claimId) : false;
    }
    return false;
  }

  function resolveClaimId(record: any): string {
    const linked = record.Claim;
    if (Array.isArray(linked) && linked.length > 0) {
      return claimIdMap[linked[0]] || '—';
    }
    return '—';
  }

  // Filter all financial records to only Claims Master claims
  const filteredLedger = ledger.filter(belongsToClaimsMaster);
  const filteredReports = reports.filter(belongsToClaimsMaster);
  const filteredReleases = releases.filter(belongsToClaimsMaster);
  const filteredCosts = costs.filter(belongsToClaimsMaster);

  // Claim counts & status from Claims Master
  const claimsByStatus: Record<string, number> = {};
  claims.forEach((c: any) => {
    const status = c.Status || c.Stage || 'Unknown';
    claimsByStatus[status] = (claimsByStatus[status] || 0) + 1;
  });

  // RCV/ACV from Claims Master
  const totalRCV = claims.reduce((sum: number, c: any) => sum + (c.RCV || 0), 0);
  const totalACV = claims.reduce((sum: number, c: any) => sum + (c.ACV || 0), 0);

  // Build a Claims Master id → Claim ID lookup once; reused for payments log too.
  const masterIdToClaimId: Record<string, string> = {};
  claims.forEach((c: any) => { masterIdToClaimId[c.id] = c['Claim ID'] || ''; });

  // Paid rows from Claims Master → Payments Log also count as received.
  const paidPaymentsTotal = (paymentsLogData || []).reduce((sum: number, p: any) => {
    const linkedMasterId = Array.isArray(p.Claim) && p.Claim.length > 0 ? p.Claim[0] : '';
    const claimId = masterIdToClaimId[linkedMasterId];
    if (!claimId || !validClaimIds.has(claimId)) return sum;
    const status = (p['Payment Status'] || p.Status || '').toLowerCase();
    if (status !== 'paid') return sum;
    return sum + (p.Amount || 0);
  }, 0);

  // Total Received — ledger inflows + paid Claims Master payments.
  const ledgerReceived = filteredLedger
    .filter((e: any) =>
      ['Insurance Payment', 'Homeowner Payment', 'Mortgage Release'].includes(e['Entry Type'])
      && e.Direction === 'Inflow'
    )
    .reduce((sum: number, e: any) => sum + (e.Amount || 0), 0);
  const totalReceived = ledgerReceived + paidPaymentsTotal;

  // Outstanding still reads from Claims Master; polling + post-change refresh keep it current.
  const totalOutstanding = claims.reduce((sum: number, c: any) => sum + (c['Total Outstanding Payments'] || 0), 0);

  // ── Transaction-level data: only for Claims Master claims ──
  const totalOutflows = filteredLedger
    .filter((e: any) => e.Direction === 'Outflow')
    .reduce((sum: number, e: any) => sum + (e.Amount || 0), 0);

  const grossProfit = totalReceived - totalOutflows;

  // Job costing — only for Claims Master claims
  const totalBudget = filteredCosts.reduce((sum: number, c: any) => sum + (c['Xactimate Budget'] || 0), 0);
  const totalActual = filteredCosts.reduce((sum: number, c: any) => sum + (c['Actual Cost'] || 0), 0);
  const totalVariance = totalBudget - totalActual;

  // ── Recently Updated: only for Claims Master claims ──
  const activity: RecentActivity[] = [];

  filteredLedger.forEach((e: any) => {
    activity.push({
      id: e.id,
      type: 'Ledger',
      date: e.Date || '',
      name: e['Entry Name'] || e['Entry Type'] || '—',
      amount: e.Amount || 0,
      claimId: resolveClaimId(e),
    });
  });

  filteredReports.forEach((r: any) => {
    activity.push({
      id: r.id,
      type: 'Report',
      date: r['Report Date'] || '',
      name: r['Report Name'] || r['Report Type'] || '—',
      amount: r['RCV Amount'] || 0,
      claimId: resolveClaimId(r),
    });
  });

  filteredReleases.forEach((r: any) => {
    activity.push({
      id: r.id,
      type: 'Release',
      date: r['Request Date'] || '',
      name: r['Release Name'] || `Release #${r['Release Number']}`,
      amount: r['Release Amount'] || 0,
      claimId: resolveClaimId(r),
    });
  });

  filteredCosts.forEach((c: any) => {
    activity.push({
      id: c.id,
      type: 'Cost',
      date: c['Invoice Date'] || '',
      name: c['Cost Name'] || c['Trade Category'] || '—',
      amount: c['Actual Cost'] || c['Xactimate Budget'] || 0,
      claimId: resolveClaimId(c),
    });
  });

  // Claims Master → Payments Log rows: externally-logged payments that don't
  // exist in the Financials base. Resolve the Claim link against Claims Master
  // and drop any that don't map to a known claim. Fall back to createdTime so
  // rows without Payment Date / Due Date still surface (ordered by log time).
  (paymentsLogData || []).forEach((p: any) => {
    const linkedMasterId = Array.isArray(p.Claim) && p.Claim.length > 0 ? p.Claim[0] : '';
    const claimId = masterIdToClaimId[linkedMasterId];
    if (!claimId || !validClaimIds.has(claimId)) return;
    const date = p['Payment Date'] || p['Due Date'] || p.createdTime || '';
    if (!date) return;
    const label = p.Vendor || p.Description || 'Payment';
    const statusLabel = p['Payment Status'] || p.Status || '';
    activity.push({
      id: `payment-${p.id}`,
      type: 'Payment',
      date,
      name: statusLabel ? `${label} (${statusLabel})` : label,
      amount: p.Amount || 0,
      claimId,
    });
  });

  activity.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return {
    totalClaims: claims.length,
    claimsByStatus,
    totalRCV,
    totalACV,
    totalReceived,
    totalOutstanding: Math.max(0, totalOutstanding),
    grossProfit,
    profitMargin: totalReceived > 0 ? (grossProfit / totalReceived) * 100 : 0,
    totalBudget,
    totalActualCosts: totalActual,
    totalVariance,
    variancePercent: totalBudget > 0 ? (totalVariance / totalBudget) * 100 : 0,
    recentActivity: activity.slice(0, 10),
  };
}
