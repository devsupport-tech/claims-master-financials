import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  FinancialSummaryCard,
  AdjusterReportsTracker,
  FinancialLedger,
  JobCostingTable,
  PortfolioOverview,
  ClaimsTable,
  FinancialReportTab,
  SidebarSearch,
  ServiceLifecycleCard,
  ProjectExpensesTable,
  BudgetSettlementTab,
  ContractorPortfolio,
  ContractorTerms,
} from '@/components/financial';
import {
  getClaimFinancialSummary,
  getFinancialLedger,
  getAdjusterReports,
  getJobCosting,
  deleteLedgerEntry,
  deleteAdjusterReport,
  deleteJobCost,
  getPortfolioOverview,
} from '@/lib/airtable';
import type { PortfolioOverviewData } from '@/lib/airtable';
import { getAllClaimsMaster, ensureFinancialClaimRecord, syncFinancialSummaryToClaimsMaster, getPaymentsLog } from '@/lib/claims-master';
import ClaimHeaderCard from '@/components/claim/ClaimHeaderCard';
import ClaimInfoCard from '@/components/claim/ClaimInfoCard';
import {
  DollarSign,
  FileText,
  Receipt,
  RefreshCw,
  Plus,
  ArrowLeft,
  LayoutDashboard,
  ClipboardCheck,
  Hammer,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  MoreHorizontal,
  ArchiveRestore,
  HandCoins,
  Settings2,
} from 'lucide-react';
import {
  LedgerEntryForm,
  AdjusterReportForm,
  JobCostForm,
  ProjectExpenseForm,
  CostPaymentForm,
} from '@/components/forms';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import type { ClaimMaster, FinancialSummary, LedgerEntry, AdjusterReport, JobCost, ServiceLifecycleView, ProjectExpense, CostPayment } from '@/types';
import { restoreService } from '@/services/lifecycle-sync';
import { deletePlanningExpense, deletePlanningPayment, getFinancialPlan } from '@/services/financial-planning';

const CLAIMS_MASTER_URL = import.meta.env.VITE_LINK_CLAIMS_MASTER || '';
const RESTORATION_OPS_URL = import.meta.env.VITE_LINK_RESTORATION_OPS || '';
const BRANDING_LABEL = import.meta.env.VITE_BRANDING_LABEL || '';

type View = 'overview' | 'claims' | 'claim-detail' | 'contractor-terms';

interface DashboardProps {
  isDark: boolean;
  onThemeToggle: () => void;
}

export function Dashboard({ isDark, onThemeToggle }: DashboardProps) {
  const [collapsed, setCollapsed] = useState(false);

  const titleText = `Financials${BRANDING_LABEL ? ` ${BRANDING_LABEL}` : ''}`;
  const logoSrc = BRANDING_LABEL ? `/logos/${BRANDING_LABEL.toLowerCase()}.png` : null;
  const titleMeasureRef = useRef<HTMLSpanElement>(null);
  const [expandedWidth, setExpandedWidth] = useState(224);

  useEffect(() => {
    if (titleMeasureRef.current) {
      const textWidth = titleMeasureRef.current.scrollWidth;
      const needed = textWidth + 120;
      setExpandedWidth(Math.max(224, needed));
    }
  }, [titleText]);

  const [claims, setClaims] = useState<ClaimMaster[]>([]);
  const [view, setView] = useState<View>('overview');
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [financialRecordId, setFinancialRecordId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Form dialog states
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [showCostForm, setShowCostForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showCostPaymentForm, setShowCostPaymentForm] = useState(false);

  // Edit record states
  const [editingLedger, setEditingLedger] = useState<any>(null);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [editingCost, setEditingCost] = useState<any>(null);
  const [editingExpense, setEditingExpense] = useState<ProjectExpense | null>(null);
  // Which service (moduleRecordId) the Add/Edit Expense form is opened against.
  const [expenseServiceContext, setExpenseServiceContext] = useState<{
    moduleRecordId: string;
    serviceName: string;
  } | null>(null);
  // Which expense row the Log Payment modal is logging against.
  const [costPaymentTarget, setCostPaymentTarget] = useState<{
    expense: ProjectExpense;
    balanceDue: number;
  } | null>(null);
  // Prefill state for new ledger entries (e.g. "Add payment to Water Mitigation"
  // CTAs that pre-seed Category + Amount). Distinct from editingLedger so the
  // form stays in CREATE mode and submission calls createLedgerEntry.
  const [prefillLedger, setPrefillLedger] = useState<Record<string, unknown> | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'ledger' | 'report' | 'cost' | 'expense' | 'cost-payment';
    record: any;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Portfolio overview state
  const [overview, setOverview] = useState<PortfolioOverviewData | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);

  // Financial data for selected claim
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [reports, setReports] = useState<AdjusterReport[]>([]);
  const [costs, setCosts] = useState<JobCost[]>([]);
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [costPayments, setCostPayments] = useState<CostPayment[]>([]);
  // Lifecycle views come from the claim-scoped sidecar join and bubble up so
  // the supporting tabs below can render one tab per active service.
  const [lifecycleViews, setLifecycleViews] = useState<ServiceLifecycleView[]>([]);
  const [restoringServiceId, setRestoringServiceId] = useState<string | null>(null);
  const activeLifecycleViews = lifecycleViews.filter((view) => !view.archivedAt);
  const archivedLifecycleViews = lifecycleViews.filter((view) => Boolean(view.archivedAt));
  // Bumping this counter forces FinancialReportTab to re-fetch its data,
  // so service-tab Comparatives values refresh in place after a save.
  const [lifecycleRefreshSignal, setLifecycleRefreshSignal] = useState(0);
  const [planningRefreshSignal, setPlanningRefreshSignal] = useState(0);

  // Load claims + overview on mount, then poll every 30s to keep data fresh.
  // Polling pauses while viewing a claim detail or while any create/edit dialog is open,
  // so it cannot steal focus or thrash in-progress edits.
  useEffect(() => {
    loadAll();
    const POLL_MS = 30_000;
    const id = setInterval(() => {
      if (view === 'claim-detail') return;
      if (showLedgerForm || showReportForm || showCostForm || showExpenseForm || showCostPaymentForm) return;
      if (editingLedger || editingReport || editingCost || editingExpense) return;
      if (deleteTarget) return;
      refreshAll(true);
    }, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, showLedgerForm, showReportForm, showCostForm, showExpenseForm, showCostPaymentForm, editingLedger, editingReport, editingCost, editingExpense, deleteTarget]);

  async function refreshAll(silent = false) {
    if (!silent) {
      setIsLoading(true);
      setIsLoadingOverview(true);
    }
    try {
      // Claims Master is the source of truth for all claim data.
      // Payments Log lives in the Claims Master base too; fetch in parallel.
      const [claimsData, paymentsLogData] = await Promise.all([
        getAllClaimsMaster(),
        getPaymentsLog(),
      ]);
      setClaims(claimsData);

      const overviewData = await getPortfolioOverview(claimsData, paymentsLogData);
      setOverview(overviewData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      if (!silent) {
        setIsLoading(false);
        setIsLoadingOverview(false);
      }
    }
  }

  async function loadAll() {
    return refreshAll(false);
  }

  async function handleSelectClaim(claim: ClaimMaster) {
    setSelectedClaimId(claim.id);
    setView('claim-detail');
    setIsLoadingDetails(true);
    try {
      const finRecordId = await ensureFinancialClaimRecord(claim);
      setFinancialRecordId(finRecordId);
      await loadClaimDetails(finRecordId);
    } catch (error) {
      console.error('Failed to select claim:', error);
    } finally {
      setIsLoadingDetails(false);
    }
  }

  // Open the Add Ledger Entry form pre-filled to record a payment against a
  // specific service. Used by ServiceLifecycleCard "Add payment" CTAs from
  // both the Financial Report section and the per-service supporting tabs.
  function handleAddServicePayment(defaults: { moduleId: string; category: string; suggestedAmount?: number }) {
    ensureBridgeAndOpenForm(() => {
      // CREATE mode with prefill — NOT edit mode (which requires a real
      // record id and would 500 on save).
      setEditingLedger(null);
      setPrefillLedger({
        'Entry Name': `${defaults.category} — payment`,
        'Entry Type': 'Insurance Payment',
        Direction: 'Inflow',
        Amount: defaults.suggestedAmount ?? 0,
        Date: new Date().toISOString().slice(0, 10),
        Category: defaults.category,
        'Module Record ID': defaults.moduleId,
        Reconciled: false,
      });
      setShowLedgerForm(true);
    });
  }

  async function handleRestoreService(moduleId: string) {
    setRestoringServiceId(moduleId);
    try {
      await restoreService(moduleId);
      setLifecycleRefreshSignal((n) => n + 1);
    } catch (error) {
      console.error('Failed to restore service:', error);
    } finally {
      setRestoringServiceId(null);
    }
  }

  // Ensure financial record exists before opening a form (retry if bridge failed on claim select)
  async function ensureBridgeAndOpenForm(openFn: () => void) {
    if (financialRecordId) {
      openFn();
      return;
    }
    const selectedClaim = claims.find(c => c.id === selectedClaimId);
    if (!selectedClaim) return;
    try {
      const finRecordId = await ensureFinancialClaimRecord(selectedClaim);
      setFinancialRecordId(finRecordId);
      openFn();
    } catch (error: any) {
      console.error('Failed to bridge claim:', error);
      const msg = error?.message || error?.error || String(error);
      alert(`Could not connect to the financial database: ${msg}`);
    }
  }

  async function loadClaimDetails(claimRecordId: string) {
    setIsLoadingDetails(true);
    try {
      const [summaryData, ledgerData, reportsData, costsData, financialPlan] =
        await Promise.all([
          getClaimFinancialSummary(claimRecordId),
          getFinancialLedger(claimRecordId),
          getAdjusterReports(claimRecordId),
          getJobCosting(claimRecordId),
          getFinancialPlan(claimRecordId),
        ]);

      setSummary(summaryData as FinancialSummary);
      setLedger(ledgerData as LedgerEntry[]);
      setReports(reportsData as AdjusterReport[]);
      setCosts(costsData as JobCost[]);
      setExpenses(financialPlan.expenses
        .filter((row) => row.expenseKind !== 'Commission' && row.expenseKind !== 'Referral Fee' && row.expenseKind !== 'Contractor Settlement')
        .map((row) => ({
          id: row.id,
          'Cost Name': row.name,
          'Project Expense Category': ({
            Labor: 'Labor Cost',
            Materials: 'Materials',
            Subcontractor: 'Third party contractors',
            General: 'General Expenses and Outflows',
            Other: 'Others',
          } as const)[row.expenseKind as 'Labor' | 'Materials' | 'Subcontractor' | 'General' | 'Other'],
          'Billing Entity': row.payeeName ?? undefined,
          Amount: row.effectiveAmount,
          'Invoice Number': row.invoiceNumber ?? undefined,
          'Invoice Date': row.invoiceDate ?? undefined,
          'Scope Notes': row.scopeNotes ?? undefined,
          'Module Record ID': row.moduleId ?? undefined,
          Claim: [row.claimId],
        })));
      setCostPayments(financialPlan.payments.map((row) => ({
        id: row.id,
        'Payment Name': row.paymentName ?? 'Payment',
        'Project Expense': row.projectExpenseId ? [row.projectExpenseId] : [],
        Amount: row.amount,
        'Payment Date': row.paymentDate ?? undefined,
        Method: (row.method || undefined) as CostPayment['Method'],
        'Check Number': row.checkNumber ?? undefined,
        Notes: row.notes ?? undefined,
      })));
    } catch (error) {
      console.error('Failed to load claim details:', error);
    } finally {
      setIsLoadingDetails(false);
    }
  }

  async function handleDetailCreated() {
    if (financialRecordId) {
      await loadClaimDetails(financialRecordId);

      // Sync updated financial summary back to Claims Master, then refresh the
      // portfolio overview so returning to the Overview tab shows fresh totals.
      const selectedClaim = claims.find(c => c.id === selectedClaimId);
      if (selectedClaim) {
        const freshSummary = await getClaimFinancialSummary(financialRecordId);
        try {
          await syncFinancialSummaryToClaimsMaster(selectedClaim.id, freshSummary as FinancialSummary);
        } catch (err) {
          console.error('Failed to sync to Claims Master:', err);
        }
      }

      // Silent refresh so the overview + claims list + payments log reflect
      // the new transaction without flashing loading spinners over the detail view.
      refreshAll(true);
    }
  }

  function handlePlanningChanged() {
    setPlanningRefreshSignal((value) => value + 1);
    void refreshAll(true);
  }

  // Edit handlers
  function handleEditLedger(record: any) {
    setEditingLedger(record);
    setShowLedgerForm(true);
  }

  function handleEditReport(record: any) {
    setEditingReport(record);
    setShowReportForm(true);
  }

  function handleEditCost(record: any) {
    setEditingCost(record);
    setShowCostForm(true);
  }

  // Delete handlers
  function handleDeleteLedger(record: any) {
    setDeleteTarget({ type: 'ledger', record });
  }

  function handleDeleteReport(record: any) {
    setDeleteTarget({ type: 'report', record });
  }

  function handleDeleteCost(record: any) {
    setDeleteTarget({ type: 'cost', record });
  }

  function handleAddExpense(ctx: { moduleRecordId: string; serviceName: string }) {
    ensureBridgeAndOpenForm(() => {
      setEditingExpense(null);
      setExpenseServiceContext(ctx);
      setShowExpenseForm(true);
    });
  }

  function handleEditExpense(expense: ProjectExpense, ctx: { moduleRecordId: string; serviceName: string }) {
    setEditingExpense(expense);
    setExpenseServiceContext(ctx);
    setShowExpenseForm(true);
  }

  function handleDeleteExpense(expense: ProjectExpense) {
    setDeleteTarget({ type: 'expense', record: expense });
  }

  function handleLogPaymentOnExpense(expense: ProjectExpense, balanceDue: number) {
    setCostPaymentTarget({ expense, balanceDue });
    setShowCostPaymentForm(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      switch (deleteTarget.type) {
        case 'ledger':
          await deleteLedgerEntry(deleteTarget.record.id);
          await handleDetailCreated();
          break;
        case 'report':
          await deleteAdjusterReport(deleteTarget.record.id);
          await handleDetailCreated();
          break;
        case 'cost':
          await deleteJobCost(deleteTarget.record.id);
          await handleDetailCreated();
          break;
        case 'expense':
          await deletePlanningExpense(deleteTarget.record.id);
          await handleDetailCreated();
          break;
        case 'cost-payment':
          await deletePlanningPayment(deleteTarget.record.id);
          await handleDetailCreated();
          break;
      }
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to delete record. Check the console for details.');
    } finally {
      setIsDeleting(false);
    }
  }

  function getDeleteDescription(): { title: string; description: string } {
    if (!deleteTarget) return { title: '', description: '' };
    const name =
      deleteTarget.record['Entry Name'] ||
      deleteTarget.record['Report Name'] ||
      deleteTarget.record['Release Name'] ||
      deleteTarget.record['Cost Name'] ||
      'this record';
    const typeLabel = {
      ledger: 'ledger entry',
      report: 'adjuster report',
      cost: 'job cost',
      expense: 'project expense',
      'cost-payment': 'cost payment',
    }[deleteTarget.type];
    return {
      title: `Delete ${typeLabel}?`,
      description: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
    };
  }

  // Reset edit record when form closes
  function handleLedgerFormClose(open: boolean) {
    setShowLedgerForm(open);
    if (!open) setEditingLedger(null);
  }

  function handleReportFormClose(open: boolean) {
    setShowReportForm(open);
    if (!open) setEditingReport(null);
  }

  function handleCostFormClose(open: boolean) {
    setShowCostForm(open);
    if (!open) setEditingCost(null);
  }

  function handleExpenseFormClose(open: boolean) {
    setShowExpenseForm(open);
    if (!open) {
      setEditingExpense(null);
      setExpenseServiceContext(null);
    }
  }

  function handleCostPaymentFormClose(open: boolean) {
    setShowCostPaymentForm(open);
    if (!open) setCostPaymentTarget(null);
  }

  const selectedClaim = claims.find(c => c.id === selectedClaimId);
  const { title: deleteTitle, description: deleteDescription } = getDeleteDescription();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Hidden span to measure title width */}
      <span
        ref={titleMeasureRef}
        className="pointer-events-none invisible fixed whitespace-nowrap text-lg font-bold"
        aria-hidden="true"
      >
        {titleText}
      </span>

      {/* ─── Sidebar ─── */}
      <aside
        className="relative z-20 flex shrink-0 flex-col border-r border-[#1e293b] bg-[#0f172a] text-slate-100 shadow-xl transition-all duration-300 ease-in-out"
        style={{ width: collapsed ? 56 : expandedWidth, '--color-border': '#1e293b' } as React.CSSProperties}
      >
        {/* Branding */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#1e293b] px-4">
          {!collapsed ? (
            <div className="flex items-center gap-2 overflow-hidden">
              {logoSrc ? (
                <img src={logoSrc} alt="Company logo" className="h-8 w-8 shrink-0 rounded object-contain" />
              ) : (
                <div className="shrink-0 rounded bg-slate-100 p-1.5 text-slate-900">
                  <DollarSign className="h-5 w-5" />
                </div>
              )}
              <span className="whitespace-nowrap text-lg font-bold text-slate-50">
                {titleText}
              </span>
            </div>
          ) : (
            <>
              {logoSrc ? (
                <img src={logoSrc} alt="Company logo" className="mx-auto h-8 w-8 rounded object-contain" />
              ) : (
                <div className="mx-auto shrink-0 rounded bg-slate-100 p-1.5 text-slate-900">
                  <DollarSign className="h-5 w-5" />
                </div>
              )}
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 text-slate-300 hover:bg-[#1e293b] hover:text-white',
              collapsed ? 'absolute -right-4 top-12 rounded-full border border-[#334155] bg-[#0f172a] shadow-md' : ''
            )}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Persistent claim search — visible regardless of view (overview /
            claims / claim-detail). Reuses the in-memory `claims` state and
            the existing handleSelectClaim flow so behavior matches
            ClaimsTable's row click. */}
        <SidebarSearch
          claims={claims}
          collapsed={collapsed}
          onExpand={() => setCollapsed(false)}
          onSelect={handleSelectClaim}
        />

        {/* Nav Items */}
        <div className="flex-1 space-y-2 overflow-y-auto px-3 py-6">
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start text-slate-300 hover:bg-[#1e293b]/80 hover:text-white',
              collapsed ? 'justify-center px-0' : 'px-4',
              view === 'overview' && 'bg-[#1e293b] text-white shadow-sm hover:bg-[#1e293b]'
            )}
            onClick={() => { setView('overview'); setSelectedClaimId(null); setFinancialRecordId(null); }}
          >
            <LayoutDashboard className={cn('h-5 w-5', collapsed ? '' : 'mr-3')} />
            {!collapsed && <span>Overview</span>}
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start text-slate-300 hover:bg-[#1e293b]/80 hover:text-white',
              collapsed ? 'justify-center px-0' : 'px-4',
              (view === 'claims' || view === 'claim-detail') && 'bg-[#1e293b] text-white shadow-sm hover:bg-[#1e293b]'
            )}
            onClick={() => { setView('claims'); setSelectedClaimId(null); setFinancialRecordId(null); }}
          >
            <ClipboardCheck className={cn('h-5 w-5', collapsed ? '' : 'mr-3')} />
            {!collapsed && <span>Claims</span>}
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start text-slate-300 hover:bg-[#1e293b]/80 hover:text-white',
              collapsed ? 'justify-center px-0' : 'px-4',
              view === 'contractor-terms' && 'bg-[#1e293b] text-white shadow-sm hover:bg-[#1e293b]'
            )}
            onClick={() => { setView('contractor-terms'); setSelectedClaimId(null); setFinancialRecordId(null); }}
          >
            <Settings2 className={cn('h-5 w-5', collapsed ? '' : 'mr-3')} />
            {!collapsed && <span>Contractor Terms</span>}
          </Button>
          {CLAIMS_MASTER_URL && (
            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start text-slate-300 hover:bg-[#1e293b]/80 hover:text-white',
                collapsed ? 'justify-center px-0' : 'px-4'
              )}
              asChild
            >
              <a href={CLAIMS_MASTER_URL} target="_blank" rel="noopener noreferrer">
                <FileText className={cn('h-5 w-5', collapsed ? '' : 'mr-3')} />
                {!collapsed && <span>Claims Master</span>}
              </a>
            </Button>
          )}
          {RESTORATION_OPS_URL && (
            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start text-slate-300 hover:bg-[#1e293b]/80 hover:text-white',
                collapsed ? 'justify-center px-0' : 'px-4'
              )}
              asChild
            >
              <a href={RESTORATION_OPS_URL} target="_blank" rel="noopener noreferrer">
                <Hammer className={cn('h-5 w-5', collapsed ? '' : 'mr-3')} />
                {!collapsed && <span>Restoration Ops</span>}
              </a>
            </Button>
          )}
        </div>

        {/* Bottom */}
        <div className="space-y-2 shrink-0 border-t border-[#1e293b] p-3">
          <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between px-2')}>
            {!collapsed && <span className="text-sm font-medium text-slate-300">Theme</span>}
            <button
              onClick={onThemeToggle}
              className="h-8 w-8 rounded-md text-slate-300 transition hover:bg-[#1e293b] hover:text-white inline-flex items-center justify-center"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <div className="flex-1 overflow-y-auto bg-muted/20">
        <main className="mx-auto max-w-[92rem] p-4 md:p-8">
          {/* Overview View */}
          {view === 'overview' && (
            isLoadingOverview ? (
              <Card className="py-16">
                <CardContent className="text-center">
                  <RefreshCw className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="mt-4 text-muted-foreground">Loading overview...</p>
                </CardContent>
              </Card>
            ) : overview ? (
              <div className="space-y-6">
                <PortfolioOverview data={overview} />
                <ContractorPortfolio
                  refreshSignal={planningRefreshSignal}
                  onSelectClaim={(claimId) => {
                    const claim = claims.find((row) => row.id === claimId);
                    if (claim) void handleSelectClaim(claim);
                  }}
                />
                <ClaimsTable
                  claims={claims}
                  isLoading={isLoading}
                  onSelectClaim={handleSelectClaim}
                />
              </div>
            ) : (
              <Card className="py-16">
                <CardContent className="text-center text-muted-foreground">
                  No data available yet
                </CardContent>
              </Card>
            )
          )}

          {/* Claims Table View */}
          {view === 'claims' && (
            <ClaimsTable
              claims={claims}
              isLoading={isLoading}
              onSelectClaim={handleSelectClaim}
            />
          )}

          {view === 'contractor-terms' && <ContractorTerms />}

          {/* Claim Detail View */}
          {view === 'claim-detail' && (
            isLoadingDetails ? (
              <Card className="py-16">
                <CardContent className="text-center">
                  <RefreshCw className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="mt-4 text-muted-foreground">Loading financial data...</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Back button */}
                <Button variant="ghost" size="sm" onClick={() => { setView('claims'); setSelectedClaimId(null); setFinancialRecordId(null); }}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back to Claims
                </Button>

                {selectedClaim && (
                  <>
                    <ClaimHeaderCard
                      claim={{
                        'Last Name': selectedClaim['Last Name'],
                        'Carrier Claim #': selectedClaim['Carrier Claim #'],
                        ClaimID: selectedClaim['Claim ID'],
                        Stage: selectedClaim.Stage,
                      }}
                    />
                    <ClaimInfoCard
                      claim={{
                        'First Name': selectedClaim['First Name'],
                        'Last Name': selectedClaim['Last Name'],
                        Address: selectedClaim.Address,
                        Carrier: selectedClaim.Carrier,
                        'Carrier Claim #': selectedClaim['Carrier Claim #'],
                        'Loss Type': selectedClaim['Loss Type'],
                        'Loss Date': selectedClaim['Loss Date'],
                        'Adjuster Name': selectedClaim['Adjuster Name'],
                        'Adjuster Email': selectedClaim['Adjuster Email'],
                        'Customer Email': selectedClaim['Customer Email'],
                        'Customer Phone': selectedClaim['Customer Phone'],
                        'Alternative Contact Name': selectedClaim['Alternative Contact Name'],
                        'Alternative Contact Relationship': selectedClaim['Alternative Contact Relationship'],
                        'Alternative Contact Phone': selectedClaim['Alternative Contact Phone'],
                        'Alternative Contact Email': selectedClaim['Alternative Contact Email'],
                        'Referral Type': selectedClaim['Referral Type'],
                        'Referral Name': selectedClaim['Referral Name'],
                        'Referral Phone': selectedClaim['Referral Phone'],
                        'Referral Email': selectedClaim['Referral Email'],
                        'Referral Notes': selectedClaim['Referral Notes'],
                      }}
                    />
                  </>
                )}

                {/* Financial Report — primary summary, surfaces Total Approved /
                    Total Payments Received / Pending Payments at the top and
                    expands into per-service rows below. Replaces the previous
                    Total RCV/Total Received pair and the GeneralInfoCard, both
                    of which duplicated these figures. */}
                {selectedClaim && (
                  <FinancialReportTab
                    claimsMasterRecordId={selectedClaim.id}
                    onViewsChange={setLifecycleViews}
                    onAddPayment={handleAddServicePayment}
                    refreshSignal={lifecycleRefreshSignal}
                  />
                )}

                {/* Single row: Outstanding · Gross Profit · Payment Sources · Job Costing. */}
                {summary && <FinancialSummaryCard summary={summary} variant="rest" />}

                {archivedLifecycleViews.length > 0 && (
                  <Card>
                    <CardContent className="space-y-3 py-4">
                      <h3 className="text-sm font-semibold">Archived services</h3>
                      {archivedLifecycleViews.map((service) => {
                        const historicalTotal = service.approvedEstimateAmount +
                          (service.hasSupplement ? service.supplementApprovedAmount : 0);
                        return (
                          <div key={service.moduleRecordId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3">
                            <div>
                              <p className="text-sm font-medium">{service.serviceName}</p>
                              <p className="text-xs text-muted-foreground">
                                Historical approved total: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(historicalTotal)}
                              </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => handleRestoreService(service.moduleRecordId)} disabled={restoringServiceId === service.moduleRecordId}>
                              <ArchiveRestore className="mr-1 h-4 w-4" />
                              {restoringServiceId === service.moduleRecordId ? 'Restoring…' : 'Restore'}
                            </Button>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Budget & Commissions first, then Ledger and one tab per service
                    (Water Mitigation, Rebuild, etc.) sourced from the lifecycle
                    views bubbled up by FinancialReportTab, and a "More" tab
                    that holds Adjuster Reports / Mortgage / Job Costing /
                    Submissions for occasional access. */}
                <Tabs defaultValue="budget-commissions" className="space-y-4">
                  <TabsList className="flex-wrap h-auto">
                    <TabsTrigger value="budget-commissions" className="flex items-center gap-2">
                      <HandCoins className="h-4 w-4" />
                      Budget & Settlement
                    </TabsTrigger>
                    <TabsTrigger value="ledger" className="flex items-center gap-2">
                      <Receipt className="h-4 w-4" />
                      Ledger
                    </TabsTrigger>
                    {activeLifecycleViews.map((v) => (
                      <TabsTrigger
                        key={v.moduleRecordId}
                        value={v.moduleRecordId}
                        className="flex items-center gap-2"
                      >
                        {v.serviceName}
                      </TabsTrigger>
                    ))}
                    <TabsTrigger value="more" className="flex items-center gap-2">
                      <MoreHorizontal className="h-4 w-4" />
                      More
                    </TabsTrigger>
                  </TabsList>

                  {selectedClaim && (
                    <TabsContent value="budget-commissions">
                      <BudgetSettlementTab
                        claimRef={selectedClaim.id}
                        refreshSignal={planningRefreshSignal}
                        onChanged={handlePlanningChanged}
                      />
                    </TabsContent>
                  )}

                  <TabsContent value="ledger">
                    <div className="space-y-4">
                      <div className="flex justify-end">
                        <Button size="sm" onClick={() => ensureBridgeAndOpenForm(() => { setEditingLedger(null); setShowLedgerForm(true); })}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add Entry
                        </Button>
                      </div>
                      <FinancialLedger
                        entries={ledger}
                        onEdit={handleEditLedger}
                        onDelete={handleDeleteLedger}
                      />
                    </div>
                  </TabsContent>

                  {activeLifecycleViews.map((v) => {
                    const serviceExpenses = expenses.filter(
                      (e) => e['Module Record ID'] === v.moduleRecordId,
                    );
                    const serviceCtx = { moduleRecordId: v.moduleRecordId, serviceName: v.serviceName };
                    return (
                      <TabsContent key={v.moduleRecordId} value={v.moduleRecordId}>
                        <div className="space-y-4">
                          <ServiceLifecycleCard
                            view={v}
                            onAddPayment={handleAddServicePayment}
                            onChanged={() => {
                              // Refresh both the service-level views and the
                              // surrounding ledger/summary so the user sees
                              // their save reflected without a manual reload.
                              setLifecycleRefreshSignal((n) => n + 1);
                              void handleDetailCreated();
                            }}
                          />
                          <ProjectExpensesTable
                            serviceName={v.serviceName}
                            expenses={serviceExpenses}
                            payments={costPayments}
                            onAdd={() => handleAddExpense(serviceCtx)}
                            onEdit={(expense) => handleEditExpense(expense, serviceCtx)}
                            onDelete={handleDeleteExpense}
                            onLogPayment={handleLogPaymentOnExpense}
                          />
                        </div>
                      </TabsContent>
                    );
                  })}

                  <TabsContent value="more">
                    <Tabs defaultValue="reports" className="space-y-4">
                      <TabsList>
                        <TabsTrigger value="reports" className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Adjuster Reports
                        </TabsTrigger>
                        <TabsTrigger value="costing" className="flex items-center gap-2">
                          <Hammer className="h-4 w-4" />
                          Job Costing
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="reports">
                        <div className="space-y-4">
                          <div className="flex justify-end">
                            <Button size="sm" onClick={() => ensureBridgeAndOpenForm(() => { setEditingReport(null); setShowReportForm(true); })}>
                              <Plus className="h-4 w-4 mr-1" />
                              Add Report
                            </Button>
                          </div>
                          <AdjusterReportsTracker
                            reports={reports}
                            onEdit={handleEditReport}
                            onDelete={handleDeleteReport}
                          />
                        </div>
                      </TabsContent>

                      <TabsContent value="costing">
                        <div className="space-y-4">
                          <div className="flex justify-end">
                            <Button size="sm" onClick={() => ensureBridgeAndOpenForm(() => { setEditingCost(null); setShowCostForm(true); })}>
                              <Plus className="h-4 w-4 mr-1" />
                              Add Cost
                            </Button>
                          </div>
                          <JobCostingTable
                            costs={costs}
                            onEdit={handleEditCost}
                            onDelete={handleDeleteCost}
                          />
                        </div>
                      </TabsContent>
                    </Tabs>
                  </TabsContent>
                </Tabs>
              </div>
            )
          )}
        </main>
      </div>

      {/* Form Dialogs — always render when in claim-detail view so ensureBridgeAndOpenForm can open them */}
      {view === 'claim-detail' && (
        <>
          <LedgerEntryForm
            open={showLedgerForm}
            onOpenChange={(o) => {
              if (!o) setPrefillLedger(null);
              handleLedgerFormClose(o);
            }}
            claimRecordId={financialRecordId || ''}
            onSuccess={handleDetailCreated}
            editRecord={editingLedger}
            prefillValues={prefillLedger ?? undefined}
          />
          <AdjusterReportForm
            open={showReportForm}
            onOpenChange={handleReportFormClose}
            claimRecordId={financialRecordId || ''}
            onSuccess={handleDetailCreated}
            editRecord={editingReport}
          />
          <JobCostForm
            open={showCostForm}
            onOpenChange={handleCostFormClose}
            claimRecordId={financialRecordId || ''}
            onSuccess={handleDetailCreated}
            editRecord={editingCost}
          />
          <ProjectExpenseForm
            open={showExpenseForm}
            onOpenChange={handleExpenseFormClose}
            claimRecordId={financialRecordId || ''}
            moduleRecordId={expenseServiceContext?.moduleRecordId || ''}
            serviceName={expenseServiceContext?.serviceName || ''}
            onSuccess={handleDetailCreated}
            editRecord={editingExpense}
          />
          <CostPaymentForm
            open={showCostPaymentForm}
            onOpenChange={handleCostPaymentFormClose}
            expense={costPaymentTarget?.expense ?? null}
            balanceDue={costPaymentTarget?.balanceDue ?? 0}
            onSuccess={handleDetailCreated}
          />
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={deleteTitle}
        description={deleteDescription}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
