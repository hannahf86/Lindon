// =============================================================================
// lib/admin.ts — the service-role Supabase client
//
// Bypasses RLS, so it must never reach the browser (`server-only` makes the
// build fail if a client component imports it). Kept separate from lib/db.ts
// so auth.ts can use it without an import cycle.
// =============================================================================
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export type Db = SupabaseClient<Database>

let client: Db | null = null

/** Service-role Supabase client (singleton per server instance). */
export function db(): Db {
  if (!client) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
    client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}
