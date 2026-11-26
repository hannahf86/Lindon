// =============================================================================
// contacts/family-access-card.tsx — "Family login" card
//
// Shown on a parent/guardian's contact page and on an ADULT pupil's student
// page. Says whether they can sign in to Lindon (not invited / invited /
// last signed in / removed) with the matching actions. If their email has
// changed since the invite, offers to re-invite at the new address.
// ChildLoginNote is the version for a child's student page: children never
// get their own login — each parent is listed with their status and an
// Invite / Resend invite button right there (FamilyInviteInline).
// =============================================================================
import { fullName } from '@/lib/format'
import { accessRows, accessStatus, accessText, type AccessState } from '@/lib/family-invites'
import { ConfirmButton } from '@/components/forms'
import { Badge, Card, type Tone } from '@/components/ui'
import type { Teacher } from '@/lib/database.types'
import { inviteFamilyAction, reinviteAction, removeAccessAction, resendInviteAction, type FamilyKind } from './family-actions'

const TONES: Record<AccessState, { tone: Tone; label: string }> = {
  none: { tone: 'plain', label: 'Not invited' },
  invited: { tone: 'butter', label: 'Invited' },
  active: { tone: 'teal', label: 'Active' },
  removed: { tone: 'coral', label: 'Access removed' },
}

export async function FamilyAccessCard(props: {
  teacher: Teacher
  kind: FamilyKind
  id: string
  name: string
  email: string
  /** For a guardian: their under-18 children's first names (what they'll see) */
  pupilNames?: string[]
}) {
  const { teacher, kind, id } = props
  const status = accessStatus(await accessRows(teacher.id, kind === 'guardian' ? { guardianId: id } : { studentId: id }))
  const email = props.email.trim().toLowerCase()
  const emailChanged = !!status.live && !!email && status.live.email !== email
  const first = props.name.split(' ')[0] || 'them'
  const tone = TONES[status.state]

  return (
    <Card title="Family login" actions={<Badge tone={tone.tone}>{tone.label}</Badge>}>
      {/* ---- What a login gives them ---- */}
      <p className="small muted" style={{ marginTop: 0 }}>
        {kind === 'guardian'
          ? props.pupilNames?.length
            ? `With a login, ${first} can see ${props.pupilNames.join(' and ')}’s lessons and invoices.`
            : `${first} isn’t linked to any pupils under 18, so a login wouldn’t show them anything yet.`
          : `With a login, ${first} can see their own lessons and invoices.`}
      </p>

      {/* ---- Current status ---- */}
      <p style={{ fontWeight: 700 }}>{accessText(status, teacher.timezone, !!email)}</p>
      {status.live && <p className="small muted">Signs in as {status.live.email}</p>}

      {/* ---- Email changed since the invite ---- */}
      {emailChanged && (
        <div className="alert alert-info small" style={{ marginBottom: 12 }}>
          Their email is now {email}, but they were invited as {status.live!.email}. Re-invite them so they can sign in with the new address.
        </div>
      )}

      {/* ---- Actions ---- */}
      <div className="row" style={{ gap: 6 }}>
        {!status.live &&
          (email ? (
            <ConfirmButton
              action={inviteFamilyAction.bind(null, kind, id)}
              confirm={`Email ${email} an invitation to sign in to Lindon?`}
              className="btn btn-sm"
            >
              {status.state === 'removed' ? 'Invite again' : 'Invite to Lindon'}
            </ConfirmButton>
          ) : (
            <span className="small" style={{ color: 'var(--coral-ink)', fontWeight: 700 }}>
              Add an email address to invite {first}.
            </span>
          ))}
        {emailChanged && (
          <ConfirmButton
            action={reinviteAction.bind(null, kind, id)}
            confirm={`Remove access for ${status.live!.email} and invite ${email} instead?`}
            className="btn btn-sm"
          >
            Re-invite with new email
          </ConfirmButton>
        )}
        {status.live && (
          <>
            <ConfirmButton
              action={resendInviteAction.bind(null, kind, id)}
              confirm={`Send the invitation to ${status.live.email} again?`}
              className="btn btn-secondary btn-sm"
            >
              Resend invite
            </ConfirmButton>
            <ConfirmButton
              action={removeAccessAction.bind(null, kind, id)}
              confirm={`Remove ${props.name}’s access to Lindon? They won’t be able to sign in. Your messages with them are kept.`}
              className="btn btn-danger btn-sm"
            >
              Remove access
            </ConfirmButton>
          </>
        )}
      </div>
    </Card>
  )
}

// ---- Child's student page: invite their parents (status + button for each) ----------------
export async function ChildLoginNote(props: { teacher: Teacher; childName: string; guardians: { id: string; first_name: string; last_name: string; email: string }[] }) {
  return (
    <Card title="Family login">
      <p className="small muted" style={{ marginTop: 0 }}>
        Children don’t get their own login. Invite a parent and they’ll get an email to check their details and {props.childName}’s lessons, and create a password.
      </p>
      {props.guardians.length === 0 ? (
        <p className="small" style={{ color: 'var(--coral-ink)', fontWeight: 700 }}>
          No parent linked yet.
        </p>
      ) : (
        <ul className="list">
          {props.guardians.map((g) => (
            <li key={g.id}>
              <FamilyInviteInline teacher={props.teacher} kind="guardian" id={g.id} name={fullName(g)} email={g.email} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ---- One person: name, login status, and Invite / Resend right there ----------------------------
export async function FamilyInviteInline(props: { teacher: Teacher; kind: FamilyKind; id: string; name: string; email: string }) {
  const { teacher, kind, id } = props
  const status = accessStatus(await accessRows(teacher.id, kind === 'guardian' ? { guardianId: id } : { studentId: id }))
  const email = props.email.trim().toLowerCase()
  const tone = TONES[status.state]
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="spread">
        <strong>{props.name}</strong>
        <Badge tone={tone.tone}>{tone.label}</Badge>
      </div>
      <div className="small muted">{accessText(status, teacher.timezone, !!email)}</div>
      <div className="row" style={{ gap: 6 }}>
        {status.live ? (
          <ConfirmButton action={resendInviteAction.bind(null, kind, id)} confirm={`Send the invitation to ${status.live.email} again?`} className="btn btn-secondary btn-sm">
            Resend invite
          </ConfirmButton>
        ) : email ? (
          <ConfirmButton action={inviteFamilyAction.bind(null, kind, id)} confirm={`Email ${email} an invitation to Lindon?`} className="btn btn-sm">
            {status.state === 'removed' ? 'Invite again' : 'Invite to Lindon'}
          </ConfirmButton>
        ) : (
          <span className="small" style={{ color: 'var(--coral-ink)', fontWeight: 700 }}>
            Add an email address to invite them.
          </span>
        )}
      </div>
    </div>
  )
}
