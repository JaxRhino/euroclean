import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase, must } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { money, fmtDayFull, today, ago } from '../../lib/format'
import {
  PageHead, Card, Chip, Button, Loading, ErrorNote, EmptyState, Tabs, Input, Stat,
  INVOICE_TONE,
} from '../../components/ui'

export default function Money() {
  const [tab, setTab] = useState('open')
  const [q, setQ] = useState('')

  const invs = useQuery(() => must(
    supabase.from('invoices')
      .select('*,clients(id,first_name,last_name,company),jobs(number,scheduled_on)')
      .order('created_at', { ascending: false }).limit(500)
  ), [])

  const pays = useQuery(() => must(
    supabase.from('payments').select('*,invoices(number,clients(first_name,last_name,company))')
      .order('received_on', { ascending: false }).limit(200)
  ), [])

  const rows = useMemo(() => {
    let l = invs.data || []
    if (tab === 'open')      l = l.filter(i => ['sent', 'partial', 'overdue'].includes(i.status))
    else if (tab === 'draft')l = l.filter(i => i.status === 'draft')
    else if (tab === 'paid') l = l.filter(i => i.status === 'paid')
    else if (tab === 'late') l = l.filter(i => ['sent', 'partial', 'overdue'].includes(i.status) && i.due_on && i.due_on < today())
    const s = q.trim().toLowerCase()
    if (s) l = l.filter(i =>
      (i.number || '').toLowerCase().includes(s) ||
      `${i.clients?.first_name || ''} ${i.clients?.last_name || ''} ${i.clients?.company || ''}`.toLowerCase().includes(s))
    return l
  }, [invs.data, tab, q])

  const all = invs.data || []
  const outstanding = all.filter(i => ['sent', 'partial', 'overdue'].includes(i.status))
  const ar = outstanding.reduce((n, i) => n + (i.total_cents - i.paid_cents), 0)
  const late = outstanding.filter(i => i.due_on && i.due_on < today())
  const thisMonth = (pays.data || []).filter(p => p.received_on.slice(0, 7) === today().slice(0, 7))
    .reduce((n, p) => n + p.amount_cents, 0)

  return (
    <>
      <PageHead eyebrow="Finance" title="Money."
                sub="Invoices out, cash in, and who is behind.">
        <Input placeholder="Search invoice or customer" value={q} onChange={e => setQ(e.target.value)} style={{ width: 250 }} />
      </PageHead>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Receivable" value={money(ar)} sub={`${outstanding.length} invoice${outstanding.length === 1 ? '' : 's'} out`} />
        <Stat label="Past due" value={money(late.reduce((n, i) => n + (i.total_cents - i.paid_cents), 0))}
              sub={`${late.length} overdue`} tone={late.length ? 'var(--rust)' : undefined} />
        <Stat label="Collected this month" value={money(thisMonth)} sub={`${thisMonth ? (pays.data || []).filter(p => p.received_on.slice(0,7) === today().slice(0,7)).length : 0} payments`} />
        <Stat label="Drafts" value={all.filter(i => i.status === 'draft').length} sub="not sent yet" />
      </div>

      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
        { key: 'open', label: 'Outstanding', count: outstanding.length },
        { key: 'late', label: 'Past due', count: late.length },
        { key: 'draft', label: 'Drafts', count: all.filter(i => i.status === 'draft').length },
        { key: 'paid', label: 'Paid', count: all.filter(i => i.status === 'paid').length },
        { key: 'all', label: 'Everything', count: all.length },
        { key: 'payments', label: 'Payments received' },
      ]} />

      <ErrorNote error={invs.error} onRetry={invs.reload} />

      {tab === 'payments' ? (
        pays.loading ? <Loading /> : (pays.data || []).length === 0 ? (
          <Card><EmptyState title="No payments recorded." /></Card>
        ) : (
          <Card pad={false}>
            <table className="tbl">
              <thead><tr><th style={{ width: 160 }}>Received</th><th>Customer</th><th style={{ width: 120 }}>Invoice</th><th style={{ width: 110 }}>Method</th><th className="text-right" style={{ width: 110 }}>Amount</th></tr></thead>
              <tbody>
                {pays.data.map(p => (
                  <tr key={p.id}>
                    <td className="text-[12.5px]">{fmtDayFull(p.received_on)}</td>
                    <td className="text-[13px]">
                      {p.invoices?.clients?.company || `${p.invoices?.clients?.first_name || ''} ${p.invoices?.clients?.last_name || ''}`.trim()}
                    </td>
                    <td className="tnum text-[12.5px]">{p.invoices?.number}</td>
                    <td><Chip tone="mute">{p.method}</Chip></td>
                    <td className="text-right tnum text-[13px]">{money(p.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : invs.loading ? <Loading /> : rows.length === 0 ? (
        <Card><EmptyState title="Nothing here." body={q ? 'Nothing matches that search.' : 'Invoices are created from a finished visit.'} /></Card>
      ) : (
        <Card pad={false}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Invoice</th>
                <th>Customer</th>
                <th className="hidden md:table-cell" style={{ width: 150 }}>Issued</th>
                <th style={{ width: 150 }}>Due</th>
                <th style={{ width: 108 }}>Status</th>
                <th className="text-right" style={{ width: 100 }}>Total</th>
                <th className="text-right" style={{ width: 110 }}>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(i => {
                const isLate = i.due_on && i.due_on < today() && ['sent', 'partial', 'overdue'].includes(i.status)
                return (
                  <tr key={i.id}>
                    <td className="tnum text-[12.5px]"><Link to={`/os/money/${i.id}`} className="hover:underline underline-offset-2">{i.number}</Link></td>
                    <td>
                      <Link to={`/os/customers/${i.clients?.id}`} className="font-medium hover:underline underline-offset-2">
                        {i.clients?.company || `${i.clients?.first_name || ''} ${i.clients?.last_name || ''}`.trim()}
                      </Link>
                      {i.jobs?.number && <div className="text-[11px] tnum text-ink-3">{i.jobs.number}</div>}
                    </td>
                    <td className="hidden md:table-cell text-[12.5px]">{i.issued_on ? fmtDayFull(i.issued_on) : '—'}</td>
                    <td className="text-[12.5px]" style={isLate ? { color: 'var(--rust)', fontWeight: 500 } : undefined}>
                      {i.due_on ? fmtDayFull(i.due_on) : '—'}
                      {isLate && <div className="text-[11px]">{ago(i.due_on)}</div>}
                    </td>
                    <td><Chip tone={isLate ? 'rust' : INVOICE_TONE[i.status]}>{isLate ? 'overdue' : i.status}</Chip></td>
                    <td className="text-right tnum text-[13px]">{money(i.total_cents)}</td>
                    <td className="text-right tnum text-[13px]">{money(i.total_cents - i.paid_cents)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
