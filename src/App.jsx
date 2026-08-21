import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import { Loading, EmptyState, Button } from './components/ui'
import { Wordmark } from './components/Brand'
import { Guard } from './components/Guard'

import Login from './pages/Login'
import Pay from './pages/Pay'
import OsLayout from './components/OsLayout'
import PortalLayout from './components/PortalLayout'

import Today        from './pages/os/Today'
import Schedule     from './pages/os/Schedule'
import Jobs         from './pages/os/Jobs'
import JobDetail    from './pages/os/JobDetail'
import Sales        from './pages/os/Sales'
import Customers    from './pages/os/Customers'
import CustomerDetail from './pages/os/CustomerDetail'
import Crew         from './pages/os/Crew'
import Inventory    from './pages/os/Inventory'
import Money        from './pages/os/Money'
import InvoiceDetail from './pages/os/InvoiceDetail'
import Chat         from './pages/os/Chat'
import Social       from './pages/os/Social'
import Settings     from './pages/os/Settings'

import PortalOverview from './pages/portal/Overview'
import PortalSchedule from './pages/portal/Schedule'
import PortalInvoices from './pages/portal/Invoices'
import PortalMessages from './pages/portal/Messages'
import PortalHome     from './pages/portal/Home'

function NoAccount() {
  const a = useAuth()
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--paper)' }}>
      <div className="card p-8 text-center" style={{ maxWidth: 460 }}>
        <Wordmark size={20} />
        <div className="mt-6">
          <EmptyState
            title="This email has no account here yet."
            body={`You are signed in as ${a.user?.email}, but nobody has been set up under it — not as an employee and not as a customer. The office can add you in a minute.`}
            action={
              <div className="flex items-center justify-center gap-2">
                <a className="btn" href="tel:19045138820">Call the office</a>
                <Button variant="primary" onClick={a.signOut}>Sign out</Button>
              </div>
            }
          />
        </div>
      </div>
    </div>
  )
}

/** Sends a signed-in person to the desk that belongs to them. */
function Landing() {
  const a = useAuth()
  const loc = useLocation()
  if (a.loading) return <Loading label="Signing you in" />
  if (!a.session) return <Login />
  if (a.isStaff) return <Navigate to="/os" replace state={{ from: loc }} />
  if (a.isClient) return <Navigate to="/portal" replace state={{ from: loc }} />
  return <NoAccount />
}

function RequireSession({ children }) {
  const a = useAuth()
  if (a.loading) return <Loading />
  if (!a.session) return <Navigate to="/" replace />
  if (!a.isStaff && !a.isClient) return <NoAccount />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      {/* the link the office texts — no account needed, the token is the authorisation */}
      <Route path="/pay/:token" element={<Pay />} />

      {/* ---------------- staff operating system ---------------- */}
      <Route path="/os" element={<RequireSession><OsLayout /></RequireSession>}>
        <Route index          element={<Guard need="staff"><Today /></Guard>} />
        <Route path="schedule"   element={<Guard need="staff"><Schedule /></Guard>} />
        <Route path="jobs"       element={<Guard need="staff"><Jobs /></Guard>} />
        <Route path="jobs/:id"   element={<Guard need="staff"><JobDetail /></Guard>} />
        <Route path="sales"      element={<Guard need="office"><Sales /></Guard>} />
        <Route path="customers"  element={<Guard need="office"><Customers /></Guard>} />
        <Route path="customers/:id" element={<Guard need="office"><CustomerDetail /></Guard>} />
        <Route path="crew"       element={<Guard need="office"><Crew /></Guard>} />
        <Route path="inventory"  element={<Guard need="staff"><Inventory /></Guard>} />
        <Route path="money"      element={<Guard need="office"><Money /></Guard>} />
        <Route path="money/:id"  element={<Guard need="office"><InvoiceDetail /></Guard>} />
        <Route path="chat"       element={<Guard need="staff"><Chat /></Guard>} />
        <Route path="social"     element={<Guard need="office"><Social /></Guard>} />
        <Route path="settings"   element={<Guard need="principal"><Settings /></Guard>} />
        <Route path="*"          element={<EmptyState title="No such page." body="The link you followed does not point at anything in the operating system." />} />
      </Route>

      {/* ---------------- customer portal ---------------- */}
      <Route path="/portal" element={<RequireSession><PortalLayout /></RequireSession>}>
        <Route index            element={<Guard need="client"><PortalOverview /></Guard>} />
        <Route path="schedule"  element={<Guard need="client"><PortalSchedule /></Guard>} />
        <Route path="invoices"  element={<Guard need="client"><PortalInvoices /></Guard>} />
        <Route path="messages"  element={<Guard need="client"><PortalMessages /></Guard>} />
        <Route path="home"      element={<Guard need="client"><PortalHome /></Guard>} />
        <Route path="*"         element={<EmptyState title="No such page." />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
