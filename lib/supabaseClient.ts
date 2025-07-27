// lib/supabaseClient.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
// Se hai generato i tipi con `supabase gen types`, importa quelli al posto di `any`
// import type { Database } from '../types/supabase';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase env vars missing: definisci URL e ANON_KEY ' +
      'in NEXT_PUBLIC_* oppure SUPABASE_*'
  );
}

// Se hai i tipi generati, sostituisci `any` con `Database`
export const supabase = createClient<unknown>(supabaseUrl, supabaseAnonKey);
