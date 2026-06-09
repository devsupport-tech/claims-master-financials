/**
 * Supabase client — SERVER-SIDE (Express sidecar).
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY. Bypasses RLS; never expose to browser.
 * Mirrors the AIRTABLE_PAT role: full read/write from Node, browser talks
 * to Express via /api/*.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.types';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL is not set. Add it to .env / Coolify env.');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is not set. Grab it from Supabase dashboard → ' +
      'Project Settings → API → service_role secret. NEVER expose to the browser.',
  );
}

export const supabaseAdmin: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

export type { Database } from '../../src/types/database.types';
