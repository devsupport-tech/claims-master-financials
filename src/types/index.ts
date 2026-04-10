export interface Claim {
  id: string;
  'Claim ID': string;
  'Last Name': string;
  'First Name': string;
  Address: string;
  City: string;
  State: string;
  Carrier: string;
  'Policy Number': string;
  'Date of Loss': string;
  RCV: number;
  ACV: number;
  Depreciation: number;
  'O&P': number;
  Deductible: number;
  Status: string;
}

export interface ClaimMaster {
  id: string;
  'Claim ID': string;
  'Last Name': string;
  'First Name': string;
  Address: string;
  Carrier: string;
  'Policy Number': string;
  'Loss Date': string;
  'Loss Type': string;
  Status: string;
  Stage: string;
  RCV: number;
  ACV: number;
  Deductible: number;
  'O&P': number;
  Depreciation: number;
  'Adjuster Name': string;
  'Mortgage Company': string;
  'Total Payout': number;
  'Total Outstanding Payments': number;
  'Net Claim Sum': number;
  'Depreciation Recoverable': number;
  'Total Approved Budget': number;
  Checklist?: string;
  financialRecordId?: string;
}

// Insurance Submission Checklist types
export type InsuranceSubmissionChecklistKey =
  | 'mitigation'
  | 'rebuild'
  | 'packout'
  | 'packIn'
  | 'supplement'
  | 'finalReport'
  | 'invoiceReceipt';

export interface InsuranceSubmissionChecklistItem {
  key: InsuranceSubmissionChecklistKey;
  label: string;
  submitted: boolean;
  submittedDate?: string;
  amount?: number;
  amountReleased?: number;
  releaseDate?: string;
  notes?: string;
}

export interface InsuranceSubmissionChecklist {
  items: InsuranceSubmissionChecklistItem[];
  totalSubmittedAmount: number;
  lastUpdatedAt?: string;
}

export interface LedgerEntry {
  id: string;
  'Entry Name': string;
  Claim?: string[];
  'Entry Type': 'Insurance Payment' | 'Homeowner Payment' | 'Mortgage Release' | 'Vendor Payment' | 'Adjustment';
  Direction: 'Inflow' | 'Outflow';
  Amount: number;
  Date: string;
  'Check Number'?: string;
  'Payer/Payee': string;
  Category?: string;
  Description?: string;
  'Receipt/Invoice'?: any[];
  Reconciled: boolean;
  'Reconciled Date'?: string;
  'Created By'?: string;
  Notes?: string;
}

export interface AdjusterReport {
  id: string;
  'Report Name': string;
  Claim?: string[];
  'Report Type': 'Initial Estimate' | 'Supplement' | 'Re-inspection' | 'Final';
  Version: number;
  'Report Date': string;
  'Adjuster Name': string;
  'RCV Amount': number;
  'ACV Amount': number;
  Depreciation: number;
  'O&P Amount': number;
  'O&P Percent': number;
  Deductible: number;
  'Line Items Count': number;
  'Scope Changes'?: string;
  'Status': 'Pending' | 'Received' | 'Under Review' | 'Approved' | 'Disputed';
  'Dispute Reason'?: string;
  'Resolution Date'?: string;
  'Document'?: any[];
  'Previous Version'?: string[];
  'Approval Date'?: string;
  'Approved By'?: string;
  Notes?: string;
}

export interface MortgageRelease {
  id: string;
  'Release Name': string;
  Claim?: string[];
  'Mortgage Company': string;
  'Loan Number': string;
  'Total Held by Mortgage': number;
  'Release Number': number;
  'Release Amount': number;
  'Cumulative Released': number;
  'Remaining Held': number;
  'Request Date': string;
  'Documents Submitted': boolean;
  'Documents Submitted Date'?: string;
  'Required Documents'?: string[];
  'Inspection Required': boolean;
  'Inspection Status'?: 'Not Required' | 'Pending Request' | 'Requested' | 'Scheduled' | 'Completed' | 'Failed';
  'Inspection Date'?: string;
  'Inspection Company'?: string;
  'Completion Percent'?: number;
  'Release Status': 'Pending Documents' | 'Documents Submitted' | 'Under Review' | 'Inspection Scheduled' | 'Check Issued' | 'Check Received' | 'Deposited';
  'Check Number'?: string;
  'Check Date'?: string;
  'Deposit Date'?: string;
  'Contact Name'?: string;
  'Contact Phone'?: string;
  'Contact Email'?: string;
  Notes?: string;
}

export interface JobCost {
  id: string;
  'Cost Name': string;
  Claim?: string[];
  'Trade Category': string;
  'Vendor/Subcontractor': string;
  'Xactimate Budget': number;
  'Actual Cost': number;
  'Variance': number;
  'Variance Percent': number;
  'Invoice Number'?: string;
  'Invoice Date'?: string;
  'Invoice Document'?: any[];
  'Payment Status': 'Not Invoiced' | 'Invoiced' | 'Partially Paid' | 'Paid';
  'Payment Date'?: string;
  'Payment Amount'?: number;
  'Scope Description'?: string;
  Notes?: string;
}

export interface FinancialSummary {
  claimId: string;
  claimRecordId: string;
  customer: string;
  address: string;
  carrier: string;

  // Insurance figures
  totalRCV: number;
  totalDepreciation: number;
  totalACV: number;
  totalOAndP: number;
  deductible: number;
  netToInsured: number;

  // Payments received
  insurancePaymentsReceived: number;
  homeownerPaymentsReceived: number;
  mortgageReleasesReceived: number;
  totalReceived: number;

  // Outstanding
  insuranceOutstanding: number;
  depreciationRecoverable: number;
  mortgageHeld: number;
  homeownerOwed: number;
  totalOutstanding: number;

  // Job costing
  totalBudget: number;
  totalActualCosts: number;
  totalVariance: number;
  variancePercent: number;

  // Profit
  grossProfit: number;
  profitMargin: number;

  // Counts
  adjusterReportCount: number;
  mortgageReleaseCount: number;
  pendingInspections: number;
}
