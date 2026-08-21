import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Field, Input, useToast } from '../components/ui'
import { Wordmark } from '../components/Brand'

export default function Login() {
  const toast = useToast()
  const [mode, setMode] = useState('password')   // 'password' | 'link'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        // AuthContext picks the session up and App routes by role.
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: `${window.location.origin}/app` },
        })
        if (error) throw error
        setSent(true)
        toast.ok('Link sent. Check your email.')
      }
    } catch (e2) {
      setErr(e2.message === 'Invalid login credentials'
        ? 'That email and password do not match an account.'
        : e2.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2" style={{ background: 'var(--paper)' }}>
      {/* ---- the panel ---- */}
      <div className="flex items-center justify-center px-6 py-14">
        <div className="w-full" style={{ maxWidth: 372 }}>
          <Wordmark size={22} />
          <h1 className="disp text-[30px] leading-[1.08] mt-7 mb-2">Sign in.</h1>
          <p className="text-[13.5px] text-ink-2 mb-7">
            One door for the crew and for customers. We know which one you are once you are in.
          </p>

          {sent ? (
            <div className="card p-4">
              <div className="disp text-[17px] mb-1">Check your email.</div>
              <p className="text-[13px] text-ink-2 m-0">
                A sign-in link is on its way to <b>{email}</b>. It works once, and it expires in an hour.
              </p>
              <Button className="mt-3" size="sm" onClick={() => { setSent(false); setMode('password') }}>
                Use a password instead
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-3.5">
              <Field label="Email">
                <Input type="email" required autoComplete="username" value={email}
                       onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              </Field>

              {mode === 'password' && (
                <Field label="Password">
                  <Input type="password" required autoComplete="current-password" value={password}
                         onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                </Field>
              )}

              {err && (
                <div className="text-[12.5px] px-3 py-2 border" style={{ color: '#9C3B27', borderColor: '#9C3B27', background: '#FBEFEC' }}>
                  {err}
                </div>
              )}

              <Button type="submit" variant="primary" disabled={busy} className="w-full h-[40px]">
                {busy ? 'One moment…' : mode === 'password' ? 'Sign in' : 'Email me a link'}
              </Button>

              <button type="button" className="text-[12.5px] text-ink-3 underline underline-offset-2 justify-self-start"
                      onClick={() => { setMode(m => m === 'password' ? 'link' : 'password'); setErr(null) }}>
                {mode === 'password' ? 'I do not have a password' : 'Use a password instead'}
              </button>
            </form>
          )}

          <div className="mt-9 pt-5 text-[12px] text-ink-3" style={{ borderTop: '1px solid var(--line)' }}>
            Trouble getting in? Call the office on <a href="tel:19045138820" className="underline underline-offset-2">(904) 513-8820</a>.
          </div>
        </div>
      </div>

      {/* ---- the plate ---- */}
      <div className="hidden md:flex flex-col justify-between p-10" style={{ background: 'var(--navy)', color: 'var(--navyInk)' }}>
        <div className="eyebrow" style={{ color: 'rgba(239,244,250,.62)' }}>Euroclean Cleaning Service · Jacksonville</div>
        <div>
          <p className="disp m-0" style={{ fontSize: 38, lineHeight: 1.12, fontWeight: 300, letterSpacing: '-.03em' }}>
            “We don’t cut corners,<br />we clean them.”
          </p>
          <div className="mt-8 grid grid-cols-2 gap-y-5 gap-x-8 max-w-md">
            {[['Serving since', '2019'], ['BBB', 'A+ accredited'], ['Google rating', '5.0'], ['Guarantee', '48-hour re-clean']].map(([k, v]) => (
              <div key={k}>
                <div className="text-[10.5px] uppercase tracking-[.16em]" style={{ color: 'rgba(239,244,250,.55)' }}>{k}</div>
                <div className="text-[15px] mt-1">{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-[11.5px]" style={{ color: 'rgba(239,244,250,.5)' }}>
          Licensed, bonded &amp; insured · Duval &amp; St. Johns
        </div>
      </div>
    </div>
  )
}
