// =============================================================================
// components/feature-fields.tsx — "How you work" form fields
//
// · ChargingFields — in advance / in arrears, auto-invoicing
// · FeatureToggles — lesson reminders + a switch for each optional feature
// · FeatureFields  — both, as used on the Settings page
// Onboarding (/welcome) shows them on separate steps. Read back with
// lib/feature-form.ts (readChargingFields / readFeatureToggles).
// =============================================================================
import type { Teacher } from '@/lib/database.types'
import { BILLING_OPTIONS, BILLING_TEXT, FEATURES } from '@/lib/features'
import { Card, Segmented, Toggle } from '@/components/ui'

// ---- How you charge ---------------------------------------------------------------
export function ChargingFields({ teacher }: { teacher: Teacher }) {
  return (
    <div className="form">
      <Segmented
        label="Lessons are billed"
        name="billing_mode"
        options={BILLING_OPTIONS}
        defaultValue={teacher.billing_mode}
        hint={
          <>
            <strong>In advance:</strong> {BILLING_TEXT.advance}
            <br />
            <strong>In arrears:</strong> {BILLING_TEXT.arrears}
          </>
        }
      />
      <Toggle
        name="auto_invoice"
        label="Send invoices automatically"
        defaultChecked={teacher.auto_invoice}
        hint="On the 1st of each month, invoices are made and emailed for you, and a reminder goes out if one is still unpaid a week after it’s due. Leave off to get drafts you check and send yourself."
      />
    </div>
  )
}

// ---- Reminders + optional features -------------------------------------------------
export function FeatureToggles({ teacher, withReminders = true }: { teacher: Teacher; withReminders?: boolean }) {
  return (
    <div className="form">
      {/* Onboarding asks about reminders here; Settings has them under Communication */}
      {withReminders && (
        <Toggle
          name="reminders_enabled"
          label="Email lesson reminders"
          defaultChecked={teacher.reminders_enabled}
          hint="A reminder before each lesson — to parents for under-18s, and to adult pupils themselves."
        />
      )}
      <p className="small muted" style={{ margin: '4px 0 0' }}>
        Scheduling, students and invoicing are always on. Switch on anything else you’d like — you can change these any time in Settings → Features.
      </p>
      {FEATURES.map((f) => (
        <Toggle key={f.key} name={`feature_${f.key}`} label={f.label} defaultChecked={teacher.features.includes(f.key)} hint={f.description} />
      ))}
    </div>
  )
}

// ---- Both (Settings) ------------------------------------------------------------------
export function FeatureFields({ teacher }: { teacher: Teacher }) {
  return (
    <>
      <Card title="How you charge">
        <ChargingFields teacher={teacher} />
      </Card>
      <Card title="Reminders & features">
        <FeatureToggles teacher={teacher} />
      </Card>
    </>
  )
}
