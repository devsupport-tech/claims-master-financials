# Claims Master Financials — Update
---

## What's New

- **Claims Master Integration** — The app now connects to the Claims Master Airtable base. All claims are pulled directly from Claims Master, which serves as the single source of truth.
- **Claims Table** — A new "Claims" page in the sidebar shows all claims in a searchable, sortable table with Claim ID, Customer, Address, Carrier, Stage, Status, Loss Date, and RCV columns.
- **Two-Way Sync** — When financial records are saved in the Financials app, updated totals (RCV, ACV, Deductible, O&P, Depreciation, Total Payout, Total Outstanding) are automatically synced back to Claims Master.

## What Changed

- **Overview** now pulls all claim-level metrics (total claims, RCV, ACV, received, outstanding) from Claims Master instead of the Financials base.
- **Job Costing, Budget Variance, and Recently Updated** on the Overview are now filtered to only show data for claims that exist in Claims Master.
- **Claim creation and editing** has been removed from the Financials app. Claims are managed exclusively in Claims Master.
- **Add Entry, Add Report, Add Release, and Add Cost** buttons on claim detail pages are now fully functional.
