// =============================================================================
// lib/passwords.ts — optional passwords (email + password sign-in)
//
// · hashPassword() / checkPassword() — salted scrypt (Node's built-in crypto),
//   stored as "scrypt$<salt>$<hash>"; compared in constant time
// · verifyLogin()  — used by the Credentials provider in auth.ts: finds the
//   Auth.js user by email, checks the password, and pauses password sign-in
//   for 15 minutes after 10 wrong tries
// · setPassword() / hasPassword() — the /account page
//
// The Auth.js users live in the `next_auth` schema, so this file uses its own
// service-role client pointed at that schema for user lookups.
// =============================================================================
import 'server-only'
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { db } from './admin'

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>
const KEY_LEN = 64
const MAX_TRIES = 10
const LOCK_MINUTES = 15
export const MIN_PASSWORD_LENGTH = 10

// ---- Hashing ----------------------------------------------------------------------------
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, KEY_LEN)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// ---- Auth.js users (next_auth schema) ------------------------------------------------------
// Untyped on purpose: database.types.ts only describes the public schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let authClient: SupabaseClient<any, 'next_auth', 'next_auth'> | null = null
function authUsers() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authClient ??= createClient<any, 'next_auth', 'next_auth'>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'next_auth' },
  })
  return authClient.from('users')
}

type AuthUser = { id: string; email: string; name: string | null }

async function userByEmail(email: string): Promise<AuthUser | null> {
  const { data } = await authUsers().select('id, email, name').ilike('email', email.trim()).maybeSingle()
  return (data as AuthUser | null) ?? null
}

// ---- Sign in with a password ---------------------------------------------------------------
/** The user if the email + password are right; null otherwise (including while paused). */
export async function verifyLogin(email: string, password: string): Promise<AuthUser | null> {
  if (!email || !password) return null
  const user = await userByEmail(email)
  if (!user) return null
  const { data: row } = await db().from('user_passwords').select('*').eq('user_id', user.id).maybeSingle()
  if (!row) return null
  if (row.locked_until && new Date(row.locked_until) > new Date()) return null

  if (await checkPassword(password, row.hash)) {
    if (row.failed_attempts) await db().from('user_passwords').update({ failed_attempts: 0, locked_until: null }).eq('user_id', user.id)
    return user
  }
  const tries = row.failed_attempts + 1
  await db()
    .from('user_passwords')
    .update(
      tries >= MAX_TRIES
        ? { failed_attempts: 0, locked_until: new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() }
        : { failed_attempts: tries },
    )
    .eq('user_id', user.id)
  return null
}

// ---- Set / check (the /account page) --------------------------------------------------------
export async function hasPassword(userId: string): Promise<boolean> {
  const { data } = await db().from('user_passwords').select('user_id').eq('user_id', userId).maybeSingle()
  return !!data
}

export async function setPassword(userId: string, password: string): Promise<void> {
  const { error } = await db()
    .from('user_passwords')
    .upsert({ user_id: userId, hash: await hashPassword(password), failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

export async function removePassword(userId: string): Promise<void> {
  const { error } = await db().from('user_passwords').delete().eq('user_id', userId)
  if (error) throw new Error(error.message)
}
