// =============================================================================
// auth.ts — Auth.js (NextAuth v5) configuration
//
// Two ways in, landing on the same account (matched by email):
//   · Email + password     — once someone has set a password in /account
//                            (lib/passwords.ts; Credentials provider)
//   · Emailed magic link   — always available; also the "forgot password" route
// (Sign in with Google / passkeys are parked for version 2.)
// Users, accounts and verification tokens live in Supabase's `next_auth`
// schema via the Supabase adapter. Sessions are JWTs (so the proxy can check
// sign-in without a database round trip) and last 90 days.
//
// AUTH_ALLOWED_EMAILS (optional, comma-separated) limits who can become a
// TEACHER — handy while the app is in private beta. Invited families can
// always sign in (see lib/access.ts). The same check runs for every method.
// =============================================================================
import NextAuth from 'next-auth'
import type { Provider } from 'next-auth/providers'
import Resend from 'next-auth/providers/resend'
import Credentials from 'next-auth/providers/credentials'
import { SupabaseAdapter } from '@auth/supabase-adapter'
import { magicLinkEmail } from '@/lib/email-templates'
import { canBeTeacher, hasFamilyAccess, isExistingTeacher } from '@/lib/access'
import { verifyLogin } from '@/lib/passwords'

const providers: Provider[] = [
  // ---- Magic link (always on) ----
  Resend({
    from: process.env.EMAIL_FROM,
    // Branded magic-link email instead of the Auth.js default
    async sendVerificationRequest({ identifier, url, provider }) {
      const { subject, html, text } = magicLinkEmail(url)
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: provider.from, to: identifier, subject, html, text }),
      })
      if (!res.ok) throw new Error('Resend error: ' + (await res.text()))
    },
  }),

  // ---- Email + password ----
  Credentials({
    credentials: { email: { type: 'email' }, password: { type: 'password' } },
    async authorize(credentials) {
      const email = String(credentials?.email ?? '').trim().toLowerCase()
      const password = String(credentials?.password ?? '')
      const user = await verifyLogin(email, password)
      return user ? { id: user.id, email: user.email, name: user.name } : null
    },
  }),
]

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: SupabaseAdapter({
    url: process.env.SUPABASE_URL!,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }),
  providers,
  session: { strategy: 'jwt', maxAge: 90 * 24 * 60 * 60 }, // 90 days
  pages: { signIn: '/login', verifyRequest: '/login/check-email', error: '/login' },
  callbacks: {
    // Teachers (subject to the allowlist), existing teachers, and invited families
    async signIn({ user }) {
      if (await canBeTeacher(user.email)) return true
      return (await isExistingTeacher(user.email)) || (await hasFamilyAccess(user.email))
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      return session
    },
  },
})
