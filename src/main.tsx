import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Single Supabase database — no per-base bootstrap to run. The supabase
// client is initialized lazily by src/lib/supabase.ts on first import.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
