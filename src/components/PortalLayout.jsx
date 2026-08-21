import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { Wordmark } from './Brand'
import { Avatar, Button } from './ui'

const NAV = [
  { to: '/portal',           label: 'Overview', end: true },
  { to: '/portal/schedule',  label: 'Schedule' },
  { to: '/portal/invoices',  label: 'Invoices' },
  { to: '/portal/messages',  label: 'Messages' },
  { to: '/portal/home',      label: 'My home' },
]

export default function PortalLayout() {
  const a = useAuth()
  const loc = useLocation()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let alive = true
    supabase.rpc('client_snapshot').then(({ data }) => { if (alive) setUnread(data?.unread || 0) })
    return () => { alive = false }
  }, [loc.pathname])

  const name = [a.client?.first_name, a.client?.last_name].filter(Boolean).join(' ')

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--paper)' }}>
      <header className="h-[56px] shrink-0 flex items-center gap-4 px-4 md:px-6 border-b"
              style={{ background: '#fff', borderColor: 'var(--line2)' }}>
        <Wordmark sub="Your account" />
        <div className="flex-1" />
        <span className="hidden sm:block text-[12.5px] font-medium">{name}</span>
        <Avatar name={name} size={30} color="#8A6209" />
        <Button size="sm" variant="ghost" onClick={a.signOut}>Sign out</Button>
      </header>

      <nav className="shrink-0 border-b overflow-x-auto scroll" style={{ background: '#fff', borderColor: 'var(--line)' }}>
        <div className="max-w-[980px] mx-auto px-4 md:px-6 flex">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className="relative px-3.5 h-[40px] flex items-center gap-2 text-[13.5px] whitespace-nowrap"
              style={({ isActive }) => ({ color: isActive ? 'var(--navy)' : 'var(--ink2)', fontWeight: isActive ? 600 : 400 })}>
              {({ isActive }) => (
                <>
                  <span>{n.label}</span>
                  {n.to === '/portal/messages' && unread > 0 && (
                    <span className="tnum text-[11px] px-1.5" style={{ background: 'var(--navy)', color: '#EFF4FA' }}>{unread}</span>
                  )}
                  {isActive && <span className="absolute left-0 right-0 -bottom-px h-[2px]" style={{ background: 'var(--navy)' }} />}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="flex-1">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 py-6">
          <Outlet />
        </div>
      </main>

      <footer className="border-t py-5 text-center text-[12px] text-ink-3" style={{ borderColor: 'var(--line)' }}>
        Euroclean Cleaning Service · (904) 513-8820 · Jacksonville, Florida
      </footer>
    </div>
  )
}
