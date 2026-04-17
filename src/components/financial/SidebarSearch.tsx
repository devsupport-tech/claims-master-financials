/**
 * SidebarSearch — persistent claims search inside the Financials sidebar.
 * Visible on every view (overview, claims list, claim detail). Type → up to
 * 8 matching claims float in a dropdown out to the right of the sidebar →
 * click → calls onSelect to switch the Dashboard's selectedClaimId in place.
 *
 * Filter mirrors ClaimsTable.tsx (same fields, same case-insensitive
 * substring) so behavior is consistent. Data comes from the existing
 * `claims` state already loaded by Dashboard — no extra fetches.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ClaimMaster } from '@/types';

interface SidebarSearchProps {
  claims: ClaimMaster[];
  collapsed: boolean;
  /** Expand the sidebar AND focus the input. Wired so clicking the
   *  collapsed-state Search icon makes the input usable on the next frame. */
  onExpand: () => void;
  /** Called with the selected ClaimMaster when the user clicks a result.
   *  Should mirror Dashboard's existing handleSelectClaim. */
  onSelect: (claim: ClaimMaster) => void;
}

const MAX_RESULTS = 8;

export function SidebarSearch({ claims, collapsed, onExpand, onSelect }: SidebarSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Click outside → close.
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const normalizedQuery = query.toLowerCase().trim();
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    const matches: ClaimMaster[] = [];
    for (const claim of claims) {
      const fields = [
        claim['Claim ID'],
        claim['First Name'],
        claim['Last Name'],
        claim.Address,
        claim.Carrier,
      ];
      if (fields.some((f) => (f ?? '').toString().toLowerCase().includes(normalizedQuery))) {
        matches.push(claim);
        if (matches.length >= MAX_RESULTS) break;
      }
    }
    return matches;
  }, [claims, normalizedQuery]);

  const handleSelect = (claim: ClaimMaster) => {
    setOpen(false);
    setQuery('');
    onSelect(claim);
  };

  // Collapsed: render a single search icon. Click expands the sidebar +
  // focuses the input on the next frame so the user can immediately type.
  if (collapsed) {
    return (
      <div className="px-3 pt-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-slate-300 hover:bg-[#1e293b] hover:text-white"
          aria-label="Search claims"
          onClick={() => {
            onExpand();
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative px-3 pt-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query) setOpen(true);
          }}
          placeholder="Search claims…"
          className="h-9 border-[#1e293b] bg-[#0f172a] pl-8 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-slate-400"
        />
      </div>

      {open && normalizedQuery ? (
        <div
          role="listbox"
          className={cn(
            'absolute left-full top-0 z-50 ml-2 w-80 max-h-[480px] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg',
          )}
        >
          {results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">No claims match "{query}".</div>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((claim) => {
                const claimId = claim['Claim ID'] || '—';
                const name = [claim['First Name'], claim['Last Name']]
                  .filter(Boolean)
                  .join(' ') || '—';
                const address = (claim.Address || '').toString().trim();
                return (
                  <li key={claim.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        // Prevent the input blur before our click handler runs.
                        event.preventDefault();
                      }}
                      onClick={() => handleSelect(claim)}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
                    >
                      <div className="flex w-full items-baseline justify-between gap-2">
                        <span className="font-medium text-foreground">{claimId}</span>
                        <span className="truncate text-xs text-muted-foreground">{name}</span>
                      </div>
                      {address ? (
                        <span className="truncate text-xs text-muted-foreground">{address}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
