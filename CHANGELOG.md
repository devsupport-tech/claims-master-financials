# Claims Master Financials — Changelog

## Latest (`5ac64f7`) — Login, Dark Mode, Collapsible Sidebar & UI Polish

- **Login gate** — Password-protected access via `VITE_DASHBOARD_PASSWORD` env var. Session persists in `sessionStorage`. If no password is set, login is bypassed.
- **Collapsible sidebar** — Toggle button shrinks the sidebar to icon-only (56px). Smooth CSS transition.
- **Dark mode** — Sun/Moon toggle in sidebar footer. Full dark theme CSS variables for all semantic colors.
- **DM Sans font** — Replaced system-ui stack with DM Sans from Google Fonts.
- **UI component refinements:**
  - Badges: rounded-full, semantic color tokens (`success`, `warning`, `info`)
  - Buttons: larger default sizes, `asChild` prop via Radix Slot, ring-offset focus styles
  - Cards: `rounded-lg` + `shadow-sm` (was `rounded-xl` + `shadow`), larger card titles
  - Inputs: taller (h-10), `bg-background`, ring-offset focus styles
  - Tables: more padding (`p-4`), taller headers (`h-12`)
- **Animations** — Smooth enter/exit transitions for claim content with `prefers-reduced-motion` support.

---

## Claims Master Integration (`35bf8b2`)

- **Single source of truth** — All claims now pulled from the Claims Master Airtable base instead of the Financials base.
- **Claims table** — New "Claims" view in sidebar with search, sort, and stage/status badge columns.
- **Two-way sync** — Saving financial records (ledger, reports, releases, costs) syncs updated totals (RCV, ACV, Deductible, O&P, etc.) back to Claims Master.
- **Bridge pattern** — `claims-master.ts` links claims across both Airtable bases.
- **Removed claim CRUD** — Claims are managed exclusively in Claims Master; ClaimForm removed.
- **Filtered data** — Overview metrics, job costing, budget variance, and recent activity are scoped to Claims Master claims only.

---

## Docker & Configuration (`4a236d3`, `9a664b3`, `d593068`)

- **Docker networking** — Switched from `ports` to `expose` so the hosting platform's reverse proxy handles routing (no host port conflicts).
- **Branding label** — `VITE_BRANDING_LABEL` env var appends a label after "Financials" in the sidebar (e.g. "Financials VEC").
- **Configurable external links** — `VITE_LINK_CLAIMS_MASTER` and `VITE_LINK_RESTORATION_OPS` env vars. Links only render when set.

---

## Dark Sidebar & Navigation (`a78419b`, `8c96c19`, `8759594`)

- **Dark sidebar** — Full-height `slate-900` sidebar with external link to Claims Master dashboard.
- **Portfolio overview on load** — App now lands on the overview instead of auto-selecting the first claim.
- **Back navigation** — Clicking the app title/logo returns to overview; "Overview" button appears in claim detail header.

---

## Portfolio Overview (`0994fcd`)

- **6 summary cards** — Total RCV, Total Received, Outstanding, Gross Profit, Job Costing Budget, Budget Variance across all claims.
- **Status badges** — Claim count breakdown by status.
- **Recently Updated** — 10 most recent records across all record types with type badges.
- **Auto-refresh** — Overview updates after any create/edit/delete operation.

---

## CRUD, Validation & Docker (`6f2a030`)

- **5 form components** — Claim, Ledger, Adjuster Report, Mortgage Release, Job Cost (create + edit modes).
- **Inline validation** — Required fields, currency format checks, error messages.
- **Delete with confirmation** — Confirmation dialog for all record types.
- **Edit/delete buttons** — Pencil/trash icons on all 4 financial tables.
- **UI primitives** — Dialog, Label, Textarea, Checkbox, ConfirmDialog.
- **Airtable setup script** — Auto-creates tables and seeds data.
- **Docker** — Multi-stage build (Node + nginx), `docker-compose.yaml`, SPA routing, static asset caching.

---

## Initial Release (`04e9fb4`)

Standalone financial management dashboard for insurance claims:

- Financial Summary (RCV, ACV, payments received, outstanding)
- Financial Ledger (inflows/outflows)
- Adjuster Reports (version history, supplement changes)
- Mortgage Release tracker (inspection status)
- Job Costing (Xactimate budget vs actual)

**Stack:** Vite + React + TypeScript, Tailwind CSS v4, Radix UI, Airtable backend.
