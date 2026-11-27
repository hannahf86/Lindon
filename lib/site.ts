// =============================================================================
// lib/site.ts — Lindon's public address and contact email, in one place
//
// CONTACT_EMAIL   shown on the policy pages and where Contact-page messages
//                 go (they fall back to the admin addresses if it isn't set).
//                 Set in Vercel once the lindonmusic.co.uk mailbox works.
// CANONICAL_HOST  the main web address, e.g. lindonmusic.co.uk. When set,
//                 visitors to any other address (lindon-ten.vercel.app) are
//                 sent there by proxy.ts. Unset = no redirect.
// =============================================================================
// Until CONTACT_EMAIL is set the policy pages keep the old address, so pushing
// this before the new mailbox works changes nothing.
export const PUBLIC_CONTACT_EMAIL = process.env.CONTACT_EMAIL?.trim() || 'lindon@jorvikweb.dev'

/** Where Contact-page messages go: CONTACT_EMAIL if set, otherwise null (→ the admins). */
export function contactInbox(): string | null {
  return process.env.CONTACT_EMAIL?.trim() || null
}

// Only on the live site — test (preview) deploys are never redirected
export const CANONICAL_HOST = process.env.VERCEL_ENV === 'production' ? (process.env.CANONICAL_HOST ?? '').trim().toLowerCase() : ''
