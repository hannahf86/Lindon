// =============================================================================
// lib/email-templates.ts — branded HTML emails (Lindon palette)
//
// Email clients ignore most CSS, so everything is inline-styled tables.
// ALL teacher/student-supplied text goes through esc() before it is placed
// in HTML. Every template returns { subject, html, text }.
// =============================================================================

const TEAL_INK = '#1D7F7A'
const INK = '#23303A'
const MUTED = '#5C6B75'
const BUTTER = '#F6E5A0'

export type Email = { subject: string; html: string; text: string }

export function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escaped plain text with line breaks preserved. */
export function paragraphs(s: string): string {
  return esc(s)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Shared shell: teal header band with the studio name, white card, footer. */
export function layout(opts: { studio: string; heading: string; bodyHtml: string; footer?: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F2F7F7;font-family:Nunito,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F7F7;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:${TEAL_INK};padding:22px 28px">
<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#ffffff;opacity:.9">${esc(opts.studio)}</div>
<div style="font-size:24px;font-weight:900;color:#ffffff;margin-top:4px">${esc(opts.heading)}</div>
</td></tr>
<tr><td style="height:6px;background:${BUTTER};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:26px 28px;font-size:16px">${opts.bodyHtml}</td></tr>
${opts.footer ? `<tr><td style="padding:0 28px 24px;font-size:13px;color:${MUTED}">${paragraphs(opts.footer)}</td></tr>` : ''}
</table>
</td></tr></table></body></html>`
}

export function button(href: string, text: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:${TEAL_INK};color:#ffffff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">${esc(text)}</a>`
}

/** Key/value rows (lesson time, invoice total…) */
export function detailTable(rows: [string, string][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 18px;border-collapse:collapse">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;color:${MUTED};width:38%;border-bottom:1px solid #E6EEEE">${esc(k)}</td><td style="padding:8px 0;font-weight:700;border-bottom:1px solid #E6EEEE">${esc(v)}</td></tr>`,
    )
    .join('')}</table>`
}

// ---- Magic link (sign-in) ----------------------------------------------------
export function magicLinkEmail(url: string): Email {
  return {
    subject: 'Your sign-in link for Lindon',
    text: `Sign in to Lindon:\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: layout({
      studio: 'Lindon',
      heading: 'Sign in',
      bodyHtml: `<p style="margin:0 0 20px;line-height:1.55">Tap the button below to sign in. The link works once and expires in 24 hours.</p>${button(url, 'Sign in to Lindon')}<p style="margin:22px 0 0;font-size:13px;color:${MUTED}">If you didn't ask for this, you can ignore this email.</p>`,
    }),
  }
}

// ---- Free-form message (broadcasts and one-to-one emails) --------------------
export function messageEmail(opts: { studio: string; subject: string; body: string; signature: string }): Email {
  return {
    subject: opts.subject,
    text: `${opts.body}\n\n${opts.signature}`,
    html: layout({
      studio: opts.studio,
      heading: opts.subject,
      bodyHtml: paragraphs(opts.body) + `<p style="margin:18px 0 0;font-weight:700">${esc(opts.signature)}</p>`,
    }),
  }
}

// ---- Lesson reminder ---------------------------------------------------------
export function lessonReminderEmail(opts: {
  studio: string
  studentName: string
  when: string // already formatted in the teacher's timezone
  duration: string
  instrument: string
  location: string
  extraMessage: string
  signature: string
}): Email {
  const rows: [string, string][] = [
    ['Student', opts.studentName],
    ['When', opts.when],
    ['Length', opts.duration],
  ]
  if (opts.instrument) rows.push(['Instrument', opts.instrument])
  if (opts.location) rows.push(['Where', opts.location])
  const subject = `Lesson reminder: ${opts.studentName}, ${opts.when}`
  return {
    subject,
    text: `Reminder: ${opts.studentName} has a lesson ${opts.when} (${opts.duration})${opts.location ? ' at ' + opts.location : ''}.\n\n${opts.extraMessage}\n\n${opts.signature}`.trim(),
    html: layout({
      studio: opts.studio,
      heading: 'Lesson reminder',
      bodyHtml:
        `<p style="margin:0 0 10px;line-height:1.55">Just a reminder of the next lesson:</p>` +
        detailTable(rows) +
        (opts.extraMessage ? paragraphs(opts.extraMessage) : '') +
        `<p style="margin:18px 0 0;font-weight:700">${esc(opts.signature)}</p>`,
    }),
  }
}

// ---- Lesson notes ------------------------------------------------------------
export function lessonNotesEmail(opts: {
  studio: string
  studentName: string
  date: string
  notes: string
  homework: string
  signature: string
}): Email {
  const subject = `Lesson notes for ${opts.studentName} — ${opts.date}`
  return {
    subject,
    text: `Lesson notes for ${opts.studentName} (${opts.date})\n\n${opts.notes}\n\n${opts.homework ? 'Practice this week:\n' + opts.homework + '\n\n' : ''}${opts.signature}`,
    html: layout({
      studio: opts.studio,
      heading: `Lesson notes — ${opts.studentName}`,
      bodyHtml:
        `<p style="margin:0 0 16px;color:${MUTED}">${esc(opts.date)}</p>` +
        paragraphs(opts.notes) +
        (opts.homework
          ? `<div style="background:#FBF6DE;border-radius:14px;padding:16px 18px;margin:8px 0 6px"><div style="font-weight:900;margin-bottom:8px">Practice this week</div>${paragraphs(opts.homework)}</div>`
          : '') +
        `<p style="margin:18px 0 0;font-weight:700">${esc(opts.signature)}</p>`,
    }),
  }
}

// ---- Invoice -----------------------------------------------------------------
export function invoiceEmail(opts: {
  studio: string
  number: string
  billTo: string
  issueDate: string
  dueDate: string
  lines: { description: string; amount: string }[]
  total: string
  paymentDetails: string
  notes: string
  footer: string
  signature: string
}): Email {
  const lineRows = opts.lines
    .map(
      (l) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #E6EEEE">${esc(l.description)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #E6EEEE;white-space:nowrap">${esc(l.amount)}</td></tr>`,
    )
    .join('')
  const subject = `Invoice ${opts.number} from ${opts.studio}`
  return {
    subject,
    text:
      `Invoice ${opts.number}\nFor: ${opts.billTo}\nIssued: ${opts.issueDate}${opts.dueDate ? `\nDue: ${opts.dueDate}` : ''}\n\n` +
      opts.lines.map((l) => `${l.description} — ${l.amount}`).join('\n') +
      `\n\nTotal: ${opts.total}\n\n${opts.paymentDetails ? 'How to pay:\n' + opts.paymentDetails + '\n\n' : ''}${opts.notes ? opts.notes + '\n\n' : ''}${opts.signature}`,
    html: layout({
      studio: opts.studio,
      heading: `Invoice ${opts.number}`,
      footer: opts.footer,
      bodyHtml:
        detailTable([
          ['For', opts.billTo],
          ['Issued', opts.issueDate],
          ...(opts.dueDate ? ([['Due', opts.dueDate]] as [string, string][]) : []),
        ]) +
        `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${lineRows}<tr><td style="padding:12px 0;font-weight:900">Total</td><td align="right" style="padding:12px 0;font-weight:900;font-size:18px;color:${TEAL_INK}">${esc(opts.total)}</td></tr></table>` +
        (opts.paymentDetails
          ? `<div style="background:#EEF7F7;border-radius:14px;padding:16px 18px;margin:16px 0"><div style="font-weight:900;margin-bottom:8px">How to pay</div>${paragraphs(opts.paymentDetails)}</div>`
          : '') +
        (opts.notes ? paragraphs(opts.notes) : '') +
        `<p style="margin:18px 0 0;font-weight:700">${esc(opts.signature)}</p>`,
    }),
  }
}

// ---- Family invite -----------------------------------------------------------
export function familyInviteEmail(opts: {
  studio: string
  teacherName: string
  inviteeName: string
  pupilNames: string[] // whose lessons they'll see
  url: string
}): Email {
  const who = opts.pupilNames.length ? opts.pupilNames.join(' and ') : 'your lessons'
  const subject = `${opts.teacherName} has invited you to Lindon`
  return {
    subject,
    text: `Hi ${opts.inviteeName},\n\n${opts.teacherName} uses Lindon to organise music lessons. You can now sign in to see ${who}'s upcoming lessons, lesson notes and invoices, and send ${opts.teacherName} messages.\n\nSign in here with this email address (no password needed):\n${opts.url}\n`,
    html: layout({
      studio: opts.studio,
      heading: "You're invited",
      bodyHtml:
        `<p style="margin:0 0 14px;line-height:1.55">Hi ${esc(opts.inviteeName)},</p>` +
        `<p style="margin:0 0 14px;line-height:1.55">${esc(opts.teacherName)} uses <strong>Lindon</strong> to organise music lessons. You can now sign in to see ${esc(who)}&#39;s upcoming lessons, lesson notes and invoices — and send ${esc(opts.teacherName)} messages.</p>` +
        `<p style="margin:0 0 22px;line-height:1.55">Sign in with this email address. There&#39;s no password: we&#39;ll email you a link each time.</p>` +
        button(opts.url, 'Open Lindon'),
    }),
  }
}

// ---- "You have a new message" alert -------------------------------------------
export function newMessageEmail(opts: { studio: string; fromName: string; body: string; url: string }): Email {
  const subject = `New message from ${opts.fromName}`
  return {
    subject,
    text: `${opts.fromName} sent you a message:\n\n${opts.body}\n\nReply in Lindon: ${opts.url}`,
    html: layout({
      studio: opts.studio,
      heading: 'New message',
      bodyHtml:
        `<p style="margin:0 0 12px;color:#5C6B75">From <strong style="color:#23303A">${esc(opts.fromName)}</strong></p>` +
        `<div style="background:#F2F7F7;border-radius:14px;padding:16px 18px;margin:0 0 20px">${paragraphs(opts.body)}</div>` +
        button(opts.url, 'Reply in Lindon'),
    }),
  }
}

// ---- Make-up credit issued ---------------------------------------------------------
export function creditIssuedEmail(opts: {
  studio: string
  studentName: string
  lessonWhen: string // "Tuesday 7 October at 16:30"
  lessonWhat: string // "Piano, 30 min"
  reason: 'notice' | 'teacher'
  amount: string
  balance: string // all unused credits, including this one
  signature: string
}): Email {
  const why =
    opts.reason === 'teacher'
      ? `I'm sorry I had to cancel ${opts.studentName}'s lesson on ${opts.lessonWhen}.`
      : `Thank you for letting me know that ${opts.studentName} couldn't make the lesson on ${opts.lessonWhen}.`
  const subject = `Make-up credit for ${opts.studentName}`
  const body =
    `${why}\n\nAs lessons are paid in advance, a make-up credit of ${opts.amount} has been added to ${opts.studentName}'s account. ` +
    `It will be taken off next month's invoice automatically — there's nothing you need to do.`
  return {
    subject,
    text: `${body}\n\nLesson: ${opts.lessonWhen} (${opts.lessonWhat})\nCredit: ${opts.amount}\nTotal credit waiting: ${opts.balance}\n\n${opts.signature}`,
    html: layout({
      studio: opts.studio,
      heading: 'Make-up credit',
      bodyHtml:
        paragraphs(body) +
        detailTable([
          ['Lesson', `${opts.lessonWhen} (${opts.lessonWhat})`],
          ['Credit', opts.amount],
          ['Total credit waiting', opts.balance],
        ]) +
        `<p style="margin:18px 0 0;font-weight:700">${esc(opts.signature)}</p>`,
    }),
  }
}
