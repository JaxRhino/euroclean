import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { Wordmark } from './Brand'
import { Avatar, Button } from './ui'

const NAV = [
  { to: '/os',            label: 'Today',     end: true,  need: 'staff' },
  { to: '/os/schedule',   label: 'Schedule',              need: 'staff' },
  { to: '/os/jobs',       label: 'Jobs',                  need: 'staff' },
  { to: '/os/sales',      label: 'Sales',                 need: 'office' },
  { to: '/os/customers',  label: 'Customers',             need: 'office' },
  { to: '/os/crew',       label: 'Crew',                  need: 'office' },
  { to: '/os/inventory',  label: 'Inventory',             need: 'staff' },
  { to: '/os/money',      label: 'Money',                 need: 'office' },
  { to: '/os/chat',       label: 'Chat',                  need: 'staff' },
  { to: '/os/social',     label: 'Social',                need: 'office' },
  { to: '/os/settings',   label: 'Settings',              need: 'principal' },
]

export default function OsLayout() {
  const a = useAuth()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [clock, setClock] = useState(null)

  useEffect(() => { setOpen(false) }, [loc.pathname])

  useEffect(() => {
    if (!a.isStaff) return
    let alive = true
    const load = async () => {
      const [{ data: ch }, { data: t }] = await Promise.all([
        supabase.rpc('my_channels'),
        supabase.from('time_entries').select('id,clock_in,job_id').is('clock_out', null).eq('staff_id', a.user.id).maybeSingle(),
      ])
      if (!alive) return
      setUnread((ch || []).reduce((n, c) => n + (c.unread || 0), 0))
      setClock(t || null)
    }
    load()
    const i = setInterval(load, 30000)
    return () => { alive = false; clearInterval(i) }
  }, [a.isStaff, a.user, loc.pathname])

  const visible = NAV.filter(n =>
    n.need === 'staff' ? a.isStaff : n.need === 'office' ? a.isOffice : a.isPrincipal
  )

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--paper)' }}>
      {/* ---- top bar ---- */}
      <header className="shrink-0 h-[52px] flex items-center gap-4 px-4 border-b"
              style={{ background: '#fff', borderColor: 'var(--line2)' }}>
        <button className="md:hidden btn btn-sm" onClick={() => setOpen(o => !o)}>Menu</button>
        <Wordmark sub="Operations" />
        <div className="flex-1" />
        {clock && (
          <span className="hidden sm:inline chip chip-brass" title="You are on the clock">On the clock</span>
        )}
        <span className="hidden sm:block text-right leading-tight mr-1">
          <span className="block text-[12.5px] font-medium">{a.staff?.full_name}</span>
          <span className="block text-[10.5px] uppercase tracking-[.14em] text-ink-3">{a.staff?.role}</span>
        </span>
        <Avatar name={a.staff?.full_name} url={a.staff?.avatar_url} color={a.staff?.color} size={30} />
        <Button size="sm" variant="ghost" onClick={a.signOut}>Sign out</Button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* ---- rail ---- */}
        <nav
          className={`${open ? 'block' : 'hidden'} md:block shrink-0 w-[186px] border-r overflow-y-auto scroll absolute md:relative z-40 h-[calc(100%-52px)] md:h-auto top-[52px] md:top-0`}
          style={{ background: '#fff', borderColor: 'var(--line)' }}>
          <div className="py-3">
            {visible.map(n => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) =>
                  `relative flex items-center justify-between gap-2 px-4 h-[34px] text-[13.5px] ${isActive ? 'font-semibold' : ''}`}
                style={({ isActive }) => ({
                  color: isActive ? 'var(--navy)' : 'var(--ink2)',
                  background: isActive ? '#F4F7FC' : 'transparent',
                  boxShadow: isActive ? 'inset 2px 0 0 var(--navy)' : 'none',
                })}>
                <span>{n.label}</span>
                {n.to === '/os/chat' && unread > 0 && (
                  <span className="tnum text-[11px] px-1.5 py-px" style={{ background: 'var(--navy)', color: '#EFF4FA' }}>{unread}</span>
                )}
              </NavLink>
            ))}
          </div>
          <div className="mx-4 rule" />
          <div className="px-4 py-3 text-[11px] leading-relaxed text-ink-3">
            Euroclean Cleaning Service<br />Jacksonville, Florida
          </div>
        </nav>

        {/* ---- page ---- */}
        <main className="flex-1 min-w-0 overflow-y-auto scroll">
          <div className="max-w-[1240px] mx-auto px-4 md:px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
