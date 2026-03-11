import dotenv from 'dotenv';

dotenv.config();

const AIRTABLE_API_KEY = process.env.VITE_AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.VITE_AIRTABLE_BASE_ID;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('Missing VITE_AIRTABLE_API_KEY or VITE_AIRTABLE_BASE_ID in .env');
  console.error('\nSetup:');
  console.error('  1. Copy .env.example to .env');
  console.error('  2. Create a Personal Access Token at https://airtable.com/create/tokens');
  console.error('     - Scopes needed: data.records:read, data.records:write, schema.bases:read, schema.bases:write');
  console.error('  3. Create an empty base at https://airtable.com and copy the Base ID from the URL (starts with "app")');
  console.error('  4. Fill in VITE_AIRTABLE_API_KEY and VITE_AIRTABLE_BASE_ID in .env');
  process.exit(1);
}

const META_API = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`;
const DATA_API = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

const headers = {
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
};

// ============================================
// Helper: create a table via Metadata API
// ============================================
async function createTable(name, fields) {
  console.log(`  Creating table: ${name}...`);
  const res = await fetch(META_API, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, fields }),
  });

  if (!res.ok) {
    const err = await res.json();
    // If table already exists, try to find it
    if (err.error?.type === 'DUPLICATE_TABLE_NAME') {
      console.log(`  Table "${name}" already exists, looking up ID...`);
      return await getExistingTableId(name);
    }
    throw new Error(`Failed to create table "${name}": ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  console.log(`  OK (${data.id})`);
  return data.id;
}

async function getExistingTableId(name) {
  const res = await fetch(META_API, { headers });
  if (!res.ok) throw new Error('Failed to list tables');
  const data = await res.json();
  const table = data.tables.find((t) => t.name === name);
  if (!table) throw new Error(`Table "${name}" not found`);
  console.log(`  Found (${table.id})`);
  return table.id;
}

// ============================================
// Helper: create records in a table
// ============================================
async function createRecords(tableName, records) {
  // Airtable allows max 10 records per request
  const results = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await fetch(`${DATA_API}/${encodeURIComponent(tableName)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ records: batch }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Failed to create records in "${tableName}": ${JSON.stringify(err)}`);
    }
    const data = await res.json();
    results.push(...data.records);
  }
  return results;
}

// ============================================
// Table definitions
// ============================================

const CLAIMS_FIELDS = [
  { name: 'Claim ID', type: 'singleLineText' },
  { name: 'Last Name', type: 'singleLineText' },
  { name: 'First Name', type: 'singleLineText' },
  { name: 'Address', type: 'singleLineText' },
  { name: 'City', type: 'singleLineText' },
  { name: 'State', type: 'singleLineText' },
  { name: 'Carrier', type: 'singleLineText' },
  { name: 'Policy Number', type: 'singleLineText' },
  { name: 'Date of Loss', type: 'date', options: { dateFormat: { name: 'iso' } } },
  { name: 'RCV', type: 'currency', options: { precision: 2, symbol: '$' } },
  { name: 'ACV', type: 'currency', options: { precision: 2, symbol: '$' } },
  { name: 'Depreciation', type: 'currency', options: { precision: 2, symbol: '$' } },
  { name: 'O&P', type: 'currency', options: { precision: 2, symbol: '$' } },
  { name: 'Deductible', type: 'currency', options: { precision: 2, symbol: '$' } },
  {
    name: 'Status',
    type: 'singleSelect',
    options: {
      choices: [
        { name: 'Pending' },
        { name: 'In Progress' },
        { name: 'Completed' },
        { name: 'Closed' },
      ],
    },
  },
];

function ledgerFields(claimsTableId) {
  return [
    { name: 'Entry Name', type: 'singleLineText' },
    {
      name: 'Claim',
      type: 'multipleRecordLinks',
      options: { linkedTableId: claimsTableId },
    },
    {
      name: 'Entry Type',
      type: 'singleSelect',
      options: {
        choices: [
          { name: 'Insurance Payment' },
          { name: 'Homeowner Payment' },
          { name: 'Mortgage Release' },
          { name: 'Vendor Payment' },
          { name: 'Adjustment' },
        ],
      },
    },
    {
      name: 'Direction',
      type: 'singleSelect',
      options: { choices: [{ name: 'Inflow' }, { name: 'Outflow' }] },
    },
    { name: 'Amount', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Check Number', type: 'singleLineText' },
    { name: 'Payer/Payee', type: 'singleLineText' },
    { name: 'Category', type: 'singleLineText' },
    { name: 'Description', type: 'multilineText' },
    { name: 'Receipt/Invoice', type: 'multipleAttachments' },
    { name: 'Reconciled', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Reconciled Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Created By', type: 'singleLineText' },
    { name: 'Notes', type: 'multilineText' },
  ];
}

function adjusterFields(claimsTableId) {
  return [
    { name: 'Report Name', type: 'singleLineText' },
    {
      name: 'Claim',
      type: 'multipleRecordLinks',
      options: { linkedTableId: claimsTableId },
    },
    {
      name: 'Report Type',
      type: 'singleSelect',
      options: {
        choices: [
          { name: 'Initial Estimate' },
          { name: 'Supplement' },
          { name: 'Re-inspection' },
          { name: 'Final' },
        ],
      },
    },
    { name: 'Version', type: 'number', options: { precision: 0 } },
    { name: 'Report Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Adjuster Name', type: 'singleLineText' },
    { name: 'RCV Amount', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'ACV Amount', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Depreciation', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'O&P Amount', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'O&P Percent', type: 'percent', options: { precision: 0 } },
    { name: 'Deductible', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Line Items Count', type: 'number', options: { precision: 0 } },
    { name: 'Scope Changes', type: 'multilineText' },
    {
      name: 'Status',
      type: 'singleSelect',
      options: {
        choices: [
          { name: 'Pending' },
          { name: 'Received' },
          { name: 'Under Review' },
          { name: 'Approved' },
          { name: 'Disputed' },
        ],
      },
    },
    { name: 'Dispute Reason', type: 'multilineText' },
    { name: 'Resolution Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Document', type: 'multipleAttachments' },
    { name: 'Approval Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Approved By', type: 'singleLineText' },
    { name: 'Notes', type: 'multilineText' },
  ];
}

function mortgageFields(claimsTableId) {
  return [
    { name: 'Release Name', type: 'singleLineText' },
    {
      name: 'Claim',
      type: 'multipleRecordLinks',
      options: { linkedTableId: claimsTableId },
    },
    { name: 'Mortgage Company', type: 'singleLineText' },
    { name: 'Loan Number', type: 'singleLineText' },
    { name: 'Total Held by Mortgage', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Release Number', type: 'number', options: { precision: 0 } },
    { name: 'Release Amount', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Cumulative Released', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Remaining Held', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Request Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Documents Submitted', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Documents Submitted Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Inspection Required', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    {
      name: 'Inspection Status',
      type: 'singleSelect',
      options: {
        choices: [
          { name: 'Not Required' },
          { name: 'Pending Request' },
          { name: 'Requested' },
          { name: 'Scheduled' },
          { name: 'Completed' },
          { name: 'Failed' },
        ],
      },
    },
    { name: 'Inspection Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Inspection Company', type: 'singleLineText' },
    { name: 'Completion Percent', type: 'number', options: { precision: 0 } },
    {
      name: 'Release Status',
      type: 'singleSelect',
      options: {
        choices: [
          { name: 'Pending Documents' },
          { name: 'Documents Submitted' },
          { name: 'Under Review' },
          { name: 'Inspection Scheduled' },
          { name: 'Check Issued' },
          { name: 'Check Received' },
          { name: 'Deposited' },
        ],
      },
    },
    { name: 'Check Number', type: 'singleLineText' },
    { name: 'Check Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Deposit Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Contact Name', type: 'singleLineText' },
    { name: 'Contact Phone', type: 'phoneNumber' },
    { name: 'Contact Email', type: 'email' },
    { name: 'Notes', type: 'multilineText' },
  ];
}

function jobCostingFields(claimsTableId) {
  return [
    { name: 'Cost Name', type: 'singleLineText' },
    {
      name: 'Claim',
      type: 'multipleRecordLinks',
      options: { linkedTableId: claimsTableId },
    },
    { name: 'Trade Category', type: 'singleLineText' },
    { name: 'Vendor/Subcontractor', type: 'singleLineText' },
    { name: 'Xactimate Budget', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Actual Cost', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Variance', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Variance Percent', type: 'percent', options: { precision: 1 } },
    { name: 'Invoice Number', type: 'singleLineText' },
    { name: 'Invoice Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Invoice Document', type: 'multipleAttachments' },
    {
      name: 'Payment Status',
      type: 'singleSelect',
      options: {
        choices: [
          { name: 'Not Invoiced' },
          { name: 'Invoiced' },
          { name: 'Partially Paid' },
          { name: 'Paid' },
        ],
      },
    },
    { name: 'Payment Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Payment Amount', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Scope Description', type: 'multilineText' },
    { name: 'Notes', type: 'multilineText' },
  ];
}

// ============================================
// Test data (same as seed-test-data.js)
// ============================================

function getTestClaims() {
  return [
    {
      fields: {
        'Claim ID': 'CLM-2024-001', 'Last Name': 'Johnson', 'First Name': 'Michael',
        Address: '1234 Oak Street', City: 'Austin', State: 'TX',
        Carrier: 'State Farm', 'Policy Number': 'SF-123456789',
        'Date of Loss': '2024-01-15', RCV: 85000, ACV: 72000,
        Depreciation: 13000, 'O&P': 8500, Deductible: 2500, Status: 'In Progress',
      },
    },
    {
      fields: {
        'Claim ID': 'CLM-2024-002', 'Last Name': 'Williams', 'First Name': 'Sarah',
        Address: '5678 Maple Avenue', City: 'Round Rock', State: 'TX',
        Carrier: 'Allstate', 'Policy Number': 'AS-987654321',
        'Date of Loss': '2024-02-20', RCV: 125000, ACV: 105000,
        Depreciation: 20000, 'O&P': 12500, Deductible: 5000, Status: 'In Progress',
      },
    },
    {
      fields: {
        'Claim ID': 'CLM-2024-003', 'Last Name': 'Martinez', 'First Name': 'Roberto',
        Address: '910 Cedar Lane', City: 'Georgetown', State: 'TX',
        Carrier: 'USAA', 'Policy Number': 'US-456789123',
        'Date of Loss': '2024-03-05', RCV: 45000, ACV: 38000,
        Depreciation: 7000, 'O&P': 4500, Deductible: 1500, Status: 'Pending',
      },
    },
  ];
}

function getLedgerEntries(claimIds) {
  return [
    { fields: { 'Entry Name': 'Initial Insurance Payment - Johnson', Claim: [claimIds[0]], 'Entry Type': 'Insurance Payment', Direction: 'Inflow', Amount: 35000, Date: '2024-02-01', 'Check Number': 'CHK-001234', 'Payer/Payee': 'State Farm Insurance', Category: 'ACV Payment', Description: 'Initial ACV payment for roof and siding damage', Reconciled: true, 'Reconciled Date': '2024-02-05' } },
    { fields: { 'Entry Name': 'Homeowner Deductible - Johnson', Claim: [claimIds[0]], 'Entry Type': 'Homeowner Payment', Direction: 'Inflow', Amount: 2500, Date: '2024-02-10', 'Check Number': 'HO-5678', 'Payer/Payee': 'Michael Johnson', Category: 'Deductible', Description: 'Homeowner deductible payment', Reconciled: true, 'Reconciled Date': '2024-02-12' } },
    { fields: { 'Entry Name': 'Roofing Contractor Payment - Johnson', Claim: [claimIds[0]], 'Entry Type': 'Vendor Payment', Direction: 'Outflow', Amount: 22000, Date: '2024-03-15', 'Check Number': 'OUT-001', 'Payer/Payee': 'ABC Roofing Co', Category: 'Roofing', Description: 'Final payment for roof replacement', Reconciled: true, 'Reconciled Date': '2024-03-18' } },
    { fields: { 'Entry Name': 'Supplement Payment - Johnson', Claim: [claimIds[0]], 'Entry Type': 'Insurance Payment', Direction: 'Inflow', Amount: 15000, Date: '2024-04-01', 'Check Number': 'CHK-002345', 'Payer/Payee': 'State Farm Insurance', Category: 'Supplement', Description: 'Supplement approval for additional damage', Reconciled: false } },
    { fields: { 'Entry Name': 'Initial Insurance Payment - Williams', Claim: [claimIds[1]], 'Entry Type': 'Insurance Payment', Direction: 'Inflow', Amount: 50000, Date: '2024-03-10', 'Check Number': 'AS-789012', 'Payer/Payee': 'Allstate Insurance', Category: 'ACV Payment', Description: 'Initial ACV payment', Reconciled: true, 'Reconciled Date': '2024-03-15' } },
    { fields: { 'Entry Name': 'Mortgage Release #1 - Williams', Claim: [claimIds[1]], 'Entry Type': 'Mortgage Release', Direction: 'Inflow', Amount: 25000, Date: '2024-04-20', 'Check Number': 'MR-12345', 'Payer/Payee': 'Wells Fargo Mortgage', Category: 'Mortgage Release', Description: 'First mortgage release after 50% completion', Reconciled: true, 'Reconciled Date': '2024-04-22' } },
    { fields: { 'Entry Name': 'Siding Contractor - Williams', Claim: [claimIds[1]], 'Entry Type': 'Vendor Payment', Direction: 'Outflow', Amount: 35000, Date: '2024-04-25', 'Check Number': 'OUT-002', 'Payer/Payee': 'Premier Siding LLC', Category: 'Siding', Description: 'Full siding replacement', Reconciled: false } },
    { fields: { 'Entry Name': 'Initial Insurance Payment - Martinez', Claim: [claimIds[2]], 'Entry Type': 'Insurance Payment', Direction: 'Inflow', Amount: 20000, Date: '2024-04-01', 'Check Number': 'US-345678', 'Payer/Payee': 'USAA Insurance', Category: 'ACV Payment', Description: 'Initial ACV payment for hail damage', Reconciled: true, 'Reconciled Date': '2024-04-05' } },
  ];
}

function getAdjusterReports(claimIds) {
  return [
    { fields: { 'Report Name': 'Initial Estimate - Johnson', Claim: [claimIds[0]], 'Report Type': 'Initial Estimate', Version: 1, 'Report Date': '2024-01-20', 'Adjuster Name': 'Tom Anderson', 'RCV Amount': 65000, 'ACV Amount': 55000, Depreciation: 10000, 'O&P Amount': 6500, 'O&P Percent': 10, Deductible: 2500, 'Line Items Count': 45, Status: 'Approved', 'Approval Date': '2024-01-25' } },
    { fields: { 'Report Name': 'Supplement #1 - Johnson', Claim: [claimIds[0]], 'Report Type': 'Supplement', Version: 2, 'Report Date': '2024-03-01', 'Adjuster Name': 'Tom Anderson', 'RCV Amount': 78000, 'ACV Amount': 66000, Depreciation: 12000, 'O&P Amount': 7800, 'O&P Percent': 10, Deductible: 2500, 'Line Items Count': 58, 'Scope Changes': 'Added interior water damage, additional decking replacement', Status: 'Approved', 'Approval Date': '2024-03-10' } },
    { fields: { 'Report Name': 'Supplement #2 - Johnson', Claim: [claimIds[0]], 'Report Type': 'Supplement', Version: 3, 'Report Date': '2024-04-15', 'Adjuster Name': 'Lisa Chen', 'RCV Amount': 85000, 'ACV Amount': 72000, Depreciation: 13000, 'O&P Amount': 8500, 'O&P Percent': 10, Deductible: 2500, 'Line Items Count': 67, 'Scope Changes': 'Added gutters and fascia, HVAC vent boots', Status: 'Approved', 'Approval Date': '2024-04-20' } },
    { fields: { 'Report Name': 'Initial Estimate - Williams', Claim: [claimIds[1]], 'Report Type': 'Initial Estimate', Version: 1, 'Report Date': '2024-02-25', 'Adjuster Name': 'Mike Reynolds', 'RCV Amount': 100000, 'ACV Amount': 85000, Depreciation: 15000, 'O&P Amount': 10000, 'O&P Percent': 10, Deductible: 5000, 'Line Items Count': 82, Status: 'Approved', 'Approval Date': '2024-03-01' } },
    { fields: { 'Report Name': 'Supplement #1 - Williams', Claim: [claimIds[1]], 'Report Type': 'Supplement', Version: 2, 'Report Date': '2024-04-10', 'Adjuster Name': 'Mike Reynolds', 'RCV Amount': 125000, 'ACV Amount': 105000, Depreciation: 20000, 'O&P Amount': 12500, 'O&P Percent': 10, Deductible: 5000, 'Line Items Count': 98, 'Scope Changes': 'Added window replacement, additional siding areas', Status: 'Under Review' } },
    { fields: { 'Report Name': 'Initial Estimate - Martinez', Claim: [claimIds[2]], 'Report Type': 'Initial Estimate', Version: 1, 'Report Date': '2024-03-10', 'Adjuster Name': 'Sarah Lopez', 'RCV Amount': 45000, 'ACV Amount': 38000, Depreciation: 7000, 'O&P Amount': 4500, 'O&P Percent': 10, Deductible: 1500, 'Line Items Count': 32, Status: 'Received' } },
  ];
}

function getMortgageReleases(claimIds) {
  return [
    { fields: { 'Release Name': 'Release #1 - Williams', Claim: [claimIds[1]], 'Mortgage Company': 'Wells Fargo Home Mortgage', 'Loan Number': 'WF-2024-789456', 'Total Held by Mortgage': 75000, 'Release Number': 1, 'Release Amount': 25000, 'Cumulative Released': 25000, 'Remaining Held': 50000, 'Request Date': '2024-04-01', 'Documents Submitted': true, 'Documents Submitted Date': '2024-04-05', 'Inspection Required': true, 'Inspection Status': 'Completed', 'Inspection Date': '2024-04-15', 'Inspection Company': 'ABC Inspections', 'Completion Percent': 50, 'Release Status': 'Deposited', 'Check Number': 'WF-001234', 'Check Date': '2024-04-18', 'Deposit Date': '2024-04-20', 'Contact Name': 'Jennifer Smith', 'Contact Phone': '(800) 555-1234', 'Contact Email': 'claims@wellsfargo.com' } },
    { fields: { 'Release Name': 'Release #2 - Williams', Claim: [claimIds[1]], 'Mortgage Company': 'Wells Fargo Home Mortgage', 'Loan Number': 'WF-2024-789456', 'Total Held by Mortgage': 75000, 'Release Number': 2, 'Release Amount': 25000, 'Cumulative Released': 50000, 'Remaining Held': 25000, 'Request Date': '2024-05-01', 'Documents Submitted': true, 'Documents Submitted Date': '2024-05-03', 'Inspection Required': true, 'Inspection Status': 'Scheduled', 'Inspection Date': '2024-05-15', 'Inspection Company': 'ABC Inspections', 'Completion Percent': 75, 'Release Status': 'Inspection Scheduled', 'Contact Name': 'Jennifer Smith', 'Contact Phone': '(800) 555-1234', 'Contact Email': 'claims@wellsfargo.com' } },
    { fields: { 'Release Name': 'Release #3 - Williams', Claim: [claimIds[1]], 'Mortgage Company': 'Wells Fargo Home Mortgage', 'Loan Number': 'WF-2024-789456', 'Total Held by Mortgage': 75000, 'Release Number': 3, 'Release Amount': 25000, 'Cumulative Released': 75000, 'Remaining Held': 0, 'Request Date': '2024-06-01', 'Documents Submitted': false, 'Inspection Required': true, 'Inspection Status': 'Pending Request', 'Completion Percent': 100, 'Release Status': 'Pending Documents', 'Contact Name': 'Jennifer Smith', 'Contact Phone': '(800) 555-1234', 'Contact Email': 'claims@wellsfargo.com' } },
    { fields: { 'Release Name': 'Release #1 - Martinez', Claim: [claimIds[2]], 'Mortgage Company': 'Chase Mortgage', 'Loan Number': 'CH-2024-123789', 'Total Held by Mortgage': 20000, 'Release Number': 1, 'Release Amount': 10000, 'Cumulative Released': 0, 'Remaining Held': 20000, 'Request Date': '2024-04-15', 'Documents Submitted': true, 'Documents Submitted Date': '2024-04-18', 'Inspection Required': true, 'Inspection Status': 'Requested', 'Completion Percent': 25, 'Release Status': 'Under Review', 'Contact Name': 'David Wilson', 'Contact Phone': '(800) 555-5678', 'Contact Email': 'mortgage.claims@chase.com' } },
  ];
}

function getJobCosting(claimIds) {
  return [
    { fields: { 'Cost Name': 'Roofing - Johnson', Claim: [claimIds[0]], 'Trade Category': 'Roofing', 'Vendor/Subcontractor': 'ABC Roofing Co', 'Xactimate Budget': 28000, 'Actual Cost': 22000, Variance: 6000, 'Variance Percent': 0.214, 'Invoice Number': 'ABC-2024-001', 'Invoice Date': '2024-03-10', 'Payment Status': 'Paid', 'Payment Date': '2024-03-15', 'Payment Amount': 22000, 'Scope Description': 'Complete roof tear-off and replacement, 30-year architectural shingles' } },
    { fields: { 'Cost Name': 'Siding - Johnson', Claim: [claimIds[0]], 'Trade Category': 'Siding', 'Vendor/Subcontractor': 'Premier Siding LLC', 'Xactimate Budget': 18000, 'Actual Cost': 16500, Variance: 1500, 'Variance Percent': 0.083, 'Invoice Number': 'PS-2024-045', 'Invoice Date': '2024-04-01', 'Payment Status': 'Invoiced', 'Scope Description': 'Replace damaged siding on north and west elevations' } },
    { fields: { 'Cost Name': 'Gutters - Johnson', Claim: [claimIds[0]], 'Trade Category': 'Gutters', 'Vendor/Subcontractor': 'Gutter Pro Services', 'Xactimate Budget': 4500, 'Actual Cost': 4200, Variance: 300, 'Variance Percent': 0.067, 'Invoice Number': 'GP-2024-112', 'Invoice Date': '2024-04-10', 'Payment Status': 'Paid', 'Payment Date': '2024-04-12', 'Payment Amount': 4200, 'Scope Description': 'Seamless aluminum gutters and downspouts' } },
    { fields: { 'Cost Name': 'Interior Repairs - Johnson', Claim: [claimIds[0]], 'Trade Category': 'Interior', 'Vendor/Subcontractor': 'Quality Interior Solutions', 'Xactimate Budget': 12000, 'Actual Cost': 0, Variance: 12000, 'Variance Percent': 1.0, 'Payment Status': 'Not Invoiced', 'Scope Description': 'Drywall repair, texture match, and paint in affected rooms' } },
    { fields: { 'Cost Name': 'Roofing - Williams', Claim: [claimIds[1]], 'Trade Category': 'Roofing', 'Vendor/Subcontractor': 'Elite Roofing Inc', 'Xactimate Budget': 45000, 'Actual Cost': 42000, Variance: 3000, 'Variance Percent': 0.067, 'Invoice Number': 'ER-2024-089', 'Invoice Date': '2024-04-20', 'Payment Status': 'Partially Paid', 'Payment Date': '2024-04-25', 'Payment Amount': 21000, 'Scope Description': 'Full roof replacement with impact-resistant shingles' } },
    { fields: { 'Cost Name': 'Siding - Williams', Claim: [claimIds[1]], 'Trade Category': 'Siding', 'Vendor/Subcontractor': 'Premier Siding LLC', 'Xactimate Budget': 38000, 'Actual Cost': 35000, Variance: 3000, 'Variance Percent': 0.079, 'Invoice Number': 'PS-2024-067', 'Invoice Date': '2024-04-22', 'Payment Status': 'Paid', 'Payment Date': '2024-04-25', 'Payment Amount': 35000, 'Scope Description': 'Full house re-side with James Hardie fiber cement' } },
    { fields: { 'Cost Name': 'Windows - Williams', Claim: [claimIds[1]], 'Trade Category': 'Windows', 'Vendor/Subcontractor': 'Clear View Windows', 'Xactimate Budget': 22000, 'Actual Cost': 24500, Variance: -2500, 'Variance Percent': -0.114, 'Invoice Number': 'CVW-2024-033', 'Invoice Date': '2024-05-01', 'Payment Status': 'Invoiced', 'Scope Description': 'Replace 12 windows with energy-efficient double-pane', Notes: 'Over budget due to upgraded window specifications requested by homeowner' } },
    { fields: { 'Cost Name': 'Painting - Williams', Claim: [claimIds[1]], 'Trade Category': 'Painting', 'Vendor/Subcontractor': 'Pro Painters Austin', 'Xactimate Budget': 8500, 'Actual Cost': 0, Variance: 8500, 'Variance Percent': 1.0, 'Payment Status': 'Not Invoiced', 'Scope Description': 'Exterior trim paint and touch-up' } },
    { fields: { 'Cost Name': 'Roofing - Martinez', Claim: [claimIds[2]], 'Trade Category': 'Roofing', 'Vendor/Subcontractor': 'ABC Roofing Co', 'Xactimate Budget': 32000, 'Actual Cost': 0, Variance: 32000, 'Variance Percent': 1.0, 'Payment Status': 'Not Invoiced', 'Scope Description': 'Partial roof replacement - south slope only' } },
    { fields: { 'Cost Name': 'Gutters - Martinez', Claim: [claimIds[2]], 'Trade Category': 'Gutters', 'Vendor/Subcontractor': 'Gutter Pro Services', 'Xactimate Budget': 3200, 'Actual Cost': 0, Variance: 3200, 'Variance Percent': 1.0, 'Payment Status': 'Not Invoiced', 'Scope Description': 'Replace damaged gutters on south side' } },
  ];
}

// ============================================
// Main setup
// ============================================

async function setup() {
  console.log('=== Claims Master Financials - Airtable Setup ===\n');

  // Step 1: Create tables
  console.log('Step 1/3: Creating tables...\n');

  const claimsTableId = await createTable('Claims', CLAIMS_FIELDS);

  // Small delay to avoid rate limits
  await new Promise((r) => setTimeout(r, 300));
  const ledgerTableId = await createTable('Financial Ledger', ledgerFields(claimsTableId));

  await new Promise((r) => setTimeout(r, 300));
  const adjusterTableId = await createTable('Adjuster Reports', adjusterFields(claimsTableId));

  await new Promise((r) => setTimeout(r, 300));
  const mortgageTableId = await createTable('Mortgage Releases', mortgageFields(claimsTableId));

  await new Promise((r) => setTimeout(r, 300));
  const jobCostingTableId = await createTable('Job Costing', jobCostingFields(claimsTableId));

  console.log('\nAll tables created.\n');

  // Step 2: Seed test data
  console.log('Step 2/3: Seeding test data...\n');

  console.log('  Creating claims...');
  const createdClaims = await createRecords('Claims', getTestClaims());
  const claimRecordIds = createdClaims.map((r) => r.id);
  console.log(`  OK (${createdClaims.length} claims)`);

  await new Promise((r) => setTimeout(r, 300));
  console.log('  Creating ledger entries...');
  const createdLedger = await createRecords('Financial Ledger', getLedgerEntries(claimRecordIds));
  console.log(`  OK (${createdLedger.length} entries)`);

  await new Promise((r) => setTimeout(r, 300));
  console.log('  Creating adjuster reports...');
  const createdReports = await createRecords('Adjuster Reports', getAdjusterReports(claimRecordIds));
  console.log(`  OK (${createdReports.length} reports)`);

  await new Promise((r) => setTimeout(r, 300));
  console.log('  Creating mortgage releases...');
  const createdReleases = await createRecords('Mortgage Releases', getMortgageReleases(claimRecordIds));
  console.log(`  OK (${createdReleases.length} releases)`);

  await new Promise((r) => setTimeout(r, 300));
  console.log('  Creating job costing entries...');
  const createdCosts = await createRecords('Job Costing', getJobCosting(claimRecordIds));
  console.log(`  OK (${createdCosts.length} entries)`);

  // Step 3: Summary
  console.log('\nStep 3/3: Done!\n');
  console.log('=================================================');
  console.log('  Setup complete!');
  console.log('=================================================');
  console.log(`
  Tables created:
    - Claims (${claimsTableId})
    - Financial Ledger (${ledgerTableId})
    - Adjuster Reports (${adjusterTableId})
    - Mortgage Releases (${mortgageTableId})
    - Job Costing (${jobCostingTableId})

  Test data:
    - ${createdClaims.length} Claims
    - ${createdLedger.length} Ledger entries
    - ${createdReports.length} Adjuster reports
    - ${createdReleases.length} Mortgage releases
    - ${createdCosts.length} Job costing entries

  Next: run "npm run dev" to start the dashboard.
`);
}

setup().catch((err) => {
  console.error('\nSetup failed:', err.message);
  process.exit(1);
});
