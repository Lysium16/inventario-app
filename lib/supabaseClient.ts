import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let _client: SupabaseClient | null = null;

function missingEnvError(): Error {
  return new Error(
    'Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (local .env.local + Vercel Project Settings).'
  );
}

/**
 * Safe accessor: does NOT throw at import-time.
 * Throws only when you try to actually use the client.
 */
export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw missingEnvError();
  }
  _client = createClient(supabaseUrl, supabaseAnonKey);
  return _client;
}

/**
 * Back-compat export for existing pages that import { supabase }.
 * This is a Proxy that throws a clear error when used without env.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabase();
    // @ts-expect-error dynamic proxy forward
    return client[prop];
  },
});