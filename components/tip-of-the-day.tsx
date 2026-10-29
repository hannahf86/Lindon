// =============================================================================
// components/tip-of-the-day.tsx — the daily tip card (teacher dashboard and
// family home). Butter wash with a small music-note mark; the category shows
// as an eyebrow label.
// =============================================================================
import { categoryLabel, tipForDate } from '@/lib/tips'

export function TipOfTheDay({ date }: { date: string }) {
  const tip = tipForDate(date)
  return (
    <aside className="tip" aria-label="Tip of the day">
      <span className="tip-mark" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
        </svg>
      </span>
      <div>
        <div className="eyebrow tip-eyebrow">Tip of the day · {categoryLabel(tip.category)}</div>
        <p className="tip-text">{tip.text}</p>
      </div>
    </aside>
  )
}
