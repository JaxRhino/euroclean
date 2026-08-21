import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { money, fmtDayFull, today } from '../lib/format'
import { Wordmark } from '../components/Brand'
import { Button, Loading, Chip } from '../components/ui'

const FN = `${import.meta.env.VITE_SUPABASE_URL || 'https://oyuquouhjnrfzcedeltq.supabase.co'}/functions/v1/pay`

/**
 * The link the office texts. No login. The token is the authorisation, and the
 * function behind it returns only what a payer needs to see.
 */
export default function Pay() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const [inv, setInv] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const justPaid = params.get('paid') === '1'

  const call = async (action) => {
    const r = await fetch(FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action }),
    })
    return r.json()
  }

  useEffect(() => {
    let alive = true
    call('read').then(d => {
      if (!alive) return
      if (d.ok) { setInv(d.invoice); setError(null) } else setError(d.error)
      setLoading(false)
    }).catch(e => { if (alive) { setError(e.message); setLoading(false) } })
    return () => { alive = false }
  }, [token])

  const pay = async () => {
    setBusy(true)
    try {
      const d = await call('checkout')
      if (d.url) { window.location.href = d.url; return }
      setError(d.error || 'That did not work.')
      if (d.invoice) setInv(d.invoice)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const co = inv?.company || {}
  const late = inv?.due_on && inv.due_on < today() && inv.owing_cents > 0

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: 'var(--paper)' }}>
      <div className="mx-auto" style={{ maxWidth: 560 }}>
        <div className="text-center mb-6">
          <Wordmark size={21} />
          <div className="text-[12px] text-ink-3 mt-1.5">
            {co.phone || '(904) 513-8820'} · {co.city || 'Jacksonville'}, {co.state || 'FL'}
          </div>
        </div>

        {loading ? <div className="card"><Loading label="Opening your invoice" /></div>
          : !inv ? (
            <div className="card p-7 text-center">
              <div className="disp text-[20px] mb-2">That link did not open.</div>
              <p className="text-[13.5px] text-ink-2 m-0">{error}</p>
              <a className="btn mt-4" href={`tel:${(co.phone || '9045138820').replace(/\D/g, '')}`}>Call the office</a>
            </div>
          ) : (
            <div className="card">
              <header className="px-5 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--line)' }}>
                <div>
                  <div className="eyebrow">Invoice</div>
                  <div className="disp text-[22px] tnum leading-tight">{inv.number}</div>
                </div>
                <Chip tone={inv.owing_cents <= 0 ? 'moss' : late ? 'rust' : 'navy'}>
                  {inv.owing_cents <= 0 ? 'paid' : late ? 'past due' : inv.status}
                </Chip>
              </header>

              <div className="px-5 py-4">
                <div className="grid grid-cols-2 gap-4 text-[13px] mb-4">
                  <div><span className="label">Billed to</span>{inv.bill_to}</div>
                  <div><span className="label">Due</span>{inv.due_on ? fmtDayFull(inv.due_on) : '—'}</div>
                </div>

                <table className="tbl">
                  <thead><tr><th>Description</th><th style={{ width: 54 }}>Qty</th><th className="text-right" style={{ width: 100 }}>Amount</th></tr></thead>
                  <tbody>
                    {(inv.lines || []).map((l, i) => (
                      <tr key={i}>
                        <td>{l.name}</td>
                        <td className="tnum">{l.qty || 1}</td>
                        <td className="text-right tnum">{money((l.cents || 0) * (l.qty || 1))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-4 pt-3.5 grid gap-1.5 text-[13.5px]" style={{ borderTop: '1px solid var(--line)' }}>
                  <Row k="Subtotal" v={money(inv.subtotal_cents)} />
                  {inv.tax_cents > 0 && <Row k="Tax" v={money(inv.tax_cents)} />}
                  <Row k="Total" v={money(inv.total_cents)} strong />
                  {inv.paid_cents > 0 && <Row k="Already paid" v={`− ${money(inv.paid_cents)}`} />}
                </div>

                <div className="mt-5 pt-4 text-center" style={{ borderTop: '1px solid var(--line2)' }}>
                  <div className="eyebrow">{inv.owing_cents > 0 ? 'Due now' : 'Balance'}</div>
                  <div className="num text-[46px] leading-none mt-1"
                       style={{ color: inv.owing_cents > 0 ? 'var(--ink)' : 'var(--moss)' }}>
                    {money(inv.owing_cents)}
                  </div>
                </div>

                {justPaid && (
                  <p className="text-[13px] text-center mt-4 mb-0" style={{ color: 'var(--moss)' }}>
                    Thank you — the payment went through. A receipt is on its way from Stripe.
                  </p>
                )}

                {error && (
                  <div className="mt-4 px-3 py-2.5 text-[13px] border"
                       style={{ color: '#9C3B27', borderColor: '#9C3B27', background: '#FBEFEC' }}>
                    {error}
                  </div>
                )}

                {inv.owing_cents > 0 && (
                  <Button variant="primary" className="w-full mt-4" style={{ height: 44 }} disabled={busy} onClick={pay}>
                    {busy ? 'Opening the card page…' : `Pay ${money(inv.owing_cents)} by card`}
                  </Button>
                )}

                {inv.memo && <p className="text-[12.5px] text-ink-2 mt-4 mb-0">{inv.memo}</p>}
              </div>

              <footer className="px-5 py-3.5 text-[12px] text-ink-3 text-center" style={{ borderTop: '1px solid var(--line)', background: 'var(--paper2)' }}>
                Questions? Call <a className="underline underline-offset-2" href={`tel:${(co.phone || '9045138820').replace(/\D/g, '')}`}>{co.phone || '(904) 513-8820'}</a>
                {co.email && <> or email <a className="underline underline-offset-2" href={`mailto:${co.email}`}>{co.email}</a></>}.
              </footer>
            </div>
          )}
      </div>
    </div>
  )
}

const Row = ({ k, v, strong }) => (
  <div className="flex items-baseline justify-between gap-4">
    <span className={strong ? 'font-semibold' : 'text-ink-3'}>{k}</span>
    <span className={`tnum ${strong ? 'font-semibold' : ''}`}>{v}</span>
  </div>
)
