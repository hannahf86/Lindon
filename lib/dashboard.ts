// =============================================================================
// lib/dashboard.ts — everything the dashboard (app/(app)/page.tsx) shows,
// fetched in parallel. All queries are scoped to the signed-in teacher and
// all "today / this month" maths happens in the teacher's own timezone.
//
// Core: income this month, free time for the rest of this week (teaching
// hours minus booked lessons and timed events), and things needing attention
// (attendance to mark, overdue invoices, bookings ending, children with no
// parent). Extras only load when their feature is on: exam deadlines and
// overdue loans.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import type { Teacher } from './database.types'
import { addDaysISO, dayBoundsUtc, diffDays, fmtTz, isoWeekday, monthBounds, rangeBoundsUtc, todayISO, weekStartISO } from './dates'
import { isMinor } from './format'
import { clock, freeGaps, isCancelled, minutesOf } from './lessons'
import { has } from './features'

const FREE_SHOWN = 7 // free-time blocks listed on the tile (rest of this week only — Hannah's call)

export async function loadDashboard(teacher: Teacher) {
  const t = teacher.id
  const tz = teacher.timezone
  const today = todayISO(tz)
  const nowIso = new Date().toISOString()
  const [monthFrom, monthTo] = monthBounds(today)
  const [recentFrom] = dayBoundsUtc(addDaysISO(today, -14), tz)
  // Free time: today to the end of this week (Sunday)
  const weekEnd = addDaysISO(weekStartISO(today), 6)
  const FREE_DAYS = diffDays(today, weekEnd) + 1
  const [aheadFrom, aheadTo] = rangeBoundsUtc(today, weekEnd, tz)
  const horizon = addDaysISO(today, 60)
  const none = Promise.resolve([])

  const [studentCount, paidThisMonth, unpaid, hours, upcoming, upcomingEvents, needAttendance, minors, endingBookings, exams, overdueLoans] = await Promise.all([
    // ---- Any students at all? (first-run guidance) ----
    db().from('students').select('id', { count: 'exact', head: true }).eq('teacher_id', t),

    // ---- Income: invoices paid this month ----
    db().from('invoices').select('total').eq('teacher_id', t).eq('status', 'paid').gte('paid_on', monthFrom).lte('paid_on', monthTo).then(must),

    // ---- Sent-but-unpaid invoices (outstanding + overdue) ----
    db()
      .from('invoices')
      .select('id, number, bill_to_name, due_date, total, students(first_name, last_name)')
      .eq('teacher_id', t)
      .eq('status', 'sent')
      .order('due_date', { ascending: true, nullsFirst: false })
      .then(must),

    // ---- Teaching hours + lessons in the next fortnight (for free time) ----
    db().from('teaching_hours').select('day_of_week, starts, ends').eq('teacher_id', t).then(must),
    db().from('lessons').select('starts_at, duration_minutes, status').eq('teacher_id', t).gte('starts_at', aheadFrom).lt('starts_at', aheadTo).then(must),
    db().from('events').select('event_date, starts, ends').eq('teacher_id', t).gte('event_date', today).lte('event_date', addDaysISO(today, FREE_DAYS - 1)).not('starts', 'is', null).then(must),

    // ---- Past 14 days' lessons with attendance not marked ----
    db()
      .from('lessons')
      .select('id, starts_at, instrument, students(id, first_name, last_name)')
      .eq('teacher_id', t)
      .gte('starts_at', recentFrom)
      .lt('starts_at', nowIso)
      .eq('status', 'scheduled')
      .order('starts_at', { ascending: false })
      .limit(10)
      .then(must),

    // ---- Active students + whether anyone is linked as a parent ----
    db()
      .from('students')
      .select('id, first_name, last_name, date_of_birth, is_minor, student_guardians(guardian_id)')
      .eq('teacher_id', t)
      .eq('status', 'active')
      .order('first_name')
      .then(must),

    // ---- Bookings ending in the next 14 days, or ended in the last 14 (time to rebook) ----
    db()
      .from('time_slots')
      .select('id, day_of_week, start_time, ends_on, students(id, first_name, last_name, status)')
      .eq('teacher_id', t)
      .eq('active', true)
      .not('student_id', 'is', null)
      .gte('ends_on', addDaysISO(today, -14))
      .lte('ends_on', addDaysISO(today, 14))
      .order('ends_on')
      .then(must)
      .then((rows) => rows.filter((r) => r.students?.status === 'active')),

    // ---- Extras ----
    has(teacher, 'exams')
      ? db()
          .from('exams')
          .select('id, board, grade, exam_date, entry_deadline, status, students(first_name, last_name)')
          .eq('teacher_id', t)
          .in('status', ['planned', 'entered'])
          .then(must)
      : none,
    has(teacher, 'library')
      ? db()
          .from('loans')
          .select('id, item_id, due_on, library_items(title), students(first_name, last_name)')
          .eq('teacher_id', t)
          .is('returned_on', null)
          .lt('due_on', today)
          .order('due_on')
          .then(must)
      : none,
  ])

  // ---- Free time: teaching hours minus lessons going ahead, day by day ----
  const freeSlots: { date: string; from: string; to: string }[] = []
  for (let i = 0; i < FREE_DAYS; i++) {
    const d = addDaysISO(today, i)
    const dayHours = hours.filter((h) => h.day_of_week === isoWeekday(d))
    if (dayHours.length === 0) continue
    const busy = upcoming
      .filter((l) => !isCancelled(l.status) && fmtTz(l.starts_at, tz, 'yyyy-MM-dd') === d)
      .map((l) => {
        const from = minutesOf(fmtTz(l.starts_at, tz, 'HH:mm'))
        return { from, to: from + l.duration_minutes }
      })
    for (const e of upcomingEvents.filter((x) => x.event_date === d && x.starts)) {
      const from = minutesOf(e.starts!.slice(0, 5))
      busy.push({ from, to: e.ends ? minutesOf(e.ends.slice(0, 5)) : from + 60 })
    }
    for (const g of freeGaps(dayHours, busy)) {
      // Today: only time still to come
      if (d === today && g.to <= minutesOf(fmtTz(nowIso, tz, 'HH:mm'))) continue
      freeSlots.push({ date: d, from: clock(g.from), to: clock(g.to) })
    }
  }

  // ---- Exams with a date or entry deadline in the next 60 days ----
  const inWindow = (d: string | null) => !!d && d >= today && d <= horizon
  const upcomingExams = exams.filter((e) => inWindow(e.exam_date) || (e.status === 'planned' && inWindow(e.entry_deadline)))

  return {
    today,
    hasStudents: (studentCount.count ?? 0) > 0,
    income: paidThisMonth.reduce((sum, inv) => sum + Number(inv.total), 0),
    paidCount: paidThisMonth.length,
    outstandingTotal: unpaid.reduce((sum, inv) => sum + Number(inv.total), 0),
    overdueInvoices: unpaid.filter((inv) => inv.due_date && inv.due_date < today),
    freeSlots: freeSlots.slice(0, FREE_SHOWN),
    freeCount: freeSlots.length,
    hasHours: hours.length > 0,
    needAttendance,
    endingBookings,
    minorsWithoutParent: minors.filter((s) => isMinor(s) && s.student_guardians.length === 0),
    upcomingExams,
    overdueLoans,
  }
}
