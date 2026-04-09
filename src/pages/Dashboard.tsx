import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FinancialSummaryCard,
  AdjusterReportsTracker,
  MortgageReleaseTracker,
  FinancialLedger,
  JobCostingTable,
  PortfolioOverview,
  ClaimsTable,
} from '@/components/financial';
import {
  getClaimFinancialSummary,
  getFinancialLedger,
  getAdjusterReports,
  getMortgageReleases,
  getJobCosting,
  deleteLedgerEntry,
  deleteAdjusterReport,
  deleteMortgageRelease,
  deleteJobCost,
  getPortfolioOverview,
} from '@/lib/airtable';
import type { PortfolioOverviewData } from '@/lib/airtable';
import { getAllClaimsMaster, ensureFinancialClaimRecord, syncFinancialSummaryToClaimsMaster } from '@/lib/claims-master';
import {
  DollarSign,
  FileText,
  Building2,
  Wrench,
  Receipt,
  RefreshCw,
  Plus,
  Home,
  ArrowLeft,
  LayoutDashboard,
  ExternalLink,
  HardHat,
  Users,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
} from 'lucide-react';
import {
  LedgerEntryForm,
  AdjusterReportForm,
  MortgageReleaseForm,
  JobCostForm,
} from '@/components/forms';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import type { ClaimMaster, FinancialSummary, LedgerEntry, AdjusterReport, MortgageRelease, JobCost } from '@/types';

const CLAIMS_MASTER_URL = import.meta.env.VITE_LINK_CLAIMS_MASTER || '';
const RESTORATION_OPS_URL = import.meta.env.VITE_LINK_RESTORATION_OPS || '';
const BRANDING_LABEL = import.meta.env.VITE_BRANDING_LABEL || '';

type View = 'overview' | 'claims' | 'claim-detail';

export function Dashboard() {
  const [collapsed, setCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [claims, setClaims] = useState<ClaimMaster[]>([]);
  const [view, setView] = useState<View>('overview');
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [financialRecordId, setFinancialRecordId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Form dialog states
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [showReleaseForm, setShowReleaseForm] = useState(false);
  const [showCostForm, setShowCostForm] = useState(false);

  // Edit record states
  const [editingLedger, setEditingLedger] = useState<any>(null);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [editingRelease, setEditingRelease] = useState<any>(null);
  const [editingCost, setEditingCost] = useState<any>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'ledger' | 'report' | 'release' | 'cost';
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
  const [releases, setReleases] = useState<MortgageRelease[]>([]);
  const [costs, setCosts] = useState<JobCost[]>([]);

  // Load claims + overview on mount
  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setIsLoading(true);
    setIsLoadingOverview(true);
    try {
      // Claims Master is the source of truth for all claim data
      const claimsData = await getAllClaimsMaster();
      setClaims(claimsData);

      const overviewData = await getPortfolioOverview(claimsData);
      setOverview(overviewData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingOverview(false);
    }
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
      const [summaryData, ledgerData, reportsData, releasesData, costsData] = await Promise.all([
        getClaimFinancialSummary(claimRecordId),
        getFinancialLedger(claimRecordId),
        getAdjusterReports(claimRecordId),
        getMortgageReleases(claimRecordId),
        getJobCosting(claimRecordId),
      ]);

      setSummary(summaryData as FinancialSummary);
      setLedger(ledgerData as LedgerEntry[]);
      setReports(reportsData as AdjusterReport[]);
      setReleases(releasesData as MortgageRelease[]);
      setCosts(costsData as JobCost[]);
    } catch (error) {
      console.error('Failed to load claim details:', error);
    } finally {
      setIsLoadingDetails(false);
    }
  }

  async function handleDetailCreated() {
    if (financialRecordId) {
      await loadClaimDetails(financialRecordId);

      // Sync updated financial summary back to Claims Master
      const selectedClaim = claims.find(c => c.id === selectedClaimId);
      if (selectedClaim) {
        const freshSummary = await getClaimFinancialSummary(financialRecordId);
        syncFinancialSummaryToClaimsMaster(selectedClaim.id, freshSummary as FinancialSummary).catch(err =>
          console.error('Failed to sync to Claims Master:', err)
        );
      }
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

  function handleEditRelease(record: any) {
    setEditingRelease(record);
    setShowReleaseForm(true);
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

  function handleDeleteRelease(record: any) {
    setDeleteTarget({ type: 'release', record });
  }

  function handleDeleteCost(record: any) {
    setDeleteTarget({ type: 'cost', record });
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
        case 'release':
          await deleteMortgageRelease(deleteTarget.record.id);
          await handleDetailCreated();
          break;
        case 'cost':
          await deleteJobCost(deleteTarget.record.id);
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
      release: 'mortgage release',
      cost: 'job cost',
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

  function handleReleaseFormClose(open: boolean) {
    setShowReleaseForm(open);
    if (!open) setEditingRelease(null);
  }

  function handleCostFormClose(open: boolean) {
    setShowCostForm(open);
    if (!open) setEditingCost(null);
  }

  const selectedClaim = claims.find(c => c.id === selectedClaimId);
  const { title: deleteTitle, description: deleteDescription } = getDeleteDescription();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ─── Sidebar ─── */}
      <aside
        className="relative z-20 flex shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-100 shadow-xl transition-all duration-300 ease-in-out"
        style={{ width: collapsed ? 56 : 224 }}
      >
        {/* Branding */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-4">
          {!collapsed ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="shrink-0 rounded bg-slate-100 p-1.5 text-slate-900">
                <DollarSign className="h-5 w-5" />
              </div>
              <span className="whitespace-nowrap text-lg font-bold text-slate-50">
                Financials{BRANDING_LABEL ? ` ${BRANDING_LABEL}` : ''}
              </span>
            </div>
          ) : (
            <div className="mx-auto shrink-0 rounded bg-slate-100 p-1.5 text-slate-900">
              <DollarSign className="h-5 w-5" />
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 text-slate-300 hover:bg-slate-800 hover:text-white',
              collapsed ? 'absolute -right-4 top-12 rounded-full border border-slate-700 bg-slate-900 shadow-md' : ''
            )}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-6">
          {CLAIMS_MASTER_URL && (
            <a
              href={CLAIMS_MASTER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-3 rounded-md px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-white',
                collapsed && 'justify-center px-0 gap-0'
              )}
            >
              <LayoutDashboard className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <>
                  <span>Claims Master</span>
                  <ExternalLink className="ml-auto h-3 w-3 opacity-50" />
                </>
              )}
            </a>
          )}
          {RESTORATION_OPS_URL && (
            <a
              href={RESTORATION_OPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-3 rounded-md px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-white',
                collapsed && 'justify-center px-0 gap-0'
              )}
            >
              <HardHat className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <>
                  <span>Restoration Ops</span>
                  <ExternalLink className="ml-auto h-3 w-3 opacity-50" />
                </>
              )}
            </a>
          )}
          <button
            onClick={() => { setView('overview'); setSelectedClaimId(null); setFinancialRecordId(null); }}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              collapsed && 'justify-center px-0 gap-0',
              view === 'overview'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            )}
          >
            <Home className="h-5 w-5 shrink-0" />
            {!collapsed && <span>Overview</span>}
          </button>
          <button
            onClick={() => { setView('claims'); setSelectedClaimId(null); setFinancialRecordId(null); }}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              collapsed && 'justify-center px-0 gap-0',
              view === 'claims' || view === 'claim-detail'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            )}
          >
            <Users className="h-5 w-5 shrink-0" />
            {!collapsed && <span>Claims</span>}
          </button>
        </nav>

        {/* Bottom */}
        <div className="space-y-2 shrink-0 border-t border-slate-800 p-3">
          <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between px-2')}>
            {!collapsed && <span className="text-sm font-medium text-slate-300">Theme</span>}
            <button
              onClick={() => { setIsDark(!isDark); document.documentElement.classList.toggle('dark'); }}
              className="h-8 w-8 rounded-md text-slate-300 transition hover:bg-slate-800 hover:text-white inline-flex items-center justify-center"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          <button
            onClick={loadAll}
            disabled={isLoading}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-white disabled:opacity-50',
              collapsed && 'justify-center px-0 gap-0'
            )}
          >
            <RefreshCw className={cn('h-5 w-5 shrink-0', isLoading && 'animate-spin')} />
            {!collapsed && <span>Refresh</span>}
          </button>
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
              <PortfolioOverview data={overview} />
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

                {/* Claim Header */}
                {selectedClaim && (
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">{selectedClaim['Claim ID']}</h2>
                      <p className="text-muted-foreground">
                        {selectedClaim['Last Name']}{selectedClaim['First Name'] ? `, ${selectedClaim['First Name']}` : ''} | {selectedClaim.Address}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedClaim.Stage && (
                        <Badge variant="secondary">{selectedClaim.Stage}</Badge>
                      )}
                      <Badge variant="outline" className="text-base px-3 py-1">
                        {selectedClaim.Carrier}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Financial Summary */}
                {summary && <FinancialSummaryCard summary={summary} />}

                {/* Tabbed Content */}
                <Tabs defaultValue="ledger" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="ledger" className="flex items-center gap-2">
                      <Receipt className="h-4 w-4" />
                      Ledger
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Adjuster Reports
                    </TabsTrigger>
                    <TabsTrigger value="mortgage" className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Mortgage
                    </TabsTrigger>
                    <TabsTrigger value="costing" className="flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Job Costing
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

                  <TabsContent value="mortgage">
                    <div className="space-y-4">
                      <div className="flex justify-end">
                        <Button size="sm" onClick={() => ensureBridgeAndOpenForm(() => { setEditingRelease(null); setShowReleaseForm(true); })}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add Release
                        </Button>
                      </div>
                      <MortgageReleaseTracker
                        releases={releases}
                        onEdit={handleEditRelease}
                        onDelete={handleDeleteRelease}
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
            onOpenChange={handleLedgerFormClose}
            claimRecordId={financialRecordId || ''}
            onSuccess={handleDetailCreated}
            editRecord={editingLedger}
          />
          <AdjusterReportForm
            open={showReportForm}
            onOpenChange={handleReportFormClose}
            claimRecordId={financialRecordId || ''}
            onSuccess={handleDetailCreated}
            editRecord={editingReport}
          />
          <MortgageReleaseForm
            open={showReleaseForm}
            onOpenChange={handleReleaseFormClose}
            claimRecordId={financialRecordId || ''}
            onSuccess={handleDetailCreated}
            editRecord={editingRelease}
          />
          <JobCostForm
            open={showCostForm}
            onOpenChange={handleCostFormClose}
            claimRecordId={financialRecordId || ''}
            onSuccess={handleDetailCreated}
            editRecord={editingCost}
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
