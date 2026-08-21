import { useState, useEffect, useRef } from 'react'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { ago, fmtStamp } from '../../lib/format'
import {
  PageHead, Card, Button, Loading, ErrorNote, EmptyState, Field, Input, Textarea,
  useToast, Chip,
} from '../../components/ui'

export default function PortalMessages() {
  const a = useAuth()
  const toast = useToast()
  const [active, setActive] = useState(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const threads = useQuery(() => must(
    supabase.from('client_threads').select('*').order('last_message_at', { ascending: false })
  ), [])

  useEffect(() => {
    if (!active && (threads.data || []).length) setActive(threads.data[0].id)
  }, [threads.data, active])

  const startThread = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      const t = await must(supabase.from('client_threads').insert({
        client_id: a.client.id, subject: subject.trim() || 'Message',
      }).select('id').single())
      await must(supabase.from('client_messages').insert({
        thread_id: t.id, from_client: true, body: body.trim(),
      }).select('id').single())
      setSubject(''); setBody('')
      toast.ok('Sent. The office reads these during office hours.')
      await threads.reload()
      setActive(t.id)
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const list = threads.data || []

  return (
    <>
      <PageHead eyebrow="The office" title="Messages."
                sub="Goes straight to the office inbox. No app, nothing to copy out." />

      <ErrorNote error={threads.error} onRetry={threads.reload} />

      <div className="grid md:grid-cols-[240px_1fr] gap-4">
        <div className="grid gap-4 content-start">
          <Card title="Your conversations" pad={false}>
            {threads.loading ? <Loading /> : list.length === 0 ? (
              <div className="px-4 py-6 text-[12.5px] text-ink-3">Nothing yet. Start one on the right.</div>
            ) : list.map(t => (
              <button key={t.id} onClick={() => setActive(t.id)}
                className="w-full text-left px-3.5 py-2.5 border-b block"
                style={{
                  borderColor: 'var(--line)',
                  background: t.id === active ? '#F4F7FC' : 'transparent',
                  boxShadow: t.id === active ? 'inset 2px 0 0 var(--navy)' : 'none',
                }}>
                <div className="text-[13px] font-medium truncate">{t.subject}</div>
                <div className="text-[11px] text-ink-3">{ago(t.last_message_at)}</div>
              </button>
            ))}
          </Card>

          <Card title="Start a new one">
            <div className="grid gap-2.5">
              <Field label="About"><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Key for the back door" /></Field>
              <Field label="Message"><Textarea rows={3} value={body} onChange={e => setBody(e.target.value)} /></Field>
              <Button variant="primary" disabled={busy || !body.trim()} onClick={startThread}>Send it</Button>
            </div>
          </Card>
        </div>

        <Card pad={false} className="min-h-[420px] flex flex-col">
          {active ? <Thread id={active} clientId={a.client.id} onSent={threads.reload} />
                  : <EmptyState title="Pick a conversation." body="Or start a new one on the left." />}
        </Card>
      </div>
    </>
  )
}

function Thread({ id, clientId, onSent }) {
  const toast = useToast()
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const bottom = useRef(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    supabase.from('client_messages').select('*,staff(full_name)').eq('thread_id', id).order('created_at')
      .then(({ data }) => { if (alive) { setMsgs(data || []); setLoading(false) } })

    // mark what the office sent as read
    supabase.from('client_messages').update({ read_by_client_at: new Date().toISOString() })
      .eq('thread_id', id).eq('from_client', false).is('read_by_client_at', null).then(() => {})

    const sub = supabase.channel(`thread:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'client_messages', filter: `thread_id=eq.${id}` },
        ({ new: row }) => { if (alive) setMsgs(m => m.some(x => x.id === row.id) ? m : [...m, row]) })
      .subscribe()
    return () => { alive = false; supabase.removeChannel(sub) }
  }, [id])

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])

  const send = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      await must(supabase.from('client_messages').insert({ thread_id: id, from_client: true, body: body.trim() }).select('id').single())
      setBody(''); onSent()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto scroll px-4 py-4">
        {loading ? <Loading /> : msgs.length === 0 ? (
          <div className="text-center text-[13px] text-ink-3 py-10">No messages in this conversation.</div>
        ) : msgs.map(m => (
          <div key={m.id} className={`mb-3 flex ${m.from_client ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[76%] px-3 py-2 border"
                 style={{
                   background: m.from_client ? 'var(--navy)' : '#fff',
                   color: m.from_client ? 'var(--navyInk)' : 'var(--ink)',
                   borderColor: m.from_client ? 'var(--navy)' : 'var(--line2)',
                 }}>
              <div className="text-[10.5px] uppercase tracking-[.14em] mb-1"
                   style={{ color: m.from_client ? 'rgba(239,244,250,.6)' : 'var(--ink3)' }}>
                {m.from_client ? 'You' : (m.staff?.full_name || 'Euroclean')} · {ago(m.created_at)}
              </div>
              <div className="text-[13.5px] whitespace-pre-wrap break-words">{m.body}</div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <div className="shrink-0 border-t p-2.5 flex gap-2" style={{ borderColor: 'var(--line)' }}>
        <Textarea rows={1} value={body} onChange={e => setBody(e.target.value)} placeholder="Write a message…"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          style={{ minHeight: 36, maxHeight: 130 }} />
        <Button variant="primary" onClick={send} disabled={busy || !body.trim()}>Send</Button>
      </div>
    </>
  )
}
