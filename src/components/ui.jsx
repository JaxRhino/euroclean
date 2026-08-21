import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { initials } from '../lib/format'

/* ============================ toasts ============================ */
/* No browser dialogs anywhere in this product. */
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setItems(x => [...x, { id, message, tone }])
    setTimeout(() => setItems(x => x.filter(i => i.id !== id)), tone === 'error' ? 6000 : 3600)
  }, [])
  const api = useCallback((m, t) => push(m, t), [push])
  api.ok = (m) => push(m, 'ok')
  api.error = (m) => push(m, 'error')

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-5 right-5 z-[80] flex flex-col gap-2 items-end pointer-events-none">
        {items.map(i => (
          <div key={i.id}
            className="fadein pointer-events-auto max-w-sm px-3.5 py-2.5 text-[13.5px] border shadow-lift"
            style={{
              background: i.tone === 'error' ? '#FBEFEC' : i.tone === 'ok' ? '#EEF4EF' : '#fff',
              borderColor: i.tone === 'error' ? '#9C3B27' : i.tone === 'ok' ? '#3F6B4A' : 'var(--line2)',
              color: i.tone === 'error' ? '#9C3B27' : 'var(--ink)',
            }}>
            {i.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ============================ primitives ============================ */
export function Button({ variant = 'default', size, className = '', ...p }) {
  const v = { default: '', primary: 'btn-primary', ghost: 'btn-ghost', danger: 'btn-danger' }[variant] || ''
  return <button type="button" className={`btn ${v} ${size === 'sm' ? 'btn-sm' : ''} ${className}`} {...p} />
}

/** Two-step confirm. Armed state must not move or cover anything — same box, new words. */
export function ArmedButton({ onConfirm, children, confirmLabel = 'Tap again to confirm', ...rest }) {
  const [armed, setArmed] = useState(false)
  const t = useRef()
  useEffect(() => () => clearTimeout(t.current), [])
  return (
    <Button
      {...rest}
      variant={armed ? 'danger' : (rest.variant || 'default')}
      style={{ minWidth: armed ? undefined : undefined, ...(rest.style || {}) }}
      onClick={() => {
        if (!armed) { setArmed(true); t.current = setTimeout(() => setArmed(false), 4000); return }
        clearTimeout(t.current); setArmed(false); onConfirm()
      }}>
      {armed ? confirmLabel : children}
    </Button>
  )
}

export const Label = ({ children, className = '' }) => <span className={`label ${className}`}>{children}</span>

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <Label>{label}</Label>}
      {children}
      {hint && <div className="mt-1 text-[11.5px] text-ink-3">{hint}</div>}
    </label>
  )
}

export const Input = (p) => <input {...p} className={`field ${p.className || ''}`} />
export const Textarea = (p) => <textarea {...p} className={`field ${p.className || ''}`} />
export const Select = ({ children, ...p }) => <select {...p} className={`field ${p.className || ''}`}>{children}</select>

export function MoneyInput({ cents, onCents, ...rest }) {
  const [txt, setTxt] = useState(cents == null ? '' : (cents / 100).toString())
  useEffect(() => { setTxt(cents == null ? '' : (cents / 100).toString()) }, [cents])
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 text-[13px]">$</span>
      <input
        {...rest}
        className="field pl-6"
        inputMode="decimal"
        value={txt}
        onChange={e => setTxt(e.target.value)}
        onBlur={() => {
          const n = Number(String(txt).replace(/[^0-9.]/g, ''))
          const c = Number.isFinite(n) ? Math.round(n * 100) : 0
          setTxt((c / 100).toString())
          onCents(c)
        }}
      />
    </div>
  )
}

export function Chip({ tone = 'mute', children, className = '' }) {
  return <span className={`chip chip-${tone} ${className}`}>{children}</span>
}

export function Avatar({ name, url, color = '#123E7C', size = 28 }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size }} className="object-cover" />
  return (
    <span
      className="inline-flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, background: color, color: '#EFF4FA', fontSize: size * 0.38, letterSpacing: '.02em' }}>
      {initials(name)}
    </span>
  )
}

/* ============================ layout pieces ============================ */
export function PageHead({ eyebrow, title, sub, children }) {
  return (
    <div className="flex items-end justify-between gap-6 flex-wrap mb-5">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="disp text-[27px] leading-[1.1] m-0">{title}</h1>
        {sub && <p className="text-[13.5px] text-ink-2 mt-1.5 mb-0 max-w-2xl">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  )
}

export function Card({ title, action, children, className = '', pad = true }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-4 h-[42px] border-b" style={{ borderColor: 'var(--line)' }}>
          <span className="eyebrow">{title}</span>
          {action}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub, tone }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="num text-[30px] leading-none" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="text-[12px] text-ink-3 mt-1.5">{sub}</div>}
    </div>
  )
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="disp text-[19px] mb-1.5">{title}</div>
      {body && <p className="text-[13.5px] text-ink-3 max-w-md mx-auto mb-4">{body}</p>}
      {action}
    </div>
  )
}

export function Loading({ label = 'Loading' }) {
  return <div className="py-14 text-center text-[13px] text-ink-3 tracking-[.12em] uppercase">{label}…</div>
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="card border-l-2 px-4 py-3 mb-4" style={{ borderLeftColor: '#9C3B27' }}>
      <div className="text-[13px] font-semibold" style={{ color: '#9C3B27' }}>That did not load.</div>
      <div className="text-[12.5px] text-ink-2 mt-1 break-words">{error.message || String(error)}</div>
      {onRetry && <Button size="sm" className="mt-2.5" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

/* ============================ modal ============================ */
export function Modal({ open, onClose, title, sub, children, footer, width = 560 }) {
  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = prev }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-auto py-10 px-4"
         style={{ background: 'rgba(14,30,51,.42)' }}
         onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card fadein w-full shadow-lift" style={{ maxWidth: width }} onMouseDown={e => e.stopPropagation()}>
        <header className="px-5 pt-4 pb-3.5 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="disp text-[19px] m-0 leading-tight">{title}</h2>
              {sub && <p className="text-[12.5px] text-ink-3 mt-1 mb-0">{sub}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">Close</Button>
          </div>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <footer className="px-5 py-3.5 border-t flex items-center justify-end gap-2" style={{ borderColor: 'var(--line)', background: 'var(--paper2)' }}>
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

/* ============================ tabs ============================ */
export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`flex items-center gap-0 border-b overflow-x-auto ${className}`} style={{ borderColor: 'var(--line)' }}>
      {tabs.map(t => {
        const on = t.key === value
        return (
          <button key={t.key} type="button" onClick={() => onChange(t.key)}
            className="relative px-3.5 h-[38px] text-[13px] font-medium whitespace-nowrap"
            style={{ color: on ? 'var(--navy)' : 'var(--ink3)' }}>
            {t.label}
            {t.count != null && <span className="ml-1.5 text-[11px] tnum" style={{ color: on ? 'var(--navy2)' : 'var(--ink3)' }}>{t.count}</span>}
            {on && <span className="absolute left-0 right-0 -bottom-px h-[2px]" style={{ background: 'var(--navy)' }} />}
          </button>
        )
      })}
    </div>
  )
}

/* ============================ status vocabulary ============================ */
export const JOB_TONE = {
  unscheduled: 'mute', scheduled: 'navy', dispatched: 'brass',
  in_progress: 'brass', complete: 'moss', cancelled: 'mute', no_access: 'rust',
}
export const JOB_LABEL = {
  unscheduled: 'Unscheduled', scheduled: 'Scheduled', dispatched: 'Dispatched',
  in_progress: 'In progress', complete: 'Complete', cancelled: 'Cancelled', no_access: 'No access',
}
export const INVOICE_TONE = { draft: 'mute', sent: 'navy', partial: 'brass', paid: 'moss', void: 'mute', overdue: 'rust' }
