// /lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ♻️ Singleton anche in dev/HMR
export const supabase =
  globalThis.__supabase__ ||
  createClient(url, key, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });

if (!globalThis.__supabase__) globalThis.__supabase__ = supabase;
