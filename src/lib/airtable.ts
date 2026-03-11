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
  const options: any = {
    sort: [{ field: 'Date', direction: 'desc' }],
  };

  if (claimRecordId) {
    options.filterByFormula = `SEARCH('${claimRecordId}', ARRAYJOIN({Claim}))`;
  }

  const records = await base(TABLES.FINANCIAL_LEDGER).select(options).all();
  return records.map(record => ({
    id: record.id,
    ...record.fields,
  }));
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
  const options: any = {
    sort: [{ field: 'Version', direction: 'asc' }],
  };

  if (claimRecordId) {
    options.filterByFormula = `SEARCH('${claimRecordId}', ARRAYJOIN({Claim}))`;
  }

  const records = await base(TABLES.ADJUSTER_REPORTS).select(options).all();
  return records.map(record => ({
    id: record.id,
    ...record.fields,
  }));
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
  const options: any = {
    sort: [{ field: 'Release Number', direction: 'asc' }],
  };

  if (claimRecordId) {
    options.filterByFormula = `SEARCH('${claimRecordId}', ARRAYJOIN({Claim}))`;
  }

  const records = await base(TABLES.MORTGAGE_RELEASES).select(options).all();
  return records.map(record => ({
    id: record.id,
    ...record.fields,
  }));
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
  const options: any = {
    sort: [{ field: 'Trade Category', direction: 'asc' }],
  };

  if (claimRecordId) {
    options.filterByFormula = `SEARCH('${claimRecordId}', ARRAYJOIN({Claim}))`;
  }

  const records = await base(TABLES.JOB_COSTING).select(options).all();
  return records.map(record => ({
    id: record.id,
    ...record.fields,
  }));
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
