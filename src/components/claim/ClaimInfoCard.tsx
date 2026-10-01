import type { ReactNode } from 'react';

export interface ClaimInfoCardClaim {
  'First Name'?: string;
  'Last Name'?: string;
  Address?: string;
  Carrier?: string;
  'Carrier Claim #'?: string;
  'Loss Type'?: string;
  'Loss Date'?: string;
  'Damage Category'?: string;
  'Damage Class'?: string;
  'Adjuster Name'?: string;
  'Adjuster Email'?: string;
  'Customer Email'?: string;
  'Customer Phone'?: string;
  'Alternative Contact Name'?: string;
  'Alternative Contact Relationship'?: string;
  'Alternative Contact Phone'?: string;
  'Alternative Contact Email'?: string;
  'Referral Type'?: string;
  'Referral Name'?: string;
  'Referral Phone'?: string;
  'Referral Email'?: string;
  'Referral Notes'?: string;
  Contractor?: string;
  Assignee?: string;
}

export interface ClaimInfoCardProps {
  claim: ClaimInfoCardClaim;
  /** Slot rendered next to the customer name. Claims Master uses it for the
   *  "Edit Claim Info" button. Other apps pass nothing. */
  rightAction?: ReactNode;
  /** Optional right sidebar. Claims Master shows Active Services and Pending
   *  Payments here. Other apps pass nothing and the layout
   *  collapses to a single column. */
  sidebar?: ReactNode;
  contractorLabel?: 'Contractor' | 'Referred By';
}

function formatDate(value?: string): string {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysBetween(value?: string): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

const FIELD_BASE = 'py-1';

function Cell({
  label,
  highlight,
  children,
}: {
  label: string;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        highlight
          ? `${FIELD_BASE} border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30`
          : FIELD_BASE
      }
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/**
 * Shared customer details card. Mirrors the read-only display the Claims
 * Master dashboard renders below its header so all three apps look identical.
 * Claims Master is the design + data truth.
 */
export default function ClaimInfoCard({ claim, rightAction, sidebar, contractorLabel = 'Contractor' }: ClaimInfoCardProps) {
  const customerName =
    [claim['First Name'], claim['Last Name']].filter((s) => s && s.trim()).join(' ') || 'N/A';
  const lossDays = daysBetween(claim['Loss Date']);
  const referralType = (claim['Referral Type'] ?? '').trim();

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-muted/50 px-5 py-4 text-sm shadow-lg shadow-foreground/5 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Customer</p>
          <p className="text-2xl font-bold text-foreground">{customerName}</p>
        </div>
        {rightAction}
      </div>

      <div
        className={
          sidebar
            ? 'grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start'
            : ''
        }
      >
        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Contact</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <Cell label="Customer Contact"><div className="space-y-1">{claim['Customer Email'] ? <a href={`mailto:${claim['Customer Email']}`} className="block text-sm text-primary hover:underline">{claim['Customer Email']}</a> : <p className="text-sm text-muted-foreground">No email</p>}{claim['Customer Phone'] ? <a href={`tel:${claim['Customer Phone']}`} className="block text-sm text-primary hover:underline">{claim['Customer Phone']}</a> : <p className="text-sm text-muted-foreground">No phone</p>}</div></Cell>
              <Cell label="Alternative Contact">{claim['Alternative Contact Name'] ? <div className="space-y-1"><p className="font-medium text-foreground">{claim['Alternative Contact Name']}</p>{claim['Alternative Contact Relationship'] && <p className="text-xs text-muted-foreground">{claim['Alternative Contact Relationship']}</p>}{claim['Alternative Contact Phone'] && <a href={`tel:${claim['Alternative Contact Phone']}`} className="block text-sm text-primary hover:underline">{claim['Alternative Contact Phone']}</a>}{claim['Alternative Contact Email'] && <a href={`mailto:${claim['Alternative Contact Email']}`} className="block text-sm text-primary hover:underline">{claim['Alternative Contact Email']}</a>}</div> : <p className="text-sm text-muted-foreground">No alternative contact</p>}</Cell>
            </div>
          </section>

          <section className="space-y-2 border-t border-border/70 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Property / Handler</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <Cell label="Address"><p className="font-medium whitespace-pre-line text-foreground">{claim.Address?.trim() || 'N/A'}</p></Cell>
              <Cell label={contractorLabel}><p className="font-medium text-foreground">{claim.Contractor?.trim() || 'N/A'}</p></Cell>
              <Cell label="Claim Handler"><p className="font-medium text-foreground">{claim.Assignee?.trim() || 'Unassigned'}</p></Cell>
            </div>
          </section>

          <section className="space-y-2 border-t border-border/70 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Carrier / Adjuster</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <Cell label="Carrier"><p className="font-medium text-foreground">{claim.Carrier?.trim() || 'N/A'}</p>{claim['Carrier Claim #'] && <p className="text-sm text-primary">Carrier Claim #: {claim['Carrier Claim #']}</p>}</Cell>
              <Cell label="Primary Adjuster"><div className="space-y-1"><p className="font-medium text-foreground">{claim['Adjuster Name']?.trim() || 'N/A'}</p>{claim['Adjuster Email'] ? <a href={`mailto:${claim['Adjuster Email']}`} className="text-sm text-primary hover:underline">{claim['Adjuster Email']}</a> : <p className="text-sm text-muted-foreground">No email</p>}</div></Cell>
            </div>
          </section>

          <section className="space-y-2 border-t border-border/70 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Loss</h3>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Cell label="Loss Type"><p className="font-medium text-foreground">{claim['Loss Type']?.trim() || 'N/A'}</p></Cell>
              <Cell label="Category of Damage"><p className="font-medium text-foreground">{claim['Damage Category'] || 'Not applicable'}</p></Cell>
              <Cell label="Loss Date"><p className="font-medium text-foreground">{formatDate(claim['Loss Date'])}</p>{lossDays !== null && <p className="text-xs text-muted-foreground">{lossDays} days ago</p>}</Cell>
              <Cell label="Class"><p className="font-medium text-foreground">{claim['Damage Class'] || 'Not applicable'}</p></Cell>
            </div>
          </section>

          {referralType && <Cell label="Referral" highlight><div className="space-y-1"><p className="font-medium text-foreground">{referralType.split(',').map((value) => value.trim()).filter(Boolean).join(', ')}</p>{claim['Referral Name'] && <p className="text-sm text-foreground">{claim['Referral Name']}</p>}{claim['Referral Phone'] && <a href={`tel:${claim['Referral Phone']}`} className="block text-sm text-primary hover:underline">{claim['Referral Phone']}</a>}{claim['Referral Email'] && <a href={`mailto:${claim['Referral Email']}`} className="block text-sm text-primary hover:underline">{claim['Referral Email']}</a>}{claim['Referral Notes'] && <p className="text-xs text-muted-foreground">{claim['Referral Notes']}</p>}</div></Cell>}
        </div>

        {sidebar}
      </div>
    </div>
  );
}
