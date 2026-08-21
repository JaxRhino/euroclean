/* The wordmark. No icon, no logo file — the type is the mark. */
export function Wordmark({ size = 17, tone = 'var(--ink)', sub }) {
  return (
    <span className="inline-flex items-baseline gap-2 select-none">
      <span className="disp" style={{ fontSize: size, letterSpacing: '-.025em', color: tone, fontWeight: 500 }}>
        Euroclean
      </span>
      {sub && (
        <span style={{
          fontSize: size * 0.5, letterSpacing: '.16em', textTransform: 'uppercase',
          fontWeight: 600, color: 'var(--ink3)', paddingLeft: 9, marginLeft: 1,
          borderLeft: '1px solid var(--line2)',
        }}>{sub}</span>
      )}
    </span>
  )
}
