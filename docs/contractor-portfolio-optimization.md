# Contractor portfolio read optimization

## Scope

Only the contractor overview loader changes. The response shape, fee rules,
rounding, editable claim plans, settlement operations, and writes are unchanged.
The existing calculation adapter is moved verbatim into a shared server module.
The response interface is shared with the browser without importing Vite code.
No database migration or environment change is required.

## Request budget

The old loader made one initial claims read and up to eight reads per claim.
The new loader projects only needed columns, reads claims once, then reads five
child tables in batches of at most 100 claim UUIDs with at most five concurrent
requests. It does not read modules or template choices for an overview.

A 100-claim fixture uses six Supabase SELECT requests, compared with the old
code-path estimate of 801 for nonempty contractors. More pages and batches add
requests. These are request counts, not billing or latency measurements. The
first page includes an exact count so a lower server row cap cannot silently
truncate totals. Rows are ordered by UUID for deterministic pagination. Any
failed or incomplete page rejects the whole response rather than returning
partial totals.

## Verification

- 32 unit tests pass, including seven new request-budget and compatibility tests.
- Server typecheck, full build, changed-file ESLint, and diff check pass.
- Full-project lint still has the pre-existing 109 errors and one warning.
- Local production browser build verifies displayed totals, CSV export, claim
  navigation and a controlled read-error response using synthetic localhost data.
- The opt-in QA script binds to localhost and overrides the Supabase destination
  with its own read-only fixture. Never use production credentials with QA.

Run `PORTFOLIO_LOCAL_QA=1 npx tsx scripts/contractor-portfolio-controlled-qa.ts`
after building with `VITE_API_BASE_URL=/api`,
`VITE_SUPABASE_URL=http://127.0.0.1:3031` and a synthetic publishable key.
The UI is at `http://127.0.0.1:3032`.

## Release and rollback

Deploy Financials independently after PR checks pass. Capture the currently
deployed commit, compare contractor totals before and after, verify `/api/health`,
and smoke-test overview/claim navigation. If verification fails, redeploy the
prior commit. There is no schema rollback. Authentication remediation remains
separate work and is not addressed by this performance change.
