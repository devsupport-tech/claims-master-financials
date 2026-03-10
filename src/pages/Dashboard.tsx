import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FinancialSummaryCard,
  AdjusterReportsTracker,
  MortgageReleaseTracker,
  FinancialLedger,
  JobCostingTable,
} from '@/components/financial';
import {
  getAllClaims,
  getClaimFinancialSummary,
  getFinancialLedger,
  getAdjusterReports,
  getMortgageReleases,
  getJobCosting,
} from '@/lib/airtable';
import {
  DollarSign,
  FileText,
  Building2,
  Wrench,
  Receipt,
  RefreshCw,
  Search,
  ChevronRight,
} from 'lucide-react';
import type { Claim, FinancialSummary, LedgerEntry, AdjusterReport, MortgageRelease, JobCost } from '@/types';

export function Dashboard() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Financial data for selected claim
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [reports, setReports] = useState<AdjusterReport[]>([]);
  const [releases, setReleases] = useState<MortgageRelease[]>([]);
  const [costs, setCosts] = useState<JobCost[]>([]);

  // Load claims on mount
  useEffect(() => {
    loadClaims();
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

      // Auto-select first claim if available
      if (data.length > 0 && !selectedClaimId) {
        setSelectedClaimId(data[0].id);
      }
    } catch (error) {
      console.error('Failed to load claims:', error);
    } finally {
      setIsLoading(false);
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Claims Master Financials</h1>
                <p className="text-sm text-muted-foreground">Insurance Claims Financial Management</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={loadClaims} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar - Claim Selection */}
          <aside className="col-span-3 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Select Claim</CardTitle>
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
                      <button
                        key={claim.id}
                        onClick={() => setSelectedClaimId(claim.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          selectedClaimId === claim.id
                            ? 'border-primary bg-primary/5'
                            : 'border-transparent hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm">{claim['Claim ID']}</div>
                            <div className="text-xs text-muted-foreground">{claim['Last Name']}</div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
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
              <Card className="py-16">
                <CardContent className="text-center text-muted-foreground">
                  Select a claim from the sidebar to view financial details
                </CardContent>
              </Card>
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
                    <FinancialLedger entries={ledger} />
                  </TabsContent>

                  <TabsContent value="reports">
                    <AdjusterReportsTracker reports={reports} />
                  </TabsContent>

                  <TabsContent value="mortgage">
                    <MortgageReleaseTracker releases={releases} />
                  </TabsContent>

                  <TabsContent value="costing">
                    <JobCostingTable costs={costs} />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
