import Airtable from 'airtable';
import dotenv from 'dotenv';

dotenv.config();

const AIRTABLE_API_KEY = process.env.VITE_AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.VITE_AIRTABLE_BASE_ID;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('Missing VITE_AIRTABLE_API_KEY or VITE_AIRTABLE_BASE_ID in .env');
  process.exit(1);
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

async function seedData() {
  console.log('🌱 Seeding test data to Airtable...\n');

  // ============================================
  // 1. CREATE TEST CLAIMS
  // ============================================
  console.log('📋 Creating test claims...');

  const testClaims = [
    {
      fields: {
        'Claim ID': 'CLM-2024-001',
        'Last Name': 'Johnson',
        'First Name': 'Michael',
        'Address': '1234 Oak Street',
        'City': 'Austin',
        'State': 'TX',
        'Carrier': 'State Farm',
        'Policy Number': 'SF-123456789',
        'Date of Loss': '2024-01-15',
        'RCV': 85000,
        'ACV': 72000,
        'Depreciation': 13000,
        'O&P': 8500,
        'Deductible': 2500,
        'Status': 'In Progress',
      }
    },
    {
      fields: {
        'Claim ID': 'CLM-2024-002',
        'Last Name': 'Williams',
        'First Name': 'Sarah',
        'Address': '5678 Maple Avenue',
        'City': 'Round Rock',
        'State': 'TX',
        'Carrier': 'Allstate',
        'Policy Number': 'AS-987654321',
        'Date of Loss': '2024-02-20',
        'RCV': 125000,
        'ACV': 105000,
        'Depreciation': 20000,
        'O&P': 12500,
        'Deductible': 5000,
        'Status': 'In Progress',
      }
    },
    {
      fields: {
        'Claim ID': 'CLM-2024-003',
        'Last Name': 'Martinez',
        'First Name': 'Roberto',
        'Address': '910 Cedar Lane',
        'City': 'Georgetown',
        'State': 'TX',
        'Carrier': 'USAA',
        'Policy Number': 'US-456789123',
        'Date of Loss': '2024-03-05',
        'RCV': 45000,
        'ACV': 38000,
        'Depreciation': 7000,
        'O&P': 4500,
        'Deductible': 1500,
        'Status': 'Pending',
      }
    },
  ];

  const createdClaims = await base('Claims').create(testClaims);
  console.log(`✅ Created ${createdClaims.length} claims\n`);

  // Get claim record IDs for linking
  const claimIds = createdClaims.map(r => ({ id: r.id, claimId: r.fields['Claim ID'] }));

  // ============================================
  // 2. CREATE FINANCIAL LEDGER ENTRIES
  // ============================================
  console.log('💰 Creating financial ledger entries...');

  const ledgerEntries = [
    // Claim 1 - Johnson
    {
      fields: {
        'Entry Name': 'Initial Insurance Payment - Johnson',
        'Claim': [claimIds[0].id],
        'Entry Type': 'Insurance Payment',
        'Direction': 'Inflow',
        'Amount': 35000,
        'Date': '2024-02-01',
        'Check Number': 'CHK-001234',
        'Payer/Payee': 'State Farm Insurance',
        'Category': 'ACV Payment',
        'Description': 'Initial ACV payment for roof and siding damage',
        'Reconciled': true,
        'Reconciled Date': '2024-02-05',
      }
    },
    {
      fields: {
        'Entry Name': 'Homeowner Deductible - Johnson',
        'Claim': [claimIds[0].id],
        'Entry Type': 'Homeowner Payment',
        'Direction': 'Inflow',
        'Amount': 2500,
        'Date': '2024-02-10',
        'Check Number': 'HO-5678',
        'Payer/Payee': 'Michael Johnson',
        'Category': 'Deductible',
        'Description': 'Homeowner deductible payment',
        'Reconciled': true,
        'Reconciled Date': '2024-02-12',
      }
    },
    {
      fields: {
        'Entry Name': 'Roofing Contractor Payment - Johnson',
        'Claim': [claimIds[0].id],
        'Entry Type': 'Vendor Payment',
        'Direction': 'Outflow',
        'Amount': 22000,
        'Date': '2024-03-15',
        'Check Number': 'OUT-001',
        'Payer/Payee': 'ABC Roofing Co',
        'Category': 'Roofing',
        'Description': 'Final payment for roof replacement',
        'Reconciled': true,
        'Reconciled Date': '2024-03-18',
      }
    },
    {
      fields: {
        'Entry Name': 'Supplement Payment - Johnson',
        'Claim': [claimIds[0].id],
        'Entry Type': 'Insurance Payment',
        'Direction': 'Inflow',
        'Amount': 15000,
        'Date': '2024-04-01',
        'Check Number': 'CHK-002345',
        'Payer/Payee': 'State Farm Insurance',
        'Category': 'Supplement',
        'Description': 'Supplement approval for additional damage',
        'Reconciled': false,
      }
    },
    // Claim 2 - Williams
    {
      fields: {
        'Entry Name': 'Initial Insurance Payment - Williams',
        'Claim': [claimIds[1].id],
        'Entry Type': 'Insurance Payment',
        'Direction': 'Inflow',
        'Amount': 50000,
        'Date': '2024-03-10',
        'Check Number': 'AS-789012',
        'Payer/Payee': 'Allstate Insurance',
        'Category': 'ACV Payment',
        'Description': 'Initial ACV payment',
        'Reconciled': true,
        'Reconciled Date': '2024-03-15',
      }
    },
    {
      fields: {
        'Entry Name': 'Mortgage Release #1 - Williams',
        'Claim': [claimIds[1].id],
        'Entry Type': 'Mortgage Release',
        'Direction': 'Inflow',
        'Amount': 25000,
        'Date': '2024-04-20',
        'Check Number': 'MR-12345',
        'Payer/Payee': 'Wells Fargo Mortgage',
        'Category': 'Mortgage Release',
        'Description': 'First mortgage release after 50% completion',
        'Reconciled': true,
        'Reconciled Date': '2024-04-22',
      }
    },
    {
      fields: {
        'Entry Name': 'Siding Contractor - Williams',
        'Claim': [claimIds[1].id],
        'Entry Type': 'Vendor Payment',
        'Direction': 'Outflow',
        'Amount': 35000,
        'Date': '2024-04-25',
        'Check Number': 'OUT-002',
        'Payer/Payee': 'Premier Siding LLC',
        'Category': 'Siding',
        'Description': 'Full siding replacement',
        'Reconciled': false,
      }
    },
    // Claim 3 - Martinez
    {
      fields: {
        'Entry Name': 'Initial Insurance Payment - Martinez',
        'Claim': [claimIds[2].id],
        'Entry Type': 'Insurance Payment',
        'Direction': 'Inflow',
        'Amount': 20000,
        'Date': '2024-04-01',
        'Check Number': 'US-345678',
        'Payer/Payee': 'USAA Insurance',
        'Category': 'ACV Payment',
        'Description': 'Initial ACV payment for hail damage',
        'Reconciled': true,
        'Reconciled Date': '2024-04-05',
      }
    },
  ];

  const createdLedger = await base('Financial Ledger').create(ledgerEntries);
  console.log(`✅ Created ${createdLedger.length} ledger entries\n`);

  // ============================================
  // 3. CREATE ADJUSTER REPORTS
  // ============================================
  console.log('📄 Creating adjuster reports...');

  const adjusterReports = [
    // Claim 1 - Johnson - 3 versions
    {
      fields: {
        'Report Name': 'Initial Estimate - Johnson',
        'Claim': [claimIds[0].id],
        'Report Type': 'Initial Estimate',
        'Version': 1,
        'Report Date': '2024-01-20',
        'Adjuster Name': 'Tom Anderson',
        'RCV Amount': 65000,
        'ACV Amount': 55000,
        'Depreciation': 10000,
        'O&P Amount': 6500,
        'O&P Percent': 10,
        'Deductible': 2500,
        'Line Items Count': 45,
        'Status': 'Approved',
        'Approval Date': '2024-01-25',
      }
    },
    {
      fields: {
        'Report Name': 'Supplement #1 - Johnson',
        'Claim': [claimIds[0].id],
        'Report Type': 'Supplement',
        'Version': 2,
        'Report Date': '2024-03-01',
        'Adjuster Name': 'Tom Anderson',
        'RCV Amount': 78000,
        'ACV Amount': 66000,
        'Depreciation': 12000,
        'O&P Amount': 7800,
        'O&P Percent': 10,
        'Deductible': 2500,
        'Line Items Count': 58,
        'Scope Changes': 'Added interior water damage, additional decking replacement',
        'Status': 'Approved',
        'Approval Date': '2024-03-10',
      }
    },
    {
      fields: {
        'Report Name': 'Supplement #2 - Johnson',
        'Claim': [claimIds[0].id],
        'Report Type': 'Supplement',
        'Version': 3,
        'Report Date': '2024-04-15',
        'Adjuster Name': 'Lisa Chen',
        'RCV Amount': 85000,
        'ACV Amount': 72000,
        'Depreciation': 13000,
        'O&P Amount': 8500,
        'O&P Percent': 10,
        'Deductible': 2500,
        'Line Items Count': 67,
        'Scope Changes': 'Added gutters and fascia, HVAC vent boots',
        'Status': 'Approved',
        'Approval Date': '2024-04-20',
      }
    },
    // Claim 2 - Williams - 2 versions
    {
      fields: {
        'Report Name': 'Initial Estimate - Williams',
        'Claim': [claimIds[1].id],
        'Report Type': 'Initial Estimate',
        'Version': 1,
        'Report Date': '2024-02-25',
        'Adjuster Name': 'Mike Reynolds',
        'RCV Amount': 100000,
        'ACV Amount': 85000,
        'Depreciation': 15000,
        'O&P Amount': 10000,
        'O&P Percent': 10,
        'Deductible': 5000,
        'Line Items Count': 82,
        'Status': 'Approved',
        'Approval Date': '2024-03-01',
      }
    },
    {
      fields: {
        'Report Name': 'Supplement #1 - Williams',
        'Claim': [claimIds[1].id],
        'Report Type': 'Supplement',
        'Version': 2,
        'Report Date': '2024-04-10',
        'Adjuster Name': 'Mike Reynolds',
        'RCV Amount': 125000,
        'ACV Amount': 105000,
        'Depreciation': 20000,
        'O&P Amount': 12500,
        'O&P Percent': 10,
        'Deductible': 5000,
        'Line Items Count': 98,
        'Scope Changes': 'Added window replacement, additional siding areas',
        'Status': 'Under Review',
      }
    },
    // Claim 3 - Martinez - 1 version
    {
      fields: {
        'Report Name': 'Initial Estimate - Martinez',
        'Claim': [claimIds[2].id],
        'Report Type': 'Initial Estimate',
        'Version': 1,
        'Report Date': '2024-03-10',
        'Adjuster Name': 'Sarah Lopez',
        'RCV Amount': 45000,
        'ACV Amount': 38000,
        'Depreciation': 7000,
        'O&P Amount': 4500,
        'O&P Percent': 10,
        'Deductible': 1500,
        'Line Items Count': 32,
        'Status': 'Received',
      }
    },
  ];

  const createdReports = await base('Adjuster Reports').create(adjusterReports);
  console.log(`✅ Created ${createdReports.length} adjuster reports\n`);

  // ============================================
  // 4. CREATE MORTGAGE RELEASES
  // ============================================
  console.log('🏦 Creating mortgage releases...');

  const mortgageReleases = [
    // Claim 1 - Johnson (no mortgage)
    // Claim 2 - Williams - 3 releases
    {
      fields: {
        'Release Name': 'Release #1 - Williams',
        'Claim': [claimIds[1].id],
        'Mortgage Company': 'Wells Fargo Home Mortgage',
        'Loan Number': 'WF-2024-789456',
        'Total Held by Mortgage': 75000,
        'Release Number': 1,
        'Release Amount': 25000,
        'Cumulative Released': 25000,
        'Remaining Held': 50000,
        'Request Date': '2024-04-01',
        'Documents Submitted': true,
        'Documents Submitted Date': '2024-04-05',
        'Inspection Required': true,
        'Inspection Status': 'Completed',
        'Inspection Date': '2024-04-15',
        'Inspection Company': 'ABC Inspections',
        'Completion Percent': 50,
        'Release Status': 'Deposited',
        'Check Number': 'WF-001234',
        'Check Date': '2024-04-18',
        'Deposit Date': '2024-04-20',
        'Contact Name': 'Jennifer Smith',
        'Contact Phone': '(800) 555-1234',
        'Contact Email': 'claims@wellsfargo.com',
      }
    },
    {
      fields: {
        'Release Name': 'Release #2 - Williams',
        'Claim': [claimIds[1].id],
        'Mortgage Company': 'Wells Fargo Home Mortgage',
        'Loan Number': 'WF-2024-789456',
        'Total Held by Mortgage': 75000,
        'Release Number': 2,
        'Release Amount': 25000,
        'Cumulative Released': 50000,
        'Remaining Held': 25000,
        'Request Date': '2024-05-01',
        'Documents Submitted': true,
        'Documents Submitted Date': '2024-05-03',
        'Inspection Required': true,
        'Inspection Status': 'Scheduled',
        'Inspection Date': '2024-05-15',
        'Inspection Company': 'ABC Inspections',
        'Completion Percent': 75,
        'Release Status': 'Inspection Scheduled',
        'Contact Name': 'Jennifer Smith',
        'Contact Phone': '(800) 555-1234',
        'Contact Email': 'claims@wellsfargo.com',
      }
    },
    {
      fields: {
        'Release Name': 'Release #3 - Williams',
        'Claim': [claimIds[1].id],
        'Mortgage Company': 'Wells Fargo Home Mortgage',
        'Loan Number': 'WF-2024-789456',
        'Total Held by Mortgage': 75000,
        'Release Number': 3,
        'Release Amount': 25000,
        'Cumulative Released': 75000,
        'Remaining Held': 0,
        'Request Date': '2024-06-01',
        'Documents Submitted': false,
        'Inspection Required': true,
        'Inspection Status': 'Pending Request',
        'Completion Percent': 100,
        'Release Status': 'Pending Documents',
        'Contact Name': 'Jennifer Smith',
        'Contact Phone': '(800) 555-1234',
        'Contact Email': 'claims@wellsfargo.com',
      }
    },
    // Claim 3 - Martinez - 1 release
    {
      fields: {
        'Release Name': 'Release #1 - Martinez',
        'Claim': [claimIds[2].id],
        'Mortgage Company': 'Chase Mortgage',
        'Loan Number': 'CH-2024-123789',
        'Total Held by Mortgage': 20000,
        'Release Number': 1,
        'Release Amount': 10000,
        'Cumulative Released': 0,
        'Remaining Held': 20000,
        'Request Date': '2024-04-15',
        'Documents Submitted': true,
        'Documents Submitted Date': '2024-04-18',
        'Inspection Required': true,
        'Inspection Status': 'Requested',
        'Completion Percent': 25,
        'Release Status': 'Under Review',
        'Contact Name': 'David Wilson',
        'Contact Phone': '(800) 555-5678',
        'Contact Email': 'mortgage.claims@chase.com',
      }
    },
  ];

  const createdReleases = await base('Mortgage Releases').create(mortgageReleases);
  console.log(`✅ Created ${createdReleases.length} mortgage releases\n`);

  // ============================================
  // 5. CREATE JOB COSTING ENTRIES
  // ============================================
  console.log('🔧 Creating job costing entries...');

  const jobCostingEntries = [
    // Claim 1 - Johnson
    {
      fields: {
        'Cost Name': 'Roofing - Johnson',
        'Claim': [claimIds[0].id],
        'Trade Category': 'Roofing',
        'Vendor/Subcontractor': 'ABC Roofing Co',
        'Xactimate Budget': 28000,
        'Actual Cost': 22000,
        'Variance': 6000,
        'Variance Percent': 21.4,
        'Invoice Number': 'ABC-2024-001',
        'Invoice Date': '2024-03-10',
        'Payment Status': 'Paid',
        'Payment Date': '2024-03-15',
        'Payment Amount': 22000,
        'Scope Description': 'Complete roof tear-off and replacement, 30-year architectural shingles',
      }
    },
    {
      fields: {
        'Cost Name': 'Siding - Johnson',
        'Claim': [claimIds[0].id],
        'Trade Category': 'Siding',
        'Vendor/Subcontractor': 'Premier Siding LLC',
        'Xactimate Budget': 18000,
        'Actual Cost': 16500,
        'Variance': 1500,
        'Variance Percent': 8.3,
        'Invoice Number': 'PS-2024-045',
        'Invoice Date': '2024-04-01',
        'Payment Status': 'Invoiced',
        'Scope Description': 'Replace damaged siding on north and west elevations',
      }
    },
    {
      fields: {
        'Cost Name': 'Gutters - Johnson',
        'Claim': [claimIds[0].id],
        'Trade Category': 'Gutters',
        'Vendor/Subcontractor': 'Gutter Pro Services',
        'Xactimate Budget': 4500,
        'Actual Cost': 4200,
        'Variance': 300,
        'Variance Percent': 6.7,
        'Invoice Number': 'GP-2024-112',
        'Invoice Date': '2024-04-10',
        'Payment Status': 'Paid',
        'Payment Date': '2024-04-12',
        'Payment Amount': 4200,
        'Scope Description': 'Seamless aluminum gutters and downspouts',
      }
    },
    {
      fields: {
        'Cost Name': 'Interior Repairs - Johnson',
        'Claim': [claimIds[0].id],
        'Trade Category': 'Interior',
        'Vendor/Subcontractor': 'Quality Interior Solutions',
        'Xactimate Budget': 12000,
        'Actual Cost': 0,
        'Variance': 12000,
        'Variance Percent': 100,
        'Payment Status': 'Not Invoiced',
        'Scope Description': 'Drywall repair, texture match, and paint in affected rooms',
      }
    },
    // Claim 2 - Williams
    {
      fields: {
        'Cost Name': 'Roofing - Williams',
        'Claim': [claimIds[1].id],
        'Trade Category': 'Roofing',
        'Vendor/Subcontractor': 'Elite Roofing Inc',
        'Xactimate Budget': 45000,
        'Actual Cost': 42000,
        'Variance': 3000,
        'Variance Percent': 6.7,
        'Invoice Number': 'ER-2024-089',
        'Invoice Date': '2024-04-20',
        'Payment Status': 'Partially Paid',
        'Payment Date': '2024-04-25',
        'Payment Amount': 21000,
        'Scope Description': 'Full roof replacement with impact-resistant shingles',
      }
    },
    {
      fields: {
        'Cost Name': 'Siding - Williams',
        'Claim': [claimIds[1].id],
        'Trade Category': 'Siding',
        'Vendor/Subcontractor': 'Premier Siding LLC',
        'Xactimate Budget': 38000,
        'Actual Cost': 35000,
        'Variance': 3000,
        'Variance Percent': 7.9,
        'Invoice Number': 'PS-2024-067',
        'Invoice Date': '2024-04-22',
        'Payment Status': 'Paid',
        'Payment Date': '2024-04-25',
        'Payment Amount': 35000,
        'Scope Description': 'Full house re-side with James Hardie fiber cement',
      }
    },
    {
      fields: {
        'Cost Name': 'Windows - Williams',
        'Claim': [claimIds[1].id],
        'Trade Category': 'Windows',
        'Vendor/Subcontractor': 'Clear View Windows',
        'Xactimate Budget': 22000,
        'Actual Cost': 24500,
        'Variance': -2500,
        'Variance Percent': -11.4,
        'Invoice Number': 'CVW-2024-033',
        'Invoice Date': '2024-05-01',
        'Payment Status': 'Invoiced',
        'Scope Description': 'Replace 12 windows with energy-efficient double-pane',
        'Notes': 'Over budget due to upgraded window specifications requested by homeowner',
      }
    },
    {
      fields: {
        'Cost Name': 'Painting - Williams',
        'Claim': [claimIds[1].id],
        'Trade Category': 'Painting',
        'Vendor/Subcontractor': 'Pro Painters Austin',
        'Xactimate Budget': 8500,
        'Actual Cost': 0,
        'Variance': 8500,
        'Variance Percent': 100,
        'Payment Status': 'Not Invoiced',
        'Scope Description': 'Exterior trim paint and touch-up',
      }
    },
    // Claim 3 - Martinez
    {
      fields: {
        'Cost Name': 'Roofing - Martinez',
        'Claim': [claimIds[2].id],
        'Trade Category': 'Roofing',
        'Vendor/Subcontractor': 'ABC Roofing Co',
        'Xactimate Budget': 32000,
        'Actual Cost': 0,
        'Variance': 32000,
        'Variance Percent': 100,
        'Payment Status': 'Not Invoiced',
        'Scope Description': 'Partial roof replacement - south slope only',
      }
    },
    {
      fields: {
        'Cost Name': 'Gutters - Martinez',
        'Claim': [claimIds[2].id],
        'Trade Category': 'Gutters',
        'Vendor/Subcontractor': 'Gutter Pro Services',
        'Xactimate Budget': 3200,
        'Actual Cost': 0,
        'Variance': 3200,
        'Variance Percent': 100,
        'Payment Status': 'Not Invoiced',
        'Scope Description': 'Replace damaged gutters on south side',
      }
    },
  ];

  const createdCosts = await base('Job Costing').create(jobCostingEntries);
  console.log(`✅ Created ${createdCosts.length} job costing entries\n`);

  // ============================================
  // SUMMARY
  // ============================================
  console.log('═══════════════════════════════════════════');
  console.log('🎉 Test data seeding complete!');
  console.log('═══════════════════════════════════════════');
  console.log(`
Summary:
  • ${createdClaims.length} Claims created
  • ${createdLedger.length} Ledger entries created
  • ${createdReports.length} Adjuster reports created
  • ${createdReleases.length} Mortgage releases created
  • ${createdCosts.length} Job costing entries created

Test Claims:
  1. CLM-2024-001 - Johnson (State Farm) - $85,000 RCV
  2. CLM-2024-002 - Williams (Allstate) - $125,000 RCV
  3. CLM-2024-003 - Martinez (USAA) - $45,000 RCV

Refresh your dashboard to see the test data!
`);
}

seedData().catch(console.error);
