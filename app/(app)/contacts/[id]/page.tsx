// =============================================================================
// contacts/[id]/page.tsx — one parent / guardian: edit their details, see
// and manage which students they're linked to, their family login (invite
// to Lindon), message them, or delete them.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, requireTeacher } from '@/lib/db'
import { fullName, isMinor } from '@/lib/format'
import { studentOptions } from '@/lib/queries'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Picker } from '@/components/pickers'
import { Badge, Card, PageHeader, StatusBadge, TextField, Toggle } from '@/components/ui'
import { GuardianForm } from '../guardian-form'
import { FamilyAccessCard } from '../family-access-card'
import { deleteGuardian, linkStudents, unlinkStudent, updateGuardian } from '../actions'

export const metadata: Metadata = { title: 'Contact' }

export default async function ContactPage({ params }: PageProps<'/contacts/[id]'>) {
  const { id } = await params
  const teacher = await requireTeacher()

  const [{ data: g }, allStudents] = await Promise.all([
    db()
      .from('guardians')
      .select('*, student_guardians(relationship, is_primary, receives_emails, students(id, first_name, last_name, status, date_of_birth, is_minor))')
      .eq('id', id)
      .eq('teacher_id', teacher.id)
      .maybeSingle(),
    studentOptions(teacher.id),
  ])
  if (!g) notFound()

  const links = g.student_guardians.filter((l) => l.students)
  const linkedIds = new Set(links.map((l) => l.students?.id))
  const unlinked = allStudents.filter((s) => !linkedIds.has(s.id))
  // Strip the embedded links so the form gets a plain Guardian row
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { student_guardians: _links, ...guardian } = g
  // A family login shows a parent their under-18 children who are still having lessons
  const loginPupils = links.flatMap((l) => (l.students && isMinor(l.students) && l.students.status !== 'left' ? [l.students.first_name] : []))

  return (
    <>
      <PageHeader
        title={fullName(g)}
        back={{ href: '/contacts', label: 'Parents & contacts' }}
        subtitle={
          <span className="row" style={{ gap: 6 }}>
            {g.email ? <a href={`mailto:${g.email}`}>{g.email}</a> : <Badge tone="coral">No email — they won&apos;t get emails</Badge>}
            {g.phone && <span>· {g.phone}</span>}
          </span>
        }
        actions={
          <Link className="btn btn-secondary" href={`/messages/new?guardian=${id}`}>
            Message
          </Link>
        }
      />

      <div className="split">
        {/* ---- Edit details ---- */}
        <div className="stack">
          <GuardianForm action={updateGuardian.bind(null, id)} guardian={guardian} cancelHref="/contacts" />
        </div>

        <div className="stack">
          {/* ---- Linked students ---- */}
          <Card title="Parent / guardian of">
            {links.length === 0 ? (
              <p className="muted">Not linked to any students yet. Link them below so they receive reminders and invoices.</p>
            ) : (
              <ul className="list">
                {links.map(
                  (l) =>
                    l.students && (
                      <li key={l.students.id}>
                        <div className="spread">
                          <Link href={`/students/${l.students.id}`} style={{ fontWeight: 800 }}>
                            {fullName(l.students)}
                          </Link>
                          <span className="row" style={{ gap: 4 }}>
                            {l.relationship && <Badge>{l.relationship}</Badge>}
                            {l.is_primary && <Badge tone="teal">Main contact</Badge>}
                            {l.students.status !== 'active' && <StatusBadge status={l.students.status} />}
                          </span>
                        </div>
                        {/* Reminders only go to parents of under-18s */}
                        {!isMinor(l.students) && (
                          <div className="small muted">Now 18 or over — emails go to {l.students.first_name} directly.</div>
                        )}
                        {!l.receives_emails && <div className="small muted">Emails about this student are switched off.</div>}
                        <div className="row" style={{ marginTop: 6 }}>
                          <ConfirmButton
                            action={unlinkStudent.bind(null, id, l.students.id)}
                            confirm={`Unlink ${fullName(g)} from ${fullName(l.students)}? Both records are kept.`}
                            className="btn btn-ghost btn-sm"
                          >
                            Unlink
                          </ConfirmButton>
                        </div>
                      </li>
                    ),
                )}
              </ul>
            )}

            {/* Link to more students (e.g. a younger sibling) */}
            {unlinked.length > 0 && (
              <details style={{ marginTop: 12 }} open={links.length === 0}>
                <summary className="btn btn-secondary btn-sm">+ Link to students</summary>
                <div style={{ marginTop: 12 }}>
                  <ActionForm action={linkStudents.bind(null, id)} resetOnSuccess>
                    <Picker name="student_ids" label="Students" options={unlinked} multiple />
                    <TextField label="Relationship" name="relationship" placeholder="e.g. Mum, Dad, Carer" />
                    <Toggle name="is_primary" label="Main contact" defaultChecked={links.length === 0} />
                    <SubmitButton>Link</SubmitButton>
                  </ActionForm>
                </div>
              </details>
            )}
          </Card>

          {/* ---- Family login ---- */}
          <FamilyAccessCard teacher={teacher} kind="guardian" id={id} name={fullName(g)} email={g.email} pupilNames={loginPupils} />

          {/* ---- Danger zone ---- */}
          <Card>
            <ConfirmButton
              action={deleteGuardian.bind(null, id)}
              confirm={`Delete ${fullName(g)}? They'll be unlinked from their students. The students themselves are kept. This can't be undone.`}
            >
              Delete contact
            </ConfirmButton>
          </Card>
        </div>
      </div>
    </>
  )
}
