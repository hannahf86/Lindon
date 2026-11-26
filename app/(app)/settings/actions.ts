'use server'
// =============================================================================
// settings/actions.ts — save one Settings tab (studio info, invoicing,
// communication or features); only that tab's fields are touched
// (the signed-in teacher's own `teachers` row — never anyone else's).
// =============================================================================
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { bool, handle, int, str, FormError, type ActionState } from '@/lib/forms'
import { splitList } from '@/lib/format'
import { readChargingFields } from '@/lib/feature-form'
import { FEATURE_KEYS } from '@/lib/features'
import type { Teacher } from '@/lib/database.types'
import { newCalendarToken } from '@/lib/calendar-feed'

/** Typed IANA timezone, e.g. "Europe/London" — checked against the runtime's list. */
function readTimezone(fd: FormData): string {
  const tz = str(fd, 'timezone') || 'Europe/London'
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
  } catch {
    throw new FormError(`Timezone: "${tz}" isn't one I recognise. Use a name like Europe/London or America/New_York.`)
  }
  return tz
}

/** Typed 3-letter currency code, e.g. GBP. */
function readCurrency(fd: FormData): string {
  const c = (str(fd, 'currency') || 'GBP').toUpperCase()
  if (!/^[A-Z]{3}$/.test(c)) throw new FormError(`Currency: "${c}" should be a 3-letter code like GBP, EUR or USD.`)
  return c
}

/** A "#RRGGBB" colour from a colour picker. */
function readColour(fd: FormData, key: string, fallback: string): string {
  const c = str(fd, key)
  return /^#[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : fallback
}

/** The fields each Settings tab owns — a tab only ever updates its own. */
function readSection(fd: FormData, teacher: Teacher) {
  switch (str(fd, 'section')) {
    case 'studio': {
      const email = str(fd, 'email')
      if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new FormError(`"${email}" doesn't look like an email address.`)
      return {
        display_name: str(fd, 'display_name'),
        business_name: str(fd, 'business_name'),
        email,
        phone: str(fd, 'phone'),
        address: str(fd, 'address'),
        locations: splitList(str(fd, 'locations')),
      }
    }
    case 'invoicing':
      return {
        ...readChargingFields(fd),
        invoice_prefix: str(fd, 'invoice_prefix'),
        next_invoice_number: int(fd, 'next_invoice_number', 'Next invoice number', { min: 1, fallback: teacher.next_invoice_number }),
        invoice_terms_days: int(fd, 'invoice_terms_days', 'Payment terms', { min: 0, max: 365, fallback: 14 }),
        payment_details: str(fd, 'payment_details'),
        invoice_footer: str(fd, 'invoice_footer'),
        currency: readCurrency(fd),
        timezone: readTimezone(fd),
        invoice_color: readColour(fd, 'invoice_color', '#5B3F8C'),
        invoice_accent: readColour(fd, 'invoice_accent', '#E3C67E'),
      }
    case 'communication':
      return {
        reminders_enabled: bool(fd, 'reminders_enabled'),
        reminder_hours_before: int(fd, 'reminder_hours_before', 'Hours before', { min: 1, max: 168, fallback: 24 }),
        reminder_message: str(fd, 'reminder_message'),
        exam_reminders_enabled: bool(fd, 'exam_reminders_enabled'),
        exam_reminder_days: int(fd, 'exam_reminder_days', 'Days before an exam', { min: 1, max: 60, fallback: 7 }),
        message_alerts: bool(fd, 'message_alerts'),
      }
    case 'features':
      return { features: FEATURE_KEYS.filter((k) => bool(fd, `feature_${k}`)) }
    default:
      throw new FormError('Something went wrong — refresh the page and try again.')
  }
}

export async function updateSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    must(await db().from('teachers').update(readSection(fd, teacher)).eq('id', teacher.id).select('id').single())
    // Studio name and the sidebar's extras show on every page
    revalidatePath('/', 'layout')
    return { ok: 'Settings saved.' }
  })
}

// ---- Calendar subscription link (Settings → Studio info → Calendar) ---------------------------
/** Make the private calendar link, or replace it (the old link stops working). */
export async function makeCalendarLink(): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const replacing = !!teacher.calendar_token
    must(await db().from('teachers').update({ calendar_token: newCalendarToken() }).eq('id', teacher.id).select('id').single())
    revalidatePath('/settings')
    return { ok: replacing ? 'New link made — the old one has stopped working. Add the new one to your calendar.' : 'Your calendar link is ready.' }
  })
}

/** Switch the link off altogether. */
export async function removeCalendarLink(): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    must(await db().from('teachers').update({ calendar_token: null }).eq('id', teacher.id).select('id').single())
    revalidatePath('/settings')
    return { ok: 'Calendar link switched off.' }
  })
}
