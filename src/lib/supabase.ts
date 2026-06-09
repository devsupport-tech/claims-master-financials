/**
 * Supabase client — BROWSER-SIDE (Vite bundle).
 *
 * Uses VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY. Publishable key
 * is safe in client; RLS gates everything. Today the financials app proxies
 * through Express (server/), so this client is here for future use.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set — ' +
      'browser-side Supabase calls will fail. Server routes via /api are unaffected.',
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL ?? 'http://invalid',
  SUPABASE_PUBLISHABLE_KEY ?? 'invalid',
);

export type { Database } from '@/types/database.types';
