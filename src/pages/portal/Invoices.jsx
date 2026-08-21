import { useState } from 'react'
import { supabase, must } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { money, fmtDayFull, today } from '../../lib/format'
import {
  PageHead, Card, Chip, Button, Loading, ErrorNote, EmptyState, Modal, useToast,
  Stat, INVOICE_TONE,
} from '../../components/ui'

export default function PortalInvoices() {
  const [open, setOpen] = useState(null)

  const invs = useQuery(() => must(
    supabase.from('invoices').select('*,jobs(number,scheduled_on,service_key)').order('created_at', { ascending: false })
  ), [])
  const pays = useQuery(() => must(supabase.from('payments').select('*').order('received_on', { ascending: false })), [])

  const rows = invs.data || []
  const owing = rows.filter(i => ['sent', 'partial', 'overdue'].includes(i.status))
  const balance = owing.reduce((n, i) => n + (i.total_cents - i.paid_cents), 0)
  const paidTotal = (pays.data || []).reduce((n, p) => n + p.amount_cents, 0)

  return (
    <>
      <PageHead eyebrow="Billing" title="Invoices."
                sub="What is owed, what is paid, and a card link on anything outstanding." />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <Stat label="Balance" value={money(balance)} sub={owing.length ? `${owing.length} invoice${owing.length === 1 ? '' : 's'} open` : 'nothing owing'}
              tone={balance ? 'var(--rust)' : 'var(--moss)'} />
        <Stat label="Paid to date" value={money(paidTotal)} />
        <Stat label="Invoices" value={rows.length} />
      </div>

      <ErrorNote error={invs.error} onRetry={invs.reload} />

      {invs.loading ? <Loading /> : rows.length === 0 ? (
        <Card><EmptyState title="No invoices yet." body="An invoice appears here after a cleaning is finished." /></Card>
      ) : (
        <div className="grid gap-3">
          {rows.map(i => {
            const out = i.total_cents - i.paid_cents
            const late = i.due_on && i.due_on < today() && out > 0
            return (
              <Card key={i.id}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="tnum text-[13px] font-semibold">{i.number}</span>
                      <Chip tone={late ? 'rust' : INVOICE_TONE[i.status]}>{late ? 'past due' : i.status}</Chip>
                    </div>
                    <div className="text-[13px] text-ink-2">
                      {i.jobs ? `${i.jobs.service_key.replace('_', ' ')} on ${fmtDayFull(i.jobs.scheduled_on)}` : 'Service'}
                    </div>
                    <div className="text-[12.5px] text-ink-3 mt-0.5">
                      {i.issued_on ? `Issued ${fmtDayFull(i.issued_on)}` : ''}{i.due_on ? ` · due ${fmtDayFull(i.due_on)}` : ''}
                    </div>
                    {i.memo && <p className="text-[13px] mt-2 mb-0 max-w-lg">{i.memo}</p>}
                  </div>
                  <div className="text-right">
                    <div className="num text-[28px] leading-none">{money(i.total_cents)}</div>
                    {i.paid_cents > 0 && out > 0 && (
                      <div className="text-[12px] text-ink-3 mt-1">{money(i.paid_cents)} paid · {money(out)} left</div>
                    )}
                    <div className="flex items-center gap-2 justify-end mt-2.5">
                      <Button size="sm" onClick={() => setOpen(i)}>See the detail</Button>
                      {out > 0 && <PayButton invoice={i} />}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Detail invoice={open} onClose={() => setOpen(null)} />
    </>
  )
}

function PayButton({ invoice }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const pay = async () => {
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: { invoice_id: invoice.id } })
      if (error) throw error
      if (data?.url) { window.location.href = data.url; return }
      // Say the true reason. A button that quietly does nothing is worse than one that explains itself.
      throw new Error(data?.error || 'Card payment is not switched on yet — call the office on (904) 513-8820 and they will take it over the phone.')
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return <Button size="sm" variant="primary" disabled={busy} onClick={pay}>{busy ? 'Opening…' : 'Pay by card'}</Button>
}

function Detail({ invoice, onClose }) {
  if (!invoice) return null
  const out = invoice.total_cents - invoice.paid_cents
  return (
    <Modal open={!!invoice} onClose={onClose} title={`Invoice ${invoice.number}`}
      sub={invoice.issued_on ? `Issued ${fmtDayFull(invoice.issued_on)}` : ''}
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
      <table className="tbl">
        <thead><tr><th>Description</th><th style={{ width: 60 }}>Qty</th><th className="text-right" style={{ width: 110 }}>Amount</th></tr></thead>
        <tbody>
          {(invoice.lines || []).map((l, i) => (
            <tr key={i}>
              <td>{l.name}</td>
              <td className="tnum">{l.qty || 1}</td>
              <td className="text-right tnum">{money((l.cents || 0) * (l.qty || 1))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 pt-3.5 grid gap-1.5 max-w-[240px] ml-auto text-[13.5px]" style={{ borderTop: '1px solid var(--line)' }}>
        <Line k="Subtotal" v={money(invoice.subtotal_cents)} />
        {invoice.tax_cents > 0 && <Line k="Tax" v={money(invoice.tax_cents)} />}
        <Line k="Total" v={money(invoice.total_cents)} strong />
        {invoice.paid_cents > 0 && <Line k="Paid" v={`− ${money(invoice.paid_cents)}`} />}
        <Line k="Due now" v={money(out)} strong tone={out > 0 ? 'var(--rust)' : 'var(--moss)'} />
      </div>
      {invoice.memo && <p className="text-[13px] mt-4 pt-3.5 mb-0" style={{ borderTop: '1px solid var(--line)' }}>{invoice.memo}</p>}
    </Modal>
  )
}

const Line = ({ k, v, strong, tone }) => (
  <div className="flex items-baseline justify-between gap-4">
    <span className={strong ? 'font-semibold' : 'text-ink-3'}>{k}</span>
    <span className={`tnum ${strong ? 'font-semibold' : ''}`} style={tone ? { color: tone } : undefined}>{v}</span>
  </div>
)
