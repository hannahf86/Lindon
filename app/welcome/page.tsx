// =============================================================================
// app/welcome/page.tsx — onboarding for a new teacher, one step at a time
//
// /welcome?step=1…6
//   1 You & your studio  — name, studio, reply email, phone, and a password
//   2 Charging & payment — in advance / in arrears, auto-invoicing, payment
//                          terms and how families pay you
//   3 Reminders & features
//   4 Your timetable     — weekly slots you teach (skippable)
//   5 Your students      — first pupils, with a parent for children (skippable)
//   6 All set            — what's next; "Go to your dashboard" finishes
// Shown until finished (teachers.onboarded_at); everything here can be changed
// later in Settings, Schedule and Students. Outside the (app) group, so no
// sidebar yet. Each step is prefilled, so coming back part-way is painless.
// =============================================================================
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db, must, requireTeacher } from '@/lib/db'
import { hasPassword, MIN_PASSWORD_LENGTH } from '@/lib/passwords'
import { currencySymbol, DAY_SHORT, dayName, duration, fullName, hhmm, money } from '@/lib/format'
import { lengthOptions } from '@/lib/lessons'
import type { Teacher } from '@/lib/database.types'
import { LogoMark } from '@/components/logo'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Card, MoneyField, Segmented, SelectField, SlidePill, TextArea, TextField } from '@/components/ui'
import { ChargingFields, FeatureToggles } from '@/components/feature-fields'
import { addSlot, addStudent, finishOnboarding, removeSlot, saveCharging, saveDetails, saveFeatures } from './actions'

export const metadata: Metadata = { title: 'Welcome' }

const STEPS = ['You & your studio', 'Charging & payment', 'Reminders & features', 'Your timetable', 'Your students', 'All set'] as const

export default async function WelcomePage({ searchParams }: PageProps<'/welcome'>) {
  const teacher = await requireTeacher()
  if (teacher.onboarded_at) redirect('/settings')
  const sp = await searchParams
  const raw = Number(typeof sp.step === 'string' ? sp.step : 1)
  const step = Number.isInteger(raw) && raw >= 1 && raw <= STEPS.length ? raw : 1

  return (
    <div className="welcome">
      {/* ---- Brand bar ---- */}
      <header className="welcome-bar">
        <LogoMark size={36} />
        <span>Lindon</span>
      </header>

      <main className="welcome-main">
        {/* ---- Progress ---- */}
        <ol className="onboard-steps" aria-label="Setup steps">
          {STEPS.map((label, i) => {
            const n = i + 1
            const state = n < step ? 'done' : n === step ? 'current' : 'todo'
            return (
              <li key={label} className={state} aria-current={state === 'current' ? 'step' : undefined}>
                {n < step ? (
                  <Link href={`/welcome?step=${n}`}>
                    <span className="dot">✓</span>
                    <span className="lbl">{label}</span>
                  </Link>
                ) : (
                  <span>
                    <span className="dot">{n}</span>
                    <span className="lbl">{label}</span>
                  </span>
                )}
              </li>
            )
          })}
        </ol>

        {step === 1 && <StepDetails teacher={teacher} passwordSet={await hasPassword(teacher.id)} />}
        {step === 2 && <StepCharging teacher={teacher} />}
        {step === 3 && <StepFeatures teacher={teacher} />}
        {step === 4 && <StepTimetable teacher={teacher} />}
        {step === 5 && <StepStudents teacher={teacher} />}
        {step === 6 && <StepDone teacher={teacher} />}
      </main>
    </div>
  )
}

// ---- Shared bits --------------------------------------------------------------------------
function StepHead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header style={{ marginBottom: 16 }}>
      <h1 style={{ marginBottom: 6 }}>{title}</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: '1.05rem' }}>
        {children}
      </p>
    </header>
  )
}

function StepNav({ back, children }: { back?: number; children: ReactNode }) {
  return (
    <div className="form-actions onboard-nav">
      {back && (
        <Link href={`/welcome?step=${back}`} className="btn btn-ghost">
          ← Back
        </Link>
      )}
      {children}
    </div>
  )
}

// ---- 1. You & your studio ----------------------------------------------------------------------
function StepDetails({ teacher, passwordSet }: { teacher: Teacher; passwordSet: boolean }) {
  const firstName = teacher.display_name.split(' ')[0]
  return (
    <>
      <StepHead title={`Welcome${firstName ? `, ${firstName}` : ''}!`}>
        Let’s set Lindon up the way you teach. It takes a few minutes, and you can change any of it later.
      </StepHead>
      <ActionForm action={saveDetails}>
        <Card title="Your studio">
          <div className="form-grid">
            <TextField label="Your name" name="display_name" defaultValue={teacher.display_name} required hint="Used to sign your emails." />
            <TextField label="Studio / business name" name="business_name" defaultValue={teacher.business_name} hint="Shown on emails and invoices." />
            <TextField label="Email for replies" name="email" type="email" defaultValue={teacher.email} hint="When families reply, it comes here." />
            <TextField label="Phone" name="phone" type="tel" defaultValue={teacher.phone} hint="Optional — shown to families so they can reach you." />
          </div>
        </Card>
        <Card title={passwordSet ? 'Your password' : 'Choose a password'}>
          <p className="small muted" style={{ marginTop: 0 }}>
            {passwordSet
              ? 'You already have a password. Leave these empty to keep it, or type a new one to change it.'
              : 'Next time, sign in with your email and this password — no emailed link needed.'}
          </p>
          <div className="form-grid">
            <TextField
              label={passwordSet ? 'New password (optional)' : 'Password'}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required={!passwordSet}
              hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            />
            <TextField label="Type it again" name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required={!passwordSet} />
          </div>
        </Card>
        <StepNav>
          <SubmitButton pendingText="Saving…">Next: charging &amp; payment →</SubmitButton>
        </StepNav>
      </ActionForm>
    </>
  )
}

// ---- 2. Charging & payment -------------------------------------------------------------------------
function StepCharging({ teacher }: { teacher: Teacher }) {
  return (
    <>
      <StepHead title="Charging & payment">How you bill families, and how they pay you. This is printed on every invoice.</StepHead>
      <ActionForm action={saveCharging}>
        <Card title="How you charge">
          <ChargingFields teacher={teacher} />
        </Card>
        <Card title="Getting paid">
          <div className="form-grid">
            <TextField
              label="Payment terms (days)"
              name="invoice_terms_days"
              type="number"
              min={0}
              max={365}
              defaultValue={teacher.invoice_terms_days}
              hint="How long families have to pay. 0 = due on the day."
            />
            <TextArea
              label="How to pay you"
              name="payment_details"
              defaultValue={teacher.payment_details}
              wrapClass="full"
              placeholder={'e.g. Bank transfer to\nJ Smith, sort code 00-00-00, account 12345678\nPlease use the invoice number as the reference.'}
              hint="Your bank details for transfers. Printed on every invoice."
            />
          </div>
        </Card>
        <StepNav back={1}>
          <SubmitButton pendingText="Saving…">Next: reminders &amp; features →</SubmitButton>
        </StepNav>
      </ActionForm>
    </>
  )
}

// ---- 3. Reminders & features ---------------------------------------------------------------------------
function StepFeatures({ teacher }: { teacher: Teacher }) {
  return (
    <>
      <StepHead title="Reminders & features">Switch on just what you need. Everything else stays out of your way.</StepHead>
      <ActionForm action={saveFeatures}>
        <Card>
          <FeatureToggles teacher={teacher} />
        </Card>
        <StepNav back={2}>
          <SubmitButton pendingText="Saving…">Next: your timetable →</SubmitButton>
        </StepNav>
      </ActionForm>
    </>
  )
}

// ---- 4. Timetable ------------------------------------------------------------------------------------------
async function StepTimetable({ teacher }: { teacher: Teacher }) {
  const slots = must(
    await db().from('time_slots').select('id, day_of_week, start_time, duration_minutes, price, label, student_id').eq('teacher_id', teacher.id).order('day_of_week').order('start_time'),
  )
  return (
    <>
      <StepHead title="Your timetable">
        Add the weekly slots you teach — for example Tuesday 4:30pm, 30 minutes. You’ll book pupils into them afterwards from Schedule.
      </StepHead>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card title="Add a slot">
          <ActionForm action={addSlot}>
            <Segmented label="Day" name="day_of_week" options={DAY_SHORT.map((d, i) => ({ value: String(i + 1), label: d }))} defaultValue="1" />
            <div className="form-grid">
              <TextField label="Start time" name="start_time" placeholder="e.g. 16:30 or 4:30pm" required autoComplete="off" />
              <SelectField label="Lesson length" name="duration_minutes" options={lengthOptions()} defaultValue="30" />
              <MoneyField label="Price per lesson" name="price" symbol={currencySymbol(teacher.currency)} placeholder="0.00" />
              <TextField label="Label" name="label" placeholder="e.g. After school" hint="Optional" />
            </div>
            <SubmitButton className="btn btn-secondary" pendingText="Adding…">
              Add slot
            </SubmitButton>
          </ActionForm>
        </Card>
        <Card title={`Your slots (${slots.length})`}>
          {slots.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <ul className="list">
              {slots.map((s) => (
                <li key={s.id} className="spread">
                  <span>
                    <strong>
                      {dayName(s.day_of_week, true)} {hhmm(s.start_time)}
                    </strong>
                    <span className="small muted">
                      {' '}
                      · {duration(s.duration_minutes)} · {money(s.price, teacher.currency)}
                      {s.label && ` · ${s.label}`}
                    </span>
                  </span>
                  {!s.student_id && (
                    <ConfirmButton action={removeSlot.bind(null, s.id)} confirm="Remove this slot?" className="link-btn">
                      Remove
                    </ConfirmButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <StepNav back={3}>
        <Link href="/welcome?step=5" className="btn">
          {slots.length ? 'Next: your students →' : 'Skip for now →'}
        </Link>
      </StepNav>
    </>
  )
}

// ---- 5. Students ---------------------------------------------------------------------------------------------
async function StepStudents({ teacher }: { teacher: Teacher }) {
  const students = must(
    await db()
      .from('students')
      .select('id, first_name, last_name, is_minor, instruments, student_guardians(guardians(first_name, last_name))')
      .eq('teacher_id', teacher.id)
      .order('created_at'),
  )
  return (
    <>
      <StepHead title="Your students">
        Add a few pupils to get going — you can add the rest, and more details, from Students later. Children are contacted through a parent or guardian.
      </StepHead>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card title="Add a student">
          <ActionForm action={addStudent} resetOnSuccess>
            <div className="form-grid">
              <TextField label="First name" name="first_name" required />
              <TextField label="Last name" name="last_name" />
            </div>
            <SlidePill
              label="Pupil type"
              name="age_group"
              options={[
                { value: 'minor', label: 'Child' },
                { value: 'adult', label: 'Adult' },
              ]}
              defaultValue="minor"
            />
            <TextField label="Instrument(s)" name="instruments" placeholder="e.g. Piano, Violin" hint="Separate with commas." />
            {/* Child: their parent (shown while "Child" is picked — CSS .child-only) */}
            <div className="form-grid child-only">
              <TextField label="Parent’s first name" name="parent_first_name" />
              <TextField label="Parent’s last name" name="parent_last_name" />
              <TextField label="Parent’s email" name="parent_email" type="email" wrapClass="full" hint="Reminders and invoices go here." />
            </div>
            {/* Adult: their own email (CSS .adult-only) */}
            <div className="adult-only">
              <TextField label="Email" name="email" type="email" hint="Reminders and invoices go here." />
            </div>
            <SubmitButton className="btn btn-secondary" pendingText="Adding…">
              Add student
            </SubmitButton>
          </ActionForm>
        </Card>
        <Card title={`Your students (${students.length})`}>
          {students.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <ul className="list">
              {students.map((s) => {
                const parent = s.student_guardians[0]?.guardians
                return (
                  <li key={s.id}>
                    <strong>{fullName(s)}</strong>
                    <div className="small muted">
                      {[s.is_minor ? 'Child' : 'Adult', s.instruments.join(', '), parent ? `parent: ${fullName(parent)}` : ''].filter(Boolean).join(' · ')}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
      <StepNav back={4}>
        <Link href="/welcome?step=6" className="btn">
          {students.length ? 'Next →' : 'Skip for now →'}
        </Link>
      </StepNav>
    </>
  )
}

// ---- 6. All set ------------------------------------------------------------------------------------------------
async function StepDone({ teacher }: { teacher: Teacher }) {
  const [{ count: slotCount }, { count: studentCount }] = await Promise.all([
    db().from('time_slots').select('id', { count: 'exact', head: true }).eq('teacher_id', teacher.id),
    db().from('students').select('id', { count: 'exact', head: true }).eq('teacher_id', teacher.id),
  ])
  return (
    <>
      <StepHead title="You’re all set!">Here’s what happens next.</StepHead>
      <Card>
        <ul className="list">
          <li>
            <strong>Book pupils into your slots</strong>
            <div className="small muted">
              {slotCount ? `You have ${slotCount} slot${slotCount === 1 ? '' : 's'}.` : 'Add your slots first.'} In Schedule → Time slots, pick a slot, choose
              the pupil and how many weeks — their lessons appear on your calendar.
            </div>
          </li>
          <li>
            <strong>Invoices on the 1st</strong>
            <div className="small muted">
              {teacher.auto_invoice
                ? 'On the 1st of each month, invoices are made and emailed to families automatically.'
                : 'On the 1st of each month, invoices are drafted for you to check and send from Invoices.'}{' '}
              {teacher.billing_mode === 'arrears' ? 'They cover last month’s lessons.' : 'They cover the month ahead.'}
            </div>
          </li>
          <li>
            <strong>Signing in</strong>
            <div className="small muted">Use your email and password. Forgotten it? The sign-in page can email you a link.</div>
          </li>
          {!studentCount && (
            <li>
              <strong>Add your students</strong>
              <div className="small muted">From Students → Add a student, whenever you’re ready.</div>
            </li>
          )}
        </ul>
      </Card>
      <StepNav back={5}>
        <ActionForm action={finishOnboarding} className="row">
          <SubmitButton pendingText="Opening…">Go to your dashboard →</SubmitButton>
        </ActionForm>
      </StepNav>
    </>
  )
}
