// =============================================================================
// lib/policies.ts — the public policy pages (app/policies/*), for links in
// Settings, the sign-in page, the family area and the family welcome page.
// =============================================================================
export const POLICIES = [
  { href: '/policies/privacy', label: 'Privacy & data protection', blurb: 'What Lindon holds, who can see it, how long it’s kept, cookies, and your rights under UK GDPR.' },
  { href: '/policies/safeguarding', label: 'Child protection & safeguarding', blurb: 'How Lindon protects children, the rules for teachers, and where to report a concern.' },
  { href: '/policies/terms', label: 'Terms of use', blurb: 'The ground rules for using Lindon, for teachers and families.' },
] as const
