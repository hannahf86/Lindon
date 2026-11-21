// =============================================================================
// lib/feature-form.ts — read the "How you work" fields (components/feature-fields)
// into teacher columns. Settings reads both halves; onboarding reads each on
// its own step.
// =============================================================================
import 'server-only'
import { bool, oneOf } from './forms'
import { FEATURE_KEYS } from './features'

/** In advance / in arrears + auto-invoicing. */
export function readChargingFields(fd: FormData) {
  return {
    billing_mode: oneOf(fd, 'billing_mode', ['advance', 'arrears'] as const, 'advance'),
    auto_invoice: bool(fd, 'auto_invoice'),
  }
}

/** Lesson reminders on/off + the optional features switched on. */
export function readFeatureToggles(fd: FormData) {
  return {
    reminders_enabled: bool(fd, 'reminders_enabled'),
    features: FEATURE_KEYS.filter((k) => bool(fd, `feature_${k}`)),
  }
}

/** Everything (the Settings page). */
export function readFeatureFields(fd: FormData) {
  return { ...readChargingFields(fd), ...readFeatureToggles(fd) }
}
