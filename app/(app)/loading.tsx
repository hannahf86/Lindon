// =============================================================================
// app/(app)/loading.tsx — shown inside the app shell while a page loads
// A soft skeleton (title bar + two cards) so the layout doesn't jump.
// =============================================================================

const bar = (width: string, height = 14) => ({
  width,
  height,
  borderRadius: 999,
  background: 'var(--line-soft)',
})

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* ---- Header placeholder ---- */}
      <div className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={bar('220px', 30)} />
          <div style={bar('320px')} />
        </div>
      </div>

      {/* ---- Card placeholders ---- */}
      {[0, 1].map((i) => (
        <section className="card" key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={bar('40%', 18)} />
          <div style={bar('90%')} />
          <div style={bar('75%')} />
          <div style={bar('60%')} />
        </section>
      ))}
    </div>
  )
}
