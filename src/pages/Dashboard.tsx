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
} from '@/components/financial';
import {
  getAllClaims,
  getClaimFinancialSummary,
  getFinancialLedger,
  getAdjusterReports,
  getMortgageReleases,
  getJobCosting,
  deleteClaim,
  deleteLedgerEntry,
  deleteAdjusterReport,
  deleteMortgageRelease,
  deleteJobCost,
  getPortfolioOverview,
} from '@/lib/airtable';
import type { PortfolioOverviewData } from '@/lib/airtable';
import {
  DollarSign,
  FileText,
  Building2,
  Wrench,
  Receipt,
  RefreshCw,
  Search,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Home,
  LayoutDashboard,
  ExternalLink,
  HardHat,
} from 'lucide-react';
import {
  ClaimForm,
  LedgerEntryForm,
  AdjusterReportForm,
  MortgageReleaseForm,
  JobCostForm,
} from '@/components/forms';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import type { Claim, FinancialSummary, LedgerEntry, AdjusterReport, MortgageRelease, JobCost } from '@/types';

const CLAIMS_MASTER_URL = import.meta.env.VITE_LINK_CLAIMS_MASTER || '';
const RESTORATION_OPS_URL = import.meta.env.VITE_LINK_RESTORATION_OPS || '';

export function Dashboard() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Form dialog states
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [showReleaseForm, setShowReleaseForm] = useState(false);
  const [showCostForm, setShowCostForm] = useState(false);

  // Edit record states
  const [editingClaim, setEditingClaim] = useState<any>(null);
  const [editingLedger, setEditingLedger] = useState<any>(null);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [editingRelease, setEditingRelease] = useState<any>(null);
  const [editingCost, setEditingCost] = useState<any>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'claim' | 'ledger' | 'report' | 'release' | 'cost';
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
    loadClaims();
    loadOverview();
  }, []);

  // Load claim details when selection changes
  useEffect(() => {
    if (selectedClaimId) {
      loadClaimDetails(selectedClaimId);
    }
  }, [selectedClaimId]);

  async function loadClaims() {
    setIsLoading(true);
    try {
      const data = await getAllClaims();
      setClaims(data as Claim[]);

      // Don't auto-select — show portfolio overview first
    } catch (error) {
      console.error('Failed to load claims:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadOverview() {
    setIsLoadingOverview(true);
    try {
      const data = await getPortfolioOverview();
      setOverview(data);
    } catch (error) {
      console.error('Failed to load overview:', error);
    } finally {
      setIsLoadingOverview(false);
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

  // Refresh callbacks after form creation/edit
  async function handleClaimCreated() {
    await loadClaims();
    if (selectedClaimId) await loadClaimDetails(selectedClaimId);
    loadOverview();
  }

  async function handleDetailCreated() {
    if (selectedClaimId) await loadClaimDetails(selectedClaimId);
    loadOverview();
  }

  // Edit handlers
  function handleEditClaim(record: any) {
    setEditingClaim(record);
    setShowClaimForm(true);
  }

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

  function handleDeleteClaim(record: any) {
    setDeleteTarget({ type: 'claim', record });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      switch (deleteTarget.type) {
        case 'claim':
          await deleteClaim(deleteTarget.record.id);
          setSelectedClaimId(null);
          await loadClaims();
          break;
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
      deleteTarget.record['Claim ID'] ||
      'this record';
    const typeLabel = {
      claim: 'claim',
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
  function handleClaimFormClose(open: boolean) {
    setShowClaimForm(open);
    if (!open) setEditingClaim(null);
  }

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

  // Filter claims by search
  const filteredClaims = claims.filter(claim => {
    const query = searchQuery.toLowerCase();
    return (
      (claim['Claim ID'] || '').toLowerCase().includes(query) ||
      (claim['Last Name'] || '').toLowerCase().includes(query) ||
      (claim.Address || '').toLowerCase().includes(query)
    );
  });

  const selectedClaim = claims.find(c => c.id === selectedClaimId);
  const { title: deleteTitle, description: deleteDescription } = getDeleteDescription();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ─── Sidebar ─── */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-100 shadow-xl">
        {/* Branding */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="shrink-0 rounded bg-slate-100 p-1.5 text-slate-900">
              <DollarSign className="h-5 w-5" />
            </div>
            <span className="whitespace-nowrap text-lg font-bold text-slate-50">Financials</span>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="shrink-0 space-y-1 px-3 py-4">
          {CLAIMS_MASTER_URL && (
            <a
              href={CLAIMS_MASTER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-white"
            >
              <LayoutDashboard className="h-5 w-5" />
              <span>Claims Master</span>
              <ExternalLink className="ml-auto h-3 w-3 opacity-50" />
            </a>
          )}
          {RESTORATION_OPS_URL && (
            <a
              href={RESTORATION_OPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-white"
            >
              <HardHat className="h-5 w-5" />
              <span>Restoration Ops</span>
              <ExternalLink className="ml-auto h-3 w-3 opacity-50" />
            </a>
          )}
          <button
            onClick={() => setSelectedClaimId(null)}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              !selectedClaimId
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            )}
          >
            <Home className="h-5 w-5" />
            <span>Overview</span>
          </button>
          <button
            onClick={() => { setEditingClaim(null); setShowClaimForm(true); }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-white"
          >
            <Plus className="h-5 w-5" />
            <span>New Claim</span>
          </button>
        </nav>

        {/* Claims List */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-slate-800">
          <div className="shrink-0 px-4 pb-2 pt-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Claims</span>
          </div>
          <div className="shrink-0 px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                placeholder="Search..."
                className="w-full rounded-md border border-slate-700 bg-slate-800 py-1.5 pl-8 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-600"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
            {isLoading ? (
              <div className="py-6 text-center text-sm text-slate-500">Loading...</div>
            ) : filteredClaims.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">No claims found</div>
            ) : (
              filteredClaims.map((claim) => (
                <div
                  key={claim.id}
                  className={cn(
                    'group relative flex cursor-pointer items-center justify-between rounded-md px-3 py-2 transition-colors',
                    selectedClaimId === claim.id
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  )}
                  onClick={() => setSelectedClaimId(claim.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{claim['Claim ID']}</div>
                    <div className="truncate text-xs text-slate-500">{claim['Last Name']}</div>
                  </div>
                  <div className="ml-2 flex items-center gap-0.5">
                    <button
                      className="flex h-6 w-6 items-center justify-center rounded text-slate-400 opacity-0 transition-opacity hover:bg-slate-700 hover:text-white group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); handleEditClaim(claim); }}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      className="flex h-6 w-6 items-center justify-center rounded text-rose-400 opacity-0 transition-opacity hover:bg-rose-500/20 hover:text-rose-300 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); handleDeleteClaim(claim); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Stats - when claim selected */}
        {summary && selectedClaimId && (
          <div className="shrink-0 space-y-2 border-t border-slate-800 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Reports</span>
              <span className="text-xs font-medium text-slate-200">{summary.adjusterReportCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Releases</span>
              <span className="text-xs font-medium text-slate-200">{summary.mortgageReleaseCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Pending</span>
              <span className={cn('text-xs font-medium', summary.pendingInspections > 0 ? 'text-amber-400' : 'text-slate-200')}>
                {summary.pendingInspections}
              </span>
            </div>
          </div>
        )}

        {/* Bottom */}
        <div className="shrink-0 border-t border-slate-800 p-3">
          <button
            onClick={() => { loadClaims(); loadOverview(); }}
            disabled={isLoading}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={cn('h-5 w-5', isLoading && 'animate-spin')} />
            <span>Refresh</span>
          </button>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <div className="flex-1 overflow-y-auto bg-muted/20">
        <main className="mx-auto max-w-[92rem] p-4 md:p-8">
          {!selectedClaimId ? (
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
                  Select a claim from the sidebar to view financial details
                </CardContent>
              </Card>
            )
          ) : isLoadingDetails ? (
            <Card className="py-16">
              <CardContent className="text-center">
                <RefreshCw className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">Loading financial data...</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Claim Header */}
              {selectedClaim && (
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{selectedClaim['Claim ID']}</h2>
                    <p className="text-muted-foreground">
                      {selectedClaim['Last Name']}, {selectedClaim['First Name']} | {selectedClaim.Address}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-base px-3 py-1">
                    {selectedClaim.Carrier}
                  </Badge>
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
                      <Button size="sm" onClick={() => { setEditingLedger(null); setShowLedgerForm(true); }}>
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
                      <Button size="sm" onClick={() => { setEditingReport(null); setShowReportForm(true); }}>
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
                      <Button size="sm" onClick={() => { setEditingRelease(null); setShowReleaseForm(true); }}>
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
                      <Button size="sm" onClick={() => { setEditingCost(null); setShowCostForm(true); }}>
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
          )}
        </main>
      </div>

      {/* Form Dialogs */}
      <ClaimForm
        open={showClaimForm}
        onOpenChange={handleClaimFormClose}
        onSuccess={handleClaimCreated}
        editRecord={editingClaim}
      />

      {selectedClaimId && (
        <>
          <LedgerEntryForm
            open={showLedgerForm}
            onOpenChange={handleLedgerFormClose}
            claimRecordId={selectedClaimId}
            onSuccess={handleDetailCreated}
            editRecord={editingLedger}
          />
          <AdjusterReportForm
            open={showReportForm}
            onOpenChange={handleReportFormClose}
            claimRecordId={selectedClaimId}
            onSuccess={handleDetailCreated}
            editRecord={editingReport}
          />
          <MortgageReleaseForm
            open={showReleaseForm}
            onOpenChange={handleReleaseFormClose}
            claimRecordId={selectedClaimId}
            onSuccess={handleDetailCreated}
            editRecord={editingRelease}
          />
          <JobCostForm
            open={showCostForm}
            onOpenChange={handleCostFormClose}
            claimRecordId={selectedClaimId}
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
