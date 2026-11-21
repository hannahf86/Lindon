// =============================================================================
// components/feature-fields.tsx — "How you work" form fields
//
// How the teacher charges (in advance / in arrears), auto-invoicing, lesson
// reminders and a switch for each optional feature. Shared by onboarding
// (/welcome) and Settings; both forms read it back with readFeatureFields()
// in lib/feature-form.ts.
// =============================================================================
import type { Teacher } from '@/lib/database.types'
import { BILLING_OPTIONS, BILLING_TEXT, FEATURES } from '@/lib/features'
import { Card, Segmented, Toggle } from '@/components/ui'

export function FeatureFields({ teacher }: { teacher: Teacher }) {
  return (
    <>
      {/* ---- Charging ---- */}
      <Card title="How you charge">
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
            hint="On the 1st of each month, invoices are made and emailed for you. Leave off to get drafts you check and send yourself."
          />
          <Toggle
            name="reminders_enabled"
            label="Email lesson reminders"
            defaultChecked={teacher.reminders_enabled}
            hint="A reminder before each lesson — to parents for under-18s, and to adult pupils themselves."
          />
        </div>
      </Card>

      {/* ---- Optional features ---- */}
      <Card title="Features">
        <p className="small muted" style={{ marginTop: 0 }}>
          Scheduling, students and invoicing are always on. Switch on anything else you’d like — you can change these any time in Settings.
        </p>
        <div className="form">
          {FEATURES.map((f) => (
            <Toggle key={f.key} name={`feature_${f.key}`} label={f.label} defaultChecked={teacher.features.includes(f.key)} hint={f.description} />
          ))}
        </div>
      </Card>
    </>
  )
}
