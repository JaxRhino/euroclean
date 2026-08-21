import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { money, fmtDayFull, fmtStamp, today } from '../../lib/format'
import {
  PageHead, Card, Chip, Button, ArmedButton, Loading, ErrorNote, EmptyState,
  Field, Input, Select, Textarea, MoneyInput, Modal, useToast, INVOICE_TONE,
} from '../../components/ui'

export default function InvoiceDetail() {
  const { id } = useParams()
  const a = useAuth()
  const toast = useToast()
  const [pay, setPay] = useState(false)

  const inv = useQuery(() => must(
    supabase.from('invoices').select('*,clients(id,first_name,last_name,company,email,phone),jobs(id,number,scheduled_on,service_key)').eq('id', id).single()
  ), [id])
  const pays = useQuery(() => must(
    supabase.from('payments').select('*,staff(full_name)').eq('invoice_id', id).order('received_on', { ascending: false })
  ), [id])

  const i = inv.data

  const patch = async (fields, msg) => {
    try {
      const saved = await must(supabase.from('invoices').update(fields).eq('id', id).select('id'))
      if (!saved?.length) throw new Error('Nothing saved.')
      if (msg) toast.ok(msg)
      inv.reload()
    } catch (e) { toast.error(e.message) }
  }

  const setLines = async (lines) => {
    const subtotal = lines.reduce((n, l) => n + (l.cents || 0) * (l.qty || 1), 0)
    await patch({ lines, subtotal_cents: subtotal, total_cents: subtotal + (i.tax_cents || 0) })
  }

  if (inv.loading) return <Loading />
  if (inv.error) return <ErrorNote error={inv.error} onRetry={inv.reload} />
  if (!i) return <EmptyState title="No such invoice." />

  const who = i.clients?.company || `${i.clients?.first_name || ''} ${i.clients?.last_name || ''}`.trim()
  const owing = i.total_cents - i.paid_cents
  const isLate = i.due_on && i.due_on < today() && owing > 0
  const editable = i.status === 'draft'
  const payLink = `${window.location.origin}/app/pay/${i.share_token}`

  return (
    <>
      <PageHead eyebrow={<span className="tnum">{i.number}</span>} title={who}
                sub={i.jobs ? `For ${i.jobs.number} · ${fmtDayFull(i.jobs.scheduled_on)}` : 'Standalone invoice'}>
        <Chip tone={isLate ? 'rust' : INVOICE_TONE[i.status]}>{isLate ? 'overdue' : i.status}</Chip>
        <Link to="/os/money" className="btn">All invoices</Link>
      </PageHead>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid gap-4">
          <Card title="Lines" action={editable
            ? <Button size="sm" onClick={() => setLines([...(i.lines || []), { name: 'New line', cents: 0, qty: 1 }])}>Add a line</Button>
            : <span className="text-[11.5px] text-ink-3">Sent invoices are locked</span>}>
            {(i.lines || []).length === 0 ? (
              <div className="py-6 text-center text-[13px] text-ink-3">No lines on this invoice.</div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Description</th><th style={{ width: 70 }}>Qty</th><th className="text-right" style={{ width: 120 }}>Each</th><th className="text-right" style={{ width: 110 }}>Amount</th>{editable && <th style={{ width: 44 }} />}</tr></thead>
                <tbody>
                  {(i.lines || []).map((l, idx) => (
                    <tr key={idx}>
                      <td>
                        {editable
                          ? <Input defaultValue={l.name} onBlur={e => {
                              const next = [...i.lines]; next[idx] = { ...l, name: e.target.value }; setLines(next)
                            }} />
                          : l.name}
                      </td>
                      <td>
                        {editable
                          ? <Input type="number" min="1" defaultValue={l.qty || 1} onBlur={e => {
                              const next = [...i.lines]; next[idx] = { ...l, qty: Number(e.target.value) || 1 }; setLines(next)
                            }} />
                          : <span className="tnum">{l.qty || 1}</span>}
                      </td>
                      <td className="text-right">
                        {editable
                          ? <MoneyInput cents={l.cents} onCents={c => { const next = [...i.lines]; next[idx] = { ...l, cents: c }; setLines(next) }} />
                          : <span className="tnum">{money(l.cents)}</span>}
                      </td>
                      <td className="text-right tnum">{money((l.cents || 0) * (l.qty || 1))}</td>
                      {editable && (
                        <td>
                          <ArmedButton size="sm" variant="ghost" confirmLabel="×"
                            onConfirm={() => setLines(i.lines.filter((_, k) => k !== idx))}>Remove</ArmedButton>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="mt-4 pt-3.5 grid gap-1.5 max-w-xs ml-auto text-[13.5px]" style={{ borderTop: '1px solid var(--line)' }}>
              <Row k="Subtotal" v={money(i.subtotal_cents)} />
              <Row k="Tax" v={money(i.tax_cents)} />
              <Row k="Total" v={money(i.total_cents)} strong />
              {i.paid_cents > 0 && <Row k="Paid" v={`− ${money(i.paid_cents)}`} />}
              <Row k="Outstanding" v={money(owing)} strong tone={owing > 0 ? 'var(--rust)' : 'var(--moss)'} />
            </div>
          </Card>

          <Card title="Payments" action={a.isOffice && owing > 0 ? <Button size="sm" onClick={() => setPay(true)}>Record a payment</Button> : null}>
            {(pays.data || []).length === 0 ? (
              <div className="py-6 text-center text-[13px] text-ink-3">Nothing has been paid against this invoice.</div>
            ) : (
              <table className="tbl">
                <thead><tr><th style={{ width: 160 }}>Received</th><th style={{ width: 110 }}>Method</th><th>Reference</th><th style={{ width: 150 }}>Recorded by</th><th className="text-right" style={{ width: 110 }}>Amount</th></tr></thead>
                <tbody>
                  {pays.data.map(p => (
                    <tr key={p.id}>
                      <td className="text-[12.5px]">{fmtDayFull(p.received_on)}</td>
                      <td><Chip tone="mute">{p.method}</Chip></td>
                      <td className="text-[12.5px] text-ink-2">{p.reference || '—'}</td>
                      <td className="text-[12.5px]">{p.staff?.full_name || 'the customer'}</td>
                      <td className="text-right tnum">{money(p.amount_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div className="grid gap-4 content-start">
          <Card title="Terms">
            <div className="grid gap-3.5">
              <Field label="Issued">
                <Input type="date" value={i.issued_on || ''} onChange={e => patch({ issued_on: e.target.value })} />
              </Field>
              <Field label="Due">
                <Input type="date" value={i.due_on || ''} onChange={e => patch({ due_on: e.target.value })} />
              </Field>
              <Field label="Memo — the customer reads this">
                <Textarea rows={3} defaultValue={i.memo || ''} onBlur={e => e.target.value !== (i.memo || '') && patch({ memo: e.target.value || null }, 'Memo saved.')} />
              </Field>
            </div>
          </Card>

          <Card title="Send it">
            {i.status === 'draft' ? (
              <>
                <p className="text-[13px] text-ink-2 mt-0">
                  Once it is sent the customer can see it in their portal and the lines lock.
                </p>
                <Button variant="primary" className="w-full"
                  disabled={!i.total_cents}
                  onClick={() => patch({ status: 'sent', sent_at: new Date().toISOString() }, 'Invoice sent.')}>
                  {i.total_cents ? 'Mark as sent' : 'Add a line first'}
                </Button>
              </>
            ) : (
              <>
                <p className="text-[13px] text-ink-2 mt-0">
                  Sent {i.sent_at ? fmtStamp(i.sent_at) : '—'}. The customer sees this in their portal.
                </p>
                <Field label="Payment link" hint="Copy this into a text or an email.">
                  <Input readOnly value={payLink} onFocus={e => e.target.select()} />
                </Field>
                {i.status !== 'paid' && (
                  <ArmedButton className="w-full mt-3" variant="danger" confirmLabel="Confirm void"
                    onConfirm={() => patch({ status: 'void' }, 'Invoice voided.')}>Void this invoice</ArmedButton>
                )}
              </>
            )}
          </Card>

          <Card title="Customer">
            <Link to={`/os/customers/${i.clients?.id}`} className="text-[14px] font-medium hover:underline">{who}</Link>
            <div className="text-[12.5px] text-ink-2 mt-1">{i.clients?.email || 'no email'}</div>
            <div className="text-[12.5px] text-ink-2">{i.clients?.phone || 'no phone'}</div>
          </Card>
        </div>
      </div>

      <RecordPayment open={pay} onClose={() => setPay(false)} invoice={i} owing={owing}
                     onDone={() => { inv.reload(); pays.reload() }} />
    </>
  )
}

const Row = ({ k, v, strong, tone }) => (
  <div className="flex items-baseline justify-between gap-4">
    <span className={strong ? 'font-semibold' : 'text-ink-3'}>{k}</span>
    <span className={`tnum ${strong ? 'font-semibold' : ''}`} style={tone ? { color: tone } : undefined}>{v}</span>
  </div>
)

function RecordPayment({ open, onClose, invoice, owing, onDone }) {
  const a = useAuth()
  const toast = useToast()
  const [cents, setCents] = useState(owing)
  const [method, setMethod] = useState('card')
  const [ref, setRef] = useState('')

  const save = async () => {
    if (!cents || cents <= 0) { toast.error('Enter an amount.'); return }
    try {
      await must(supabase.from('payments').insert({
        invoice_id: invoice.id, amount_cents: cents, method, reference: ref || null, recorded_by: a.user.id,
      }).select('id').single())
      toast.ok('Payment recorded.')
      onClose(); onDone()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record a payment"
      sub={`${money(owing)} is outstanding on this invoice.`}
      footer={<><Button onClick={onClose}>Cancel</Button>
               <Button variant="primary" onClick={save}>Record it</Button></>}>
      <div className="grid gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount"><MoneyInput cents={cents} onCents={setCents} /></Field>
          <Field label="How they paid">
            <Select value={method} onChange={e => setMethod(e.target.value)}>
              <option value="card">Card</option><option value="cash">Cash</option>
              <option value="check">Check</option><option value="ach">Bank transfer</option><option value="other">Other</option>
            </Select>
          </Field>
        </div>
        <Field label="Reference" hint="Check number, last four, whatever helps later.">
          <Input value={ref} onChange={e => setRef(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
