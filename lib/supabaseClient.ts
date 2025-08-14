// lib/supabaseClient.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
// import type { Database } from '../types/supabase'; // se hai i tipi generati

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase env vars missing: definisci URL e ANON_KEY in NEXT_PUBLIC_* oppure SUPABASE_*'
  );
}

// Tipizza con Database se hai i tipi generati: createClient<Database>
const globalForSupabase = globalThis as unknown as {
  supabase?: SupabaseClient; // <Database> se hai i tipi
};

export const supabase =
  globalForSupabase.supabase ??
  createClient<unknown>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: 'jarvis-auth', // evita collisioni se usi più client
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

if (!globalForSupabase.supabase) {
  globalForSupabase.supabase = supabase;
}
