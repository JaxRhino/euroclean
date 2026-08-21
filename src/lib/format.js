export const money = (cents, opts = {}) => {
  const n = (cents || 0) / 100
  return (opts.bare ? '' : '$') + n.toLocaleString('en-US', {
    minimumFractionDigits: opts.decimals === false ? 0 : (n % 1 ? 2 : 0),
    maximumFractionDigits: 2,
  })
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

/** 'YYYY-MM-DD' -> local Date at noon, so timezone can never shift the day. */
export const parseDay = (s) => {
  if (!s) return null
  if (s instanceof Date) return s
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}
export const dayKey = (d) => {
  const x = d instanceof Date ? d : parseDay(d)
  if (!x) return null
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export const today = () => dayKey(new Date())
export const addDays = (d, n) => { const x = new Date(parseDay(d)); x.setDate(x.getDate() + n); return x }
export const startOfWeek = (d, weekStartsOn = 1) => {
  const x = new Date(parseDay(d))
  const diff = (x.getDay() - weekStartsOn + 7) % 7
  x.setDate(x.getDate() - diff)
  return x
}

export const fmtDay = (s) => { const d = parseDay(s); return d ? `${MON[d.getMonth()]} ${d.getDate()}` : '—' }
export const fmtDayLong = (s) => { const d = parseDay(s); return d ? `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}` : '—' }
export const fmtDayFull = (s) => { const d = parseDay(s); return d ? `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : '—' }
export const monthLabel = (d) => { const x = parseDay(d); return `${MONTHS[x.getMonth()]} ${x.getFullYear()}` }
export { MONTHS, MON, DAYS, DOW }

export const fmtTime = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
export const fmtStamp = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${MON[d.getMonth()]} ${d.getDate()}, ${fmtTime(iso)}`
}
export const ago = (iso) => {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return fmtDay(new Date(iso))
}
export const hours = (mins) => mins == null ? '—' : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
export const phoneFmt = (p) => {
  const d = String(p || '').replace(/\D/g, '').slice(-10)
  return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : (p || '')
}
export const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
export const titleCase = (s) => String(s || '').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
