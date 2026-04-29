import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  getProjectExpenses,
  getCostPayments,
  deleteProjectExpense,
  deleteCostPayment,
} from '@/lib/airtable';
import type { PortfolioOverviewData } from '@/lib/airtable';
import { getAllClaimsMaster, ensureFinancialClaimRecord, syncFinancialSummaryToClaimsMaster, getPaymentsLog } from '@/lib/claims-master';
import { getStageColor } from '@/lib/claim-badges';
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

const CLAIMS_MASTER_URL = import.meta.env.VITE_LINK_CLAIMS_MASTER || '';
const RESTORATION_OPS_URL = import.meta.env.VITE_LINK_RESTORATION_OPS || '';
const BRANDING_LABEL = import.meta.env.VITE_BRANDING_LABEL || '';

type View = 'overview' | 'claims' | 'claim-detail';

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
  // Lifecycle views are produced by FinancialReportTab from Modules+JobCosting+Ledger;
  // bubbled up so the supporting tabs below can render one tab per service.
  const [lifecycleViews, setLifecycleViews] = useState<ServiceLifecycleView[]>([]);
  // Bumping this counter forces FinancialReportTab to re-fetch its data,
  // so service-tab Comparatives values refresh in place after a save.
  const [lifecycleRefreshSignal, setLifecycleRefreshSignal] = useState(0);

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
  function handleAddServicePayment(defaults: { category: string; suggestedAmount?: number }) {
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
        Reconciled: false,
      });
      setShowLedgerForm(true);
    });
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
      const [summaryData, ledgerData, reportsData, costsData, expensesData] =
        await Promise.all([
          getClaimFinancialSummary(claimRecordId),
          getFinancialLedger(claimRecordId),
          getAdjusterReports(claimRecordId),
          getJobCosting(claimRecordId),
          getProjectExpenses(claimRecordId),
        ]);

      setSummary(summaryData as FinancialSummary);
      setLedger(ledgerData as LedgerEntry[]);
      setReports(reportsData as AdjusterReport[]);
      setCosts(costsData as JobCost[]);
      setExpenses(expensesData as ProjectExpense[]);

      // Cost Payments are pulled in a follow-up call and scoped client-side
      // to the expenses we just fetched — the Airtable side can't filter by
      // link-to-filtered-set in one round-trip.
      const expenseIds = new Set((expensesData as ProjectExpense[]).map((e) => e.id));
      if (expenseIds.size > 0) {
        const all = (await getCostPayments()) as CostPayment[];
        setCostPayments(
          all.filter(
            (p) =>
              Array.isArray(p['Project Expense']) &&
              p['Project Expense'].some((id) => expenseIds.has(id)),
          ),
        );
      } else {
        setCostPayments([]);
      }
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
          await deleteProjectExpense(deleteTarget.record.id);
          await handleDetailCreated();
          break;
        case 'cost-payment':
          await deleteCostPayment(deleteTarget.record.id);
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

                {/* Claim Header — mirrors the Claims Master VEC claim header
                    layout so users see the same identity treatment across
                    apps. Gradient card + glass-morphism container, bold
                    "{Last Name} : {Carrier Claim #}" heading, name/address
                    subline, color-mapped Status + Insurance chips, and a
                    meta info row (Loss Type · Loss Date · Adjuster) below. */}
                {selectedClaim && (
                  <Card className="overflow-hidden border-border bg-gradient-to-r from-background via-muted/50 to-info/5 text-foreground shadow-lg dark:from-background dark:via-muted/30 dark:to-info/5">
                    <CardContent className="pt-6">
                      <div className="rounded-2xl border border-border bg-background/80 px-5 py-4 shadow-sm backdrop-blur-sm">
                        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                          {selectedClaim['Last Name'] || 'N/A'}  :  {selectedClaim['Carrier Claim #'] || selectedClaim['Claim ID']}
                        </h1>
                        {selectedClaim['Carrier Claim #'] && selectedClaim['Claim ID'] && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Claim ID: {selectedClaim['Claim ID']}
                          </p>
                        )}
                        <p className="mt-1 text-sm text-muted-foreground">
                          {selectedClaim['Last Name']}
                          {selectedClaim['First Name'] ? `, ${selectedClaim['First Name']}` : ''}
                          {selectedClaim.Address ? ` | ${selectedClaim.Address}` : ''}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                          {selectedClaim.Stage && (
                            <>
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status:</span>
                              <Badge variant="outline" className={getStageColor(selectedClaim.Stage)}>
                                {selectedClaim.Stage}
                              </Badge>
                            </>
                          )}
                          {selectedClaim.Carrier && (
                            <>
                              <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Insurance:</span>
                              <Badge variant="outline">{selectedClaim.Carrier}</Badge>
                            </>
                          )}
                        </div>
                        {/* Claim metadata — matches the Claims Master VEC info
                            grid. Inline + compact so the Financials header
                            stays lean but users see the same identity context. */}
                        {(selectedClaim['Loss Type'] || selectedClaim['Loss Date'] || selectedClaim['Adjuster Name'] || selectedClaim['Policy Number']) && (
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {selectedClaim['Loss Type'] && (
                              <span>
                                <span className="font-semibold uppercase tracking-wide">Loss:</span>{' '}
                                <span className="text-foreground">{selectedClaim['Loss Type']}</span>
                              </span>
                            )}
                            {selectedClaim['Loss Date'] && (
                              <span>
                                <span className="font-semibold uppercase tracking-wide">Date of Loss:</span>{' '}
                                <span className="text-foreground">{selectedClaim['Loss Date']}</span>
                              </span>
                            )}
                            {selectedClaim['Policy Number'] && (
                              <span>
                                <span className="font-semibold uppercase tracking-wide">Policy #:</span>{' '}
                                <span className="text-foreground">{selectedClaim['Policy Number']}</span>
                              </span>
                            )}
                            {selectedClaim['Adjuster Name'] && (
                              <span>
                                <span className="font-semibold uppercase tracking-wide">Adjuster:</span>{' '}
                                <span className="text-foreground">{selectedClaim['Adjuster Name']}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
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

                {/* Supporting tabs — Ledger first, then one tab per service
                    (Water Mitigation, Rebuild, etc.) sourced from the lifecycle
                    views bubbled up by FinancialReportTab, and a "More" tab
                    that holds Adjuster Reports / Mortgage / Job Costing /
                    Submissions for occasional access. */}
                <Tabs defaultValue="ledger" className="space-y-4">
                  <TabsList className="flex-wrap h-auto">
                    <TabsTrigger value="ledger" className="flex items-center gap-2">
                      <Receipt className="h-4 w-4" />
                      Ledger
                    </TabsTrigger>
                    {lifecycleViews.map((v) => (
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

                  {lifecycleViews.map((v) => {
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
