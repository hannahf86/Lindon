'use server'
// =============================================================================
// settings/actions.ts — save the teacher's studio profile and preferences
// (the signed-in teacher's own `teachers` row — never anyone else's).
// =============================================================================
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { bool, handle, int, str, FormError, type ActionState } from '@/lib/forms'

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

export async function updateSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const email = str(fd, 'email')
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new FormError(`"${email}" doesn't look like an email address.`)

    must(
      await db()
        .from('teachers')
        .update({
          // Studio profile
          display_name: str(fd, 'display_name'),
          business_name: str(fd, 'business_name'),
          email,
          phone: str(fd, 'phone'),
          address: str(fd, 'address'),
          // Region
          currency: readCurrency(fd),
          timezone: readTimezone(fd),
          // Invoicing
          invoice_prefix: str(fd, 'invoice_prefix'),
          next_invoice_number: int(fd, 'next_invoice_number', 'Next invoice number', { min: 1, fallback: teacher.next_invoice_number }),
          invoice_terms_days: int(fd, 'invoice_terms_days', 'Payment terms', { min: 0, max: 365, fallback: 14 }),
          payment_details: str(fd, 'payment_details'),
          invoice_footer: str(fd, 'invoice_footer'),
          // Reminders
          reminders_enabled: bool(fd, 'reminders_enabled'),
          reminder_hours_before: int(fd, 'reminder_hours_before', 'Hours before', { min: 1, max: 168, fallback: 24 }),
          reminder_message: str(fd, 'reminder_message'),
        })
        .eq('id', teacher.id)
        .select('id')
        .single(),
    )
    // Studio name shows in the sidebar on every page
    revalidatePath('/', 'layout')
    return { ok: 'Settings saved.' }
  })
}
