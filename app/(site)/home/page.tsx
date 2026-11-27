// =============================================================================
// app/(site)/home/page.tsx — the Lindon homepage (one page)
//
// Shown at "/" to anyone not signed in (proxy.ts rewrites "/" → "/home").
// Sections: hero with Sign in / Request an account · what it does (features)
// · how families see it · getting started in three steps · a closing call to
// action. Written for instrumental music teachers, in plain UK English.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: { absolute: 'Lindon — lessons, reminders and invoices for music teachers' },
  description: 'Lindon looks after your pupils, timetable, lesson reminders and invoices, so you can get on with teaching. Built for instrumental music teachers.',
}

const FEATURES = [
  { icon: '🗓️', title: 'Your timetable, sorted', text: 'Weekly lessons, free slots, one-offs and holidays in one calendar. Mark attendance with a click and subscribe from Google or Apple Calendar.' },
  { icon: '🧾', title: 'Invoices that send themselves', text: 'Monthly invoices in advance or after the lessons, as branded PDFs with your logo. Automatic reminders when something’s overdue.' },
  { icon: '🔔', title: 'Lesson reminders', text: 'Families get a friendly reminder before each lesson, so fewer forgotten lessons and fewer “is it this week?” messages.' },
  { icon: '👨‍👩‍👧', title: 'A space for families', text: 'Parents and adult pupils sign in to see lessons, pay invoices, reschedule within your rules, and download music you share.' },
  { icon: '💬', title: 'Messages in one place', text: 'Message families in the app instead of from your personal phone, send announcements to everyone, and see who’s read them.' },
  { icon: '📥', title: 'Easy to move over', text: 'Import your pupils from a spreadsheet or your old system in minutes, and carry over any lesson credit families have paid for.' },
]

const EXTRAS = ['Exam entries and reminders', 'Instrument and book loans with deposits', 'Lesson notes and progress reports', 'Events with RSVPs', 'Works on your phone like an app', 'Safeguarding built in']

export default function HomePage() {
  return (
    <>
      {/* ---- Hero ---- */}
      <section className="site-hero">
        <div className="site-wrap site-hero-inner">
          <div>
            <div className="site-eyebrow">For instrumental music teachers</div>
            <h1>
              Less admin.
              <br />
              More teaching.
            </h1>
            <p className="site-lead">
              Lindon looks after your pupils, timetable, reminders and invoices — so your evenings aren’t spent chasing payments and juggling
              spreadsheets.
            </p>
            <div className="site-cta">
              <Link href="/signup" className="btn site-btn-lg">
                Request an account
              </Link>
              <Link href="/login" className="btn btn-secondary site-btn-lg">
                Sign in
              </Link>
            </div>
            <p className="small site-note">Lindon is invite-only while we grow — request an account and we’ll be in touch.</p>
          </div>

          {/* A little picture of the week, made from page elements */}
          <div className="site-hero-card" aria-hidden="true">
            <div className="site-mini-head">
              <strong>This week</strong>
              <span>12 lessons</span>
            </div>
            {[
              ['Mon', '16:00', 'Tom · Piano', 'purple'],
              ['Mon', '16:45', 'Lily · Flute', 'gold'],
              ['Tue', '17:30', 'Jo · Singing', 'sage'],
              ['Wed', '15:30', 'Max · Violin', 'rose'],
            ].map(([d, t, who, tone]) => (
              <div key={d + t} className={`site-mini-row tone-${tone}`}>
                <span className="site-mini-day">{d}</span>
                <span className="site-mini-time">{t}</span>
                <span>{who}</span>
              </div>
            ))}
            <div className="site-mini-paid">
              <span>November invoices</span>
              <strong>18 of 20 paid ✓</strong>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Features ---- */}
      <section className="site-section" id="features">
        <div className="site-wrap">
          <h2 className="site-h2">Everything a teaching studio needs</h2>
          <p className="site-sub">Built with working music teachers, for the way private lessons actually run.</p>
          <div className="site-features">
            {FEATURES.map((f) => (
              <article key={f.title} className="site-feature">
                <div className="site-feature-icon" aria-hidden="true">
                  {f.icon}
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
          <ul className="site-extras">
            {EXTRAS.map((e) => (
              <li key={e}>✓ {e}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Getting started ---- */}
      <section className="site-section site-section-tint">
        <div className="site-wrap">
          <h2 className="site-h2">Up and running in an afternoon</h2>
          <ol className="site-steps">
            <li>
              <span className="site-step-num">1</span>
              <h3>Set up your studio</h3>
              <p>Your name, prices, teaching hours and how you like to be paid. A few minutes, and you can change it any time.</p>
            </li>
            <li>
              <span className="site-step-num">2</span>
              <h3>Add your pupils</h3>
              <p>Type them in, or import a spreadsheet from your old system. Then book their regular lessons.</p>
            </li>
            <li>
              <span className="site-step-num">3</span>
              <h3>Let Lindon do the rest</h3>
              <p>Reminders go out, invoices send themselves, and families can see everything without messaging you.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* ---- Closing call to action ---- */}
      <section className="site-section">
        <div className="site-wrap site-final">
          <h2 className="site-h2">Ready to give your evenings back?</h2>
          <p className="site-sub">Request an account, or get in touch if you’ve a question first.</p>
          <div className="site-cta site-cta-center">
            <Link href="/signup" className="btn site-btn-lg">
              Request an account
            </Link>
            <Link href="/contact" className="btn btn-secondary site-btn-lg">
              Ask a question
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
