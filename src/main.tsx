import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { bootstrapBases } from './lib/airtable'

// Resolve the three sibling base IDs (CLAIMS_MASTER / FINANCIALS / REST_OPS)
// from the sidecar before mounting React. Anything that touches Airtable
// depends on this map.
bootstrapBases()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('Failed to bootstrap base IDs from /api/bases:', e);
  })
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
