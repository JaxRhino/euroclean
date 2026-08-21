import { useAuth } from '../lib/AuthContext'
import { EmptyState, Loading } from './ui'
import { Link } from 'react-router-dom'

/**
 * A hidden nav item is not a permission. Every gated page refuses on its own.
 * need: 'staff' | 'office' | 'principal' | 'client'
 */
export function Guard({ need, children }) {
  const a = useAuth()
  if (a.loading) return <Loading />

  const ok =
    need === 'staff'     ? a.isStaff :
    need === 'office'    ? a.isOffice :
    need === 'principal' ? a.isPrincipal :
    need === 'client'    ? a.isClient : false

  if (ok) return children

  return (
    <EmptyState
      title="Not your desk"
      body={
        need === 'principal' ? 'This page is limited to the owner and managers.'
        : need === 'office'  ? 'This page is limited to office staff — owner, manager or dispatcher.'
        : need === 'client'  ? 'This page belongs to the customer portal.'
        : 'You need an employee account to open this page.'
      }
      action={<Link to="/" className="btn">Back to the start</Link>}
    />
  )
}
