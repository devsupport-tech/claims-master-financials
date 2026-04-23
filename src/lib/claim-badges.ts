/**
 * Stage + Status color maps for claim identity badges.
 *
 * Copied verbatim from the Claims Master (VEC) dashboard's
 * `utils/formatters.ts` so the Financials app renders the same colors as VEC
 * for the same Stage / Status values. The two apps are independent packages,
 * so this is an intentional duplicate — keep in sync when either side adds a
 * new stage or status.
 */

export function getStageColor(stage: string): string {
  const colors: Record<string, string> = {
    'Claim Filed': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    'Initial Inspection': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
    'Emergency Services': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    'Adjuster Meeting': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    'Waiting for Adjuster Report': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    'Mitigation': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    'Packout': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
    'Packin': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
    'Supplements Needed': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    'Supplements Approved': 'bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300',
    'Ready for Rebuild': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
    'Rebuild': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    'Completed': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    'Waiting on Depreciation': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    'Depreciation Received': 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  };
  return colors[stage] || 'bg-muted text-muted-foreground';
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    'Active': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    'On Hold': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    'Closed': 'bg-muted text-muted-foreground',
    'Pending': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    'Paid': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    'Invoiced': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    'Reimbursed': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    'Overdue': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    'Planned': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    'Completed': 'bg-muted text-muted-foreground',
  };
  return colors[status] || 'bg-muted text-muted-foreground';
}
