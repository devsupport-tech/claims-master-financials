import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
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
} from 'lucide-react';
import {
  ClaimForm,
  LedgerEntryForm,
  AdjusterReportForm,
  MortgageReleaseForm,
  JobCostForm,
} from '@/components/forms';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { Claim, FinancialSummary, LedgerEntry, AdjusterReport, MortgageRelease, JobCost } from '@/types';

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button className="flex items-center gap-3 hover:opacity-80 transition-opacity" onClick={() => setSelectedClaimId(null)}>
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-primary-foreground" />
              </div>
              <div className="text-left">
                <h1 className="text-xl font-bold">Claims Master Financials</h1>
                <p className="text-sm text-muted-foreground">Insurance Claims Financial Management</p>
              </div>
            </button>
            <div className="flex items-center gap-2">
              {selectedClaimId && (
                <Button variant="outline" size="sm" onClick={() => setSelectedClaimId(null)}>
                  <Home className="h-4 w-4 mr-2" />
                  Overview
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => { loadClaims(); loadOverview(); }} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar - Claim Selection */}
          <aside className="col-span-3 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Select Claim</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => { setEditingClaim(null); setShowClaimForm(true); }}>
                    <Plus className="h-4 w-4 mr-1" />
                    New
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search claims..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Claims List */}
                <div className="max-h-[500px] overflow-y-auto space-y-1">
                  {isLoading ? (
                    <div className="py-8 text-center text-muted-foreground">Loading claims...</div>
                  ) : filteredClaims.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">No claims found</div>
                  ) : (
                    filteredClaims.map(claim => (
                      <div
                        key={claim.id}
                        className={`group relative w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                          selectedClaimId === claim.id
                            ? 'border-primary bg-primary/5'
                            : 'border-transparent hover:bg-muted'
                        }`}
                        onClick={() => setSelectedClaimId(claim.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm">{claim['Claim ID']}</div>
                            <div className="text-xs text-muted-foreground">{claim['Last Name']}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); handleEditClaim(claim); }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={(e) => { e.stopPropagation(); handleDeleteClaim(claim); }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            {summary && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Quick Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Reports</span>
                    <Badge variant="secondary">{summary.adjusterReportCount}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Releases</span>
                    <Badge variant="secondary">{summary.mortgageReleaseCount}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Pending Inspections</span>
                    <Badge variant={summary.pendingInspections > 0 ? 'warning' : 'secondary'}>
                      {summary.pendingInspections}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </aside>

          {/* Main Content */}
          <main className="col-span-9 space-y-6">
            {!selectedClaimId ? (
              isLoadingOverview ? (
                <Card className="py-16">
                  <CardContent className="text-center">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
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
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                  <p className="mt-4 text-muted-foreground">Loading financial data...</p>
                </CardContent>
              </Card>
            ) : (
              <>
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
              </>
            )}
          </main>
        </div>
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
