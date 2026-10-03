# Lindon

Admin software for instrumental music teachers: students, parents, weekly time slots, lessons and lesson notes, reminders, invoices (lessons + equipment), book/equipment lending, exams, email to families, and income reports.

**Stack:** Next.js 16 (App Router, server actions) · Auth.js v5 (email magic links) · Supabase (Postgres) · Resend (all email).

## How it fits together

| Piece | Where |
| --- | --- |
| Database schema | `supabase/migrations/0001_init.sql` |
| Table types | `lib/database.types.ts` (keep in sync with the SQL) |
| Sign-in | `auth.ts` (Resend magic link, Supabase adapter, JWT sessions), `proxy.ts` |
| Data access | `lib/db.ts` — server-only service-role client + `requireTeacher()` |
| Email | `lib/email.ts` (send + log), `lib/email-templates.ts` (branded HTML) |
| Reminders | `lib/reminders.ts`, `app/api/cron/reminders/route.ts`, `vercel.json` |
| Design system | `app/globals.css`, `components/` |

### Security model
- Each teacher only sees their own data. The app talks to Supabase **only from the server** with the service-role key, and every query is scoped to the signed-in teacher (`requireTeacher()`).
- RLS is **on** for every table with **no policies**, so the public/anon key can't read anything.
- Composite foreign keys (`student_id, teacher_id`) mean the database itself refuses to link one teacher's records to another's.

### Product rules
- **No dropdown menus.** Fixed choices are pill buttons; picking a student is a search box with a visible list; instruments, times, boards, grades and so on are typed by the teacher.
- **Under 18 → parents.** Reminders, notes and messages for under-18s go to linked parents/guardians; students 18+ are emailed directly. A date of birth switches this automatically on their 18th birthday.

## Setup

1. **Supabase.** Create a project, then run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push`).
   Then go to **Project Settings → API → Exposed schemas** and add `next_auth`, because sign-in won't work without it.
2. **Resend.** Verify your sending domain and create an API key.
3. **Environment.** Copy `.env.example` to `.env.local` and fill it in. Run `npx auth secret` for `AUTH_SECRET`.
4. **Run it.**
   ```bash
   npm install
   npm run dev
   ```
5. **Deploy (Vercel).** Add the same env vars, including `CRON_SECRET`. Vercel Cron calls `/api/cron/reminders` on the schedule in `vercel.json`.

## First use
Settings → add students (and parents for under-18s) → set up time slots and book students into them → Schedule → "Generate lessons from slots" → write notes after each lesson → invoice at the end of the month.
