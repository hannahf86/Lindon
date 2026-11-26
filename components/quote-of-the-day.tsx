// =============================================================================
// components/quote-of-the-day.tsx — a funny teaching quote on the TEACHER
// dashboard only (families never see it). Switchable in Settings
// (feature key daily_quote). Purple wash so it reads apart from the tip.
// =============================================================================
import { quoteForDate } from '@/lib/quotes'

export function QuoteOfTheDay({ date }: { date: string }) {
  return (
    <aside className="tip quote" aria-label="Quote of the day">
      <span className="tip-mark" aria-hidden>
        😄
      </span>
      <div>
        <div className="eyebrow tip-eyebrow">Quote of the day</div>
        <p className="tip-text">{quoteForDate(date)}</p>
      </div>
    </aside>
  )
}
