// =============================================================================
// messages/new/page.tsx — jump into a conversation from elsewhere
//
//   ?guardian=<id>  → open (or start) the conversation with that contact
//   ?student=<id>   → adult pupil: their own conversation
//                     child: bounced to ?pick=<id> (safeguarding)
//   ?pick=<id>      → a child's parents: one → straight there, several → choose
// Everything is checked against the signed-in teacher before anything is made.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db, requireTeacher } from '@/lib/db'
import { fullName, isMinor } from '@/lib/format'
import { conversationFor } from '@/lib/messages'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'

export const metadata: Metadata = { title: 'New message' }

const UUID = /^[0-9a-f-]{36}$/i
const param = (v: string | string[] | undefined) => (typeof v === 'string' && UUID.test(v) ? v : null)

export default async function NewMessagePage({ searchParams }: PageProps<'/messages/new'>) {
  const sp = await searchParams
  const teacher = await requireTeacher()
  const guardianId = param(sp.guardian)
  const studentId = param(sp.student)
  const pickId = param(sp.pick)

  // ---- A parent / guardian ----
  if (guardianId) {
    const { data } = await db().from('guardians').select('id').eq('id', guardianId).eq('teacher_id', teacher.id).maybeSingle()
    if (!data) notFound()
    const c = await conversationFor(teacher.id, { guardianId })
    redirect(`/messages/${c.id}`)
  }

  // ---- A pupil: adults only, children go via their parents ----
  if (studentId) {
    const { data: s } = await db().from('students').select('id, date_of_birth, is_minor').eq('id', studentId).eq('teacher_id', teacher.id).maybeSingle()
    if (!s) notFound()
    if (isMinor(s)) redirect(`/messages/new?pick=${studentId}`)
    const c = await conversationFor(teacher.id, { studentId })
    redirect(`/messages/${c.id}`)
  }

  if (!pickId) redirect('/messages')

  // ---- Choose which parent of a child ----
  const { data: s } = await db()
    .from('students')
    .select('id, first_name, last_name, date_of_birth, is_minor, student_guardians(relationship, is_primary, guardians(id, first_name, last_name, email))')
    .eq('id', pickId)
    .eq('teacher_id', teacher.id)
    .maybeSingle()
  if (!s) notFound()
  if (!isMinor(s)) redirect(`/messages/new?student=${pickId}`)

  const parents = s.student_guardians.filter((l) => l.guardians).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  if (parents.length === 1) redirect(`/messages/new?guardian=${parents[0].guardians!.id}`)

  return (
    <>
      <PageHeader
        title={`Message ${s.first_name}’s parents`}
        back={{ href: `/students/${s.id}`, label: fullName(s) }}
        subtitle={`${s.first_name} is under 18, so messages go to a parent or guardian.`}
      />

      <Card title="Who would you like to message?">
        {parents.length === 0 ? (
          <EmptyState
            title="No parent linked"
            action={
              <Link href={`/students/${s.id}`} className="btn">
                Add a parent
              </Link>
            }
          >
            Add a parent or guardian on {s.first_name}’s page first.
          </EmptyState>
        ) : (
          <ul className="list">
            {parents.map((l) => (
              <li key={l.guardians!.id} className="spread">
                <span className="row" style={{ gap: 6 }}>
                  <strong>{fullName(l.guardians)}</strong>
                  {l.relationship && <Badge>{l.relationship}</Badge>}
                  {l.is_primary && <Badge tone="teal">Main contact</Badge>}
                  {!l.guardians!.email && <span className="small muted">No email</span>}
                </span>
                <Link href={`/messages/new?guardian=${l.guardians!.id}`} className="btn btn-sm">
                  Message
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
