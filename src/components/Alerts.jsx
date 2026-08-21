import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { ago } from '../lib/format'
import { Button } from './ui'

/**
 * The office is notified when a booking lands. Writing that row is half a loop —
 * this is the half that shows it to somebody.
 */
export default function Alerts() {
  const a = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const box = useRef(null)

  const load = async () => {
    try {
      const d = await must(
        supabase.from('notifications').select('*')
          .order('created_at', { ascending: false }).limit(30)
      )
      setRows(d || [])
    } catch (e) { console.error('[alerts]', e.message) }
  }

  useEffect(() => {
    load()
    const i = setInterval(load, 45000)
    const sub = supabase.channel('alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, load)
      .subscribe()
    return () => { clearInterval(i); supabase.removeChannel(sub) }
  }, [a.user?.id])

  useEffect(() => {
    if (!open) return
    const h = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const unread = rows.filter(r => !r.read_at).length

  const markAll = async () => {
    const ids = rows.filter(r => !r.read_at).map(r => r.id)
    if (!ids.length) return
    setRows(x => x.map(r => r.read_at ? r : { ...r, read_at: new Date().toISOString() }))
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
  }

  const openOne = async (r) => {
    if (!r.read_at) {
      setRows(x => x.map(y => y.id === r.id ? { ...y, read_at: new Date().toISOString() } : y))
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', r.id)
    }
    setOpen(false)
    if (r.href) nav(r.href.replace(/^\/app/, ''))
  }

  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="btn btn-sm" style={{ minWidth: 62 }}>
        Alerts
        {unread > 0 && (
          <span className="tnum text-[10.5px] px-1" style={{ background: 'var(--navy)', color: '#EFF4FA' }}>{unread}</span>
        )}
      </button>

      {open && (
        <div className="card fadein absolute right-0 mt-1.5 shadow-lift z-50" style={{ width: 340 }}>
          <header className="flex items-center justify-between px-3.5 h-[38px] border-b" style={{ borderColor: 'var(--line)' }}>
            <span className="eyebrow">Alerts</span>
            {unread > 0 && <Button size="sm" variant="ghost" onClick={markAll}>Mark all read</Button>}
          </header>
          <div className="max-h-[380px] overflow-y-auto scroll">
            {rows.length === 0 ? (
              <div className="px-3.5 py-7 text-center text-[12.5px] text-ink-3">Nothing to tell you.</div>
            ) : rows.map(r => (
              <button key={r.id} onClick={() => openOne(r)}
                className="w-full text-left px-3.5 py-2.5 border-b block last:border-0"
                style={{ borderColor: 'var(--line)', background: r.read_at ? 'transparent' : '#F4F7FC' }}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[12.5px] font-semibold flex-1">{r.title}</span>
                  <span className="text-[10.5px] text-ink-3 shrink-0">{ago(r.created_at)}</span>
                </div>
                {r.body && <div className="text-[12px] text-ink-2 mt-0.5">{r.body}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
