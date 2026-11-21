// =============================================================================
// lib/app-url.ts — absolute URL of this app, for links in emails
// =============================================================================
export function appUrl(path = ''): string {
  const base =
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3107')
  return base.replace(/\/$/, '') + path
}
