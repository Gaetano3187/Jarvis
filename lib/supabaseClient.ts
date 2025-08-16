// lib/supabaseClient.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
// import type { Database } from '../types/supabase'; // se hai i tipi generati

// 1) Leggi, TRIM e pulisci lo slash finale dell'URL
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

const supabaseUrl = rawUrl.trim().replace(/\/+$/, '');
const supabaseAnonKey = rawKey.trim(); // <-- elimina anche il \n che diventa %0A

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase env vars missing: definisci URL e ANON_KEY in NEXT_PUBLIC_* oppure SUPABASE_*');
}

// Tipizza se hai i tipi generati: createClient<Database>
type DB = unknown; // sostituisci con "Database" se hai i tipi
const globalForSupabase = globalThis as unknown as { supabase?: SupabaseClient<DB> };

export const supabase =
  globalForSupabase.supabase ??
  createClient<DB>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: 'jarvis-auth',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    // opzionale ma utile: limita traffico eventi realtime
    realtime: { params: { eventsPerSecond: 2 } },
    // db: { schema: 'public' }, // se ti serve specificarlo
  });

if (!globalForSupabase.supabase) {
  globalForSupabase.supabase = supabase;
}
