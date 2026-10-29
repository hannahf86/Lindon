// =============================================================================
// auth.ts — Auth.js (NextAuth v5) configuration
//
// Passwordless sign-in: the teacher types their email, Resend sends a magic
// link. Users, accounts and verification tokens live in Supabase's
// `next_auth` schema via the Supabase adapter. Sessions are JWTs so the proxy
// can check sign-in without a database round trip.
//
// AUTH_ALLOWED_EMAILS (optional, comma-separated) limits who can become a
// TEACHER — handy while the app is in private beta. Invited families can
// always sign in (see lib/access.ts).
// =============================================================================
import NextAuth from 'next-auth'
import Resend from 'next-auth/providers/resend'
import { SupabaseAdapter } from '@auth/supabase-adapter'
import { magicLinkEmail } from '@/lib/email-templates'
import { canBeTeacher, hasFamilyAccess, isExistingTeacher } from '@/lib/access'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: SupabaseAdapter({
    url: process.env.SUPABASE_URL!,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }),
  providers: [
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
  ],
  session: { strategy: 'jwt' },
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
