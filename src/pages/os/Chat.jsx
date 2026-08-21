import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { ago, fmtStamp } from '../../lib/format'
import {
  Card, Chip, Button, ArmedButton, Loading, ErrorNote, EmptyState, Field, Input,
  Textarea, Avatar, Modal, useToast, Select,
} from '../../components/ui'

export default function Chat() {
  const a = useAuth()
  const toast = useToast()
  const [active, setActive] = useState(null)
  const [make, setMake] = useState(false)
  const [call, setCall] = useState(null)

  const channels = useQuery(() => must(supabase.rpc('my_channels')), [])
  const staff = useQuery(() => must(supabase.from('staff').select('id,full_name,color,role').eq('active', true).neq('id', a.user.id).order('full_name')), [a.user.id])

  // pick the first channel once, never fight the user's choice afterwards
  useEffect(() => {
    if (!active && (channels.data || []).length) setActive(channels.data[0].id)
  }, [channels.data, active])

  const openDm = async (otherId) => {
    try {
      const id = await must(supabase.rpc('open_dm', { p_other: otherId }))
      await channels.reload()
      setActive(id)
    } catch (e) { toast.error(e.message) }
  }

  const list = channels.data || []
  const current = list.find(c => c.id === active)

  return (
    <div className="h-[calc(100vh-52px-48px)] min-h-[480px] flex gap-4">
      {/* ---- channel rail ---- */}
      <aside className="w-[236px] shrink-0 card flex flex-col overflow-hidden">
        <header className="h-[42px] px-3.5 flex items-center justify-between border-b" style={{ borderColor: 'var(--line)' }}>
          <span className="eyebrow">Channels</span>
          <Button size="sm" variant="ghost" onClick={() => setMake(true)}>New</Button>
        </header>

        <div className="flex-1 overflow-y-auto scroll">
          {channels.loading ? <Loading label="Loading" /> : list.length === 0 ? (
            <div className="px-3.5 py-6 text-[12.5px] text-ink-3">
              You are not in any channel yet. Start one, or message someone below.
            </div>
          ) : list.map(c => (
            <button key={c.id} onClick={() => setActive(c.id)}
              className="w-full text-left px-3.5 py-2.5 border-b block"
              style={{
                borderColor: 'var(--line)',
                background: c.id === active ? '#F4F7FC' : 'transparent',
                boxShadow: c.id === active ? 'inset 2px 0 0 var(--navy)' : 'none',
              }}>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium truncate flex-1"
                      style={{ color: c.id === active ? 'var(--navy)' : undefined }}>
                  {c.kind === 'dm' ? c.name : `# ${c.name}`}
                </span>
                {c.unread > 0 && (
                  <span className="tnum text-[10.5px] px-1.5" style={{ background: 'var(--navy)', color: '#EFF4FA' }}>{c.unread}</span>
                )}
              </div>
              {c.last_body && (
                <div className="text-[11.5px] text-ink-3 truncate mt-0.5">
                  {c.last_author ? `${c.last_author.split(' ')[0]}: ` : ''}{c.last_body}
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="border-t p-2.5" style={{ borderColor: 'var(--line)' }}>
          <span className="label">Message someone</span>
          <Select className="mt-1.5 !h-[30px] text-[12.5px]" value=""
                  onChange={e => e.target.value && openDm(e.target.value)}>
            <option value="">Choose a colleague…</option>
            {(staff.data || []).map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </Select>
        </div>
      </aside>

      {/* ---- message pane ---- */}
      <section className="flex-1 min-w-0 card flex flex-col overflow-hidden">
        {!current ? (
          <EmptyState title="Pick a channel." body="Or start one — a crew channel, an office channel, or a direct message." />
        ) : (
          <Room channel={current} onCallStart={setCall} onChanged={channels.reload} />
        )}
      </section>

      <NewChannel open={make} onClose={() => setMake(false)} staff={staff.data || []}
                  onDone={(id) => { channels.reload(); setActive(id) }} />
      <CallWindow call={call} onClose={() => setCall(null)} />
    </div>
  )
}

/* ================= one channel ================= */
function Room({ channel, onCallStart, onChanged }) {
  const a = useAuth()
  const toast = useToast()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const bottom = useRef(null)

  const members = useQuery(() => must(
    supabase.from('channel_members').select('staff_id,staff(id,full_name,color)').eq('channel_id', channel.id)
  ), [channel.id])

  const liveCall = useQuery(() => must(
    supabase.from('calls').select('*').eq('channel_id', channel.id).is('ended_at', null)
      .order('started_at', { ascending: false }).limit(1).maybeSingle()
  ), [channel.id])

  useEffect(() => {
    let alive = true
    setLoading(true); setErr(null)
    supabase.from('chat_messages')
      .select('*,staff(id,full_name,color,avatar_url)')
      .eq('channel_id', channel.id).order('created_at').limit(300)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) setErr(error); else setMsgs(data || [])
        setLoading(false)
      })

    supabase.rpc('mark_channel_read', { p_channel: channel.id }).then(() => onChanged())

    const sub = supabase.channel(`room:${channel.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${channel.id}` },
        async ({ new: row }) => {
          const { data: who } = await supabase.from('staff').select('id,full_name,color,avatar_url').eq('id', row.staff_id).maybeSingle()
          if (alive) setMsgs(m => m.some(x => x.id === row.id) ? m : [...m, { ...row, staff: who }])
        })
      .subscribe()

    return () => { alive = false; supabase.removeChannel(sub) }
  }, [channel.id])

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])

  const send = async () => {
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const row = await must(
        supabase.from('chat_messages')
          .insert({ channel_id: channel.id, staff_id: a.user.id, body: text })
          .select('*,staff(id,full_name,color,avatar_url)').single()
      )
      // Show it now. The realtime echo dedupes on id, so this is not a second copy —
      // and the message no longer depends on a socket to appear.
      setMsgs(m => m.some(x => x.id === row.id) ? m : [...m, row])
      setBody('')
      onChanged()
    } catch (e) { toast.error(e.message) } finally { setSending(false) }
  }

  const startCall = async () => {
    try {
      if (liveCall.data) { onCallStart(liveCall.data); return }
      const room = `euroclean-${crypto.randomUUID().replace(/-/g, '')}`
      const c = await must(supabase.from('calls').insert({
        channel_id: channel.id, room, started_by: a.user.id,
      }).select('*').single())
      await must(supabase.from('chat_messages').insert({
        channel_id: channel.id, staff_id: a.user.id, body: 'started a video call',
      }).select().single())
      liveCall.reload()
      onCallStart(c)
    } catch (e) { toast.error(e.message) }
  }

  return (
    <>
      <header className="h-[46px] shrink-0 px-4 flex items-center gap-3 border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold truncate">
            {channel.kind === 'dm' ? channel.name : `# ${channel.name}`}
          </div>
          <div className="text-[11px] text-ink-3">
            {(members.data || []).length} {members.data?.length === 1 ? 'person' : 'people'}
            {channel.topic ? ` · ${channel.topic}` : ''}
          </div>
        </div>
        <div className="flex-1" />
        {liveCall.data && <Chip tone="moss">call running</Chip>}
        <Button size="sm" variant={liveCall.data ? 'primary' : 'default'} onClick={startCall}>
          {liveCall.data ? 'Join the call' : 'Start a call'}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto scroll px-4 py-3">
        {loading ? <Loading /> : err ? <ErrorNote error={err} /> : msgs.length === 0 ? (
          <EmptyState title="No messages yet." body="Say something — everyone in this channel will see it." />
        ) : msgs.map((m, idx) => {
          const prev = msgs[idx - 1]
          const grouped = prev && prev.staff_id === m.staff_id &&
            (new Date(m.created_at) - new Date(prev.created_at)) < 5 * 60 * 1000
          return (
            <div key={m.id} className={`flex gap-2.5 ${grouped ? 'mt-0.5' : 'mt-3.5'}`}>
              <div style={{ width: 28 }} className="shrink-0">
                {!grouped && <Avatar name={m.staff?.full_name} url={m.staff?.avatar_url} color={m.staff?.color} size={28} />}
              </div>
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12.5px] font-semibold">{m.staff?.full_name || 'Someone'}</span>
                    <span className="text-[10.5px] text-ink-3">{ago(m.created_at)}</span>
                  </div>
                )}
                <div className="text-[13.5px] whitespace-pre-wrap break-words">{m.body}</div>
              </div>
              {m.staff_id === a.user.id && (
                <ArmedButton size="sm" variant="ghost" confirmLabel="Delete?"
                  onConfirm={async () => {
                    await must(supabase.from('chat_messages').delete().eq('id', m.id).select())
                    setMsgs(x => x.filter(y => y.id !== m.id))
                  }}>·</ArmedButton>
              )}
            </div>
          )
        })}
        <div ref={bottom} />
      </div>

      <div className="shrink-0 border-t p-2.5 flex gap-2" style={{ borderColor: 'var(--line)' }}>
        <Textarea rows={1} value={body} placeholder={`Message ${channel.kind === 'dm' ? channel.name.split(' & ')[0] : '#' + channel.name}`}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          style={{ minHeight: 36, maxHeight: 140 }} />
        <Button variant="primary" onClick={send} disabled={!body.trim() || sending}>Send</Button>
      </div>
    </>
  )
}

/* ================= new channel ================= */
function NewChannel({ open, onClose, staff, onDone }) {
  const a = useAuth()
  const toast = useToast()
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [picked, setPicked] = useState([])
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    try {
      const ch = await must(supabase.from('channels').insert({
        name: name.trim().replace(/^#/, ''), topic: topic || null, kind: 'channel', created_by: a.user.id,
      }).select('id').single())
      const rows = [{ channel_id: ch.id, staff_id: a.user.id }, ...picked.map(id => ({ channel_id: ch.id, staff_id: id }))]
      await must(supabase.from('channel_members').insert(rows).select())
      toast.ok(`#${name.trim()} created.`)
      setName(''); setTopic(''); setPicked([])
      onClose(); onDone(ch.id)
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="New channel"
      sub="Only the people you add can read it."
      footer={<><Button onClick={onClose}>Cancel</Button>
               <Button variant="primary" disabled={busy || !name.trim()} onClick={create}>Create it</Button></>}>
      <div className="grid gap-3.5">
        <Field label="Name"><Input value={name} onChange={e => setName(e.target.value)} placeholder="crew-a" /></Field>
        <Field label="What it is for"><Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Day-to-day for the Tuesday crew" /></Field>
        <div>
          <span className="label">Who is in it</span>
          <div className="grid sm:grid-cols-2 gap-1 mt-1.5 max-h-52 overflow-y-auto scroll">
            {staff.map(s => (
              <label key={s.id} className="flex items-center gap-2 py-1 text-[13px] cursor-pointer">
                <input type="checkbox" checked={picked.includes(s.id)}
                  onChange={e => setPicked(p => e.target.checked ? [...p, s.id] : p.filter(x => x !== s.id))} />
                <Avatar name={s.full_name} color={s.color} size={20} />
                <span>{s.full_name}</span>
                <span className="text-[10.5px] text-ink-3 uppercase tracking-[.1em]">{s.role}</span>
              </label>
            ))}
          </div>
          <p className="text-[12px] text-ink-3 mt-2 mb-0">You are added automatically.</p>
        </div>
      </div>
    </Modal>
  )
}

/* ================= the call ================= */
function CallWindow({ call, onClose }) {
  const a = useAuth()
  const toast = useToast()
  if (!call) return null
  const name = encodeURIComponent(a.staff?.full_name || 'Euroclean')
  const src = `https://meet.jit.si/${call.room}#userInfo.displayName=%22${name}%22&config.prejoinPageEnabled=true&config.startWithVideoMuted=false`

  const end = async () => {
    try {
      await must(supabase.from('calls').update({ ended_at: new Date().toISOString() }).eq('id', call.id).select('id'))
      toast.ok('Call ended for everyone.')
    } catch (e) { toast.error(e.message) }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[75] flex flex-col" style={{ background: 'rgba(14,30,51,.9)' }}>
      <header className="h-[52px] shrink-0 flex items-center gap-3 px-4" style={{ background: 'var(--navy)', color: 'var(--navyInk)' }}>
        <span className="disp text-[16px]">Euroclean call</span>
        <span className="text-[12px]" style={{ color: 'rgba(239,244,250,.6)' }}>
          Only people in this channel can see the room.
        </span>
        <div className="flex-1" />
        <Button size="sm" onClick={onClose}>Leave</Button>
        <ArmedButton size="sm" variant="danger" confirmLabel="End for everyone?" onConfirm={end}>End the call</ArmedButton>
      </header>
      <iframe
        title="Euroclean video call"
        src={src}
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        className="flex-1 w-full border-0"
      />
    </div>
  )
}
