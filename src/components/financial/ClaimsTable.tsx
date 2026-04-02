import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Search, Users } from 'lucide-react';
import type { ClaimMaster } from '@/types';

interface ClaimsTableProps {
  claims: ClaimMaster[];
  isLoading: boolean;
  onSelectClaim: (claim: ClaimMaster) => void;
}

const stageBadgeVariants: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  Intake: 'secondary',
  Estimate: 'default',
  'Carrier Review': 'warning',
  Supplement: 'warning',
  'Active Services': 'success',
  Closed: 'destructive',
};

const statusBadgeVariants: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  Todo: 'secondary',
  'In progress': 'warning',
  Done: 'success',
};

type SortField = 'Claim ID' | 'Last Name' | 'Carrier' | 'Stage' | 'Loss Date' | 'RCV';
type SortDir = 'asc' | 'desc';

export function ClaimsTable({ claims, isLoading, onSelectClaim }: ClaimsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('Claim ID');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const filtered = claims.filter(claim => {
    const q = searchQuery.toLowerCase();
    return (
      (claim['Claim ID'] || '').toLowerCase().includes(q) ||
      (claim['Last Name'] || '').toLowerCase().includes(q) ||
      (claim['First Name'] || '').toLowerCase().includes(q) ||
      (claim.Address || '').toLowerCase().includes(q) ||
      (claim.Carrier || '').toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal: string | number = '';
    let bVal: string | number = '';

    switch (sortField) {
      case 'Claim ID': aVal = a['Claim ID']; bVal = b['Claim ID']; break;
      case 'Last Name': aVal = a['Last Name']; bVal = b['Last Name']; break;
      case 'Carrier': aVal = a.Carrier; bVal = b.Carrier; break;
      case 'Stage': aVal = a.Stage; bVal = b.Stage; break;
      case 'Loss Date': aVal = a['Loss Date']; bVal = b['Loss Date']; break;
      case 'RCV': aVal = a.RCV; bVal = b.RCV; break;
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const cmp = String(aVal).localeCompare(String(bVal));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function SortIndicator({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Claims</CardTitle>
            <Badge variant="secondary" className="ml-2">{filtered.length}</Badge>
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search claims..."
              className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading claims...</div>
        ) : sorted.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            {searchQuery ? 'No claims match your search' : 'No claims found'}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort('Claim ID')}>
                    Claim ID<SortIndicator field="Claim ID" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort('Last Name')}>
                    Customer<SortIndicator field="Last Name" />
                  </TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort('Carrier')}>
                    Carrier<SortIndicator field="Carrier" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort('Stage')}>
                    Stage<SortIndicator field="Stage" />
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort('Loss Date')}>
                    Loss Date<SortIndicator field="Loss Date" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort('RCV')}>
                    RCV<SortIndicator field="RCV" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((claim) => (
                  <TableRow
                    key={claim.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onSelectClaim(claim)}
                  >
                    <TableCell className="font-medium">{claim['Claim ID']}</TableCell>
                    <TableCell>
                      {claim['Last Name']}{claim['First Name'] ? `, ${claim['First Name']}` : ''}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{claim.Address}</TableCell>
                    <TableCell>{claim.Carrier}</TableCell>
                    <TableCell>
                      {claim.Stage && (
                        <Badge variant={stageBadgeVariants[claim.Stage] || 'secondary'}>
                          {claim.Stage}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {claim.Status && (
                        <Badge variant={statusBadgeVariants[claim.Status] || 'secondary'}>
                          {claim.Status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{claim['Loss Date'] ? formatDate(claim['Loss Date']) : '—'}</TableCell>
                    <TableCell className="text-right">{claim.RCV ? formatCurrency(claim.RCV) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
