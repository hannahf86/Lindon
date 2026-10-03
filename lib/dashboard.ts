// =============================================================================
// lib/dashboard.ts — everything the dashboard (app/(app)/page.tsx) shows,
// fetched in parallel. All queries are scoped to the signed-in teacher and
// all "today / this week" maths happens in the teacher's own timezone.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import type { Teacher } from './database.types'
import { addDaysISO, dayBoundsUtc, rangeBoundsUtc, todayISO, weekStartISO } from './dates'
import { isMinor } from './format'

export async function loadDashboard(teacher: Teacher) {
  const t = teacher.id
  const tz = teacher.timezone
  const today = todayISO(tz)
  const nowIso = new Date().toISOString()
  const [dayStart, dayEnd] = dayBoundsUtc(today, tz)
  const weekStart = weekStartISO(today)
  const [weekFrom, weekTo] = rangeBoundsUtc(weekStart, addDaysISO(weekStart, 6), tz)
  const [notesFrom] = dayBoundsUtc(addDaysISO(today, -14), tz)
  const horizon = addDaysISO(today, 60)

  const [
    studentCount,
    activeCount,
    todaysLessons,
    weekCount,
    needNotes,
    unpaid,
    exams,
    overdueLoans,
    minors,
    endingBookings,
  ] = await Promise.all([
    // ---- Any students at all? (first-run guidance) ----
    db().from('students').select('id', { count: 'exact', head: true }).eq('teacher_id', t),
    db().from('students').select('id', { count: 'exact', head: true }).eq('teacher_id', t).eq('status', 'active'),

    // ---- Today's lessons ----
    db()
      .from('lessons')
      .select('id, starts_at, duration_minutes, instrument, location, status, students(id, first_name, last_name)')
      .eq('teacher_id', t)
      .gte('starts_at', dayStart)
      .lt('starts_at', dayEnd)
      .order('starts_at')
      .then(must),

    // ---- Lessons this week (Mon–Sun), not counting cancellations ----
    db()
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', t)
      .gte('starts_at', weekFrom)
      .lt('starts_at', weekTo)
      .not('status', 'in', '(notice_given,teacher_cancelled)'),

    // ---- Past 14 days' lessons with no notes yet ----
    db()
      .from('lessons')
      .select('id, starts_at, instrument, status, students(id, first_name, last_name)')
      .eq('teacher_id', t)
      .gte('starts_at', notesFrom)
      .lt('starts_at', nowIso)
      .not('status', 'in', '(notice_given,teacher_cancelled)')
      .eq('notes', '')
      .order('starts_at', { ascending: false })
      .limit(20)
      .then(must),

    // ---- Sent-but-unpaid invoices (outstanding total + overdue list) ----
    db()
      .from('invoices')
      .select('id, number, bill_to_name, due_date, total, students(first_name, last_name)')
      .eq('teacher_id', t)
      .eq('status', 'sent')
      .order('due_date', { ascending: true, nullsFirst: false })
      .then(must),

    // ---- Exams still to happen ----
    db()
      .from('exams')
      .select('id, board, instrument, grade, exam_date, exam_time, entry_deadline, status, students(id, first_name, last_name)')
      .eq('teacher_id', t)
      .in('status', ['planned', 'entered'])
      .then(must),

    // ---- Loans past their due date ----
    db()
      .from('loans')
      .select('id, item_id, lent_on, due_on, library_items(title), students(id, first_name, last_name)')
      .eq('teacher_id', t)
      .is('returned_on', null)
      .lt('due_on', today)
      .order('due_on')
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
      .select('id, day_of_week, start_time, ends_on, repeat_weeks, students(id, first_name, last_name, status)')
      .eq('teacher_id', t)
      .eq('active', true)
      .not('student_id', 'is', null)
      .gte('ends_on', addDaysISO(today, -14))
      .lte('ends_on', addDaysISO(today, 14))
      .order('ends_on')
      .then(must)
      .then((rows) => rows.filter((r) => r.students?.status === 'active')),
  ])

  // ---- Upcoming exams & deadlines in the next 60 days ----
  const inWindow = (d: string | null) => !!d && d >= today && d <= horizon
  const upcomingExams = exams
    .filter((e) => inWindow(e.exam_date) || (e.status === 'planned' && inWindow(e.entry_deadline)))
    .map((e) => {
      // Sort by whichever date matters first: a planned exam's entry deadline, else the exam itself
      const key = e.status === 'planned' && inWindow(e.entry_deadline) ? e.entry_deadline! : e.exam_date!
      return { ...e, sortKey: key }
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  return {
    endingBookings,
    today,
    weekStart,
    hasStudents: (studentCount.count ?? 0) > 0,
    activeStudents: activeCount.count ?? 0,
    todaysLessons,
    weekLessonCount: weekCount.count ?? 0,
    needNotes,
    outstandingTotal: unpaid.reduce((sum, inv) => sum + Number(inv.total), 0),
    outstandingCount: unpaid.length,
    overdueInvoices: unpaid.filter((inv) => inv.due_date && inv.due_date < today),
    upcomingExams,
    overdueLoans,
    minorsWithoutParent: minors.filter((s) => isMinor(s) && s.student_guardians.length === 0),
  }
}
