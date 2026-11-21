// =============================================================================
// lib/feature-form.ts — read the "How you work" fields (components/feature-fields)
// into teacher columns. Shared by onboarding and Settings.
// =============================================================================
import 'server-only'
import { bool, oneOf } from './forms'
import { FEATURE_KEYS } from './features'

export function readFeatureFields(fd: FormData) {
  return {
    billing_mode: oneOf(fd, 'billing_mode', ['advance', 'arrears'] as const, 'advance'),
    auto_invoice: bool(fd, 'auto_invoice'),
    reminders_enabled: bool(fd, 'reminders_enabled'),
    features: FEATURE_KEYS.filter((k) => bool(fd, `feature_${k}`)),
  }
}
