import { useEffect, useMemo, useRef, useState } from 'react'
import { Glass } from '../Glass'
import { Glow } from '../light/Light'
import { useFeed, useNow } from '../hooks'
import { yd } from '../api'
import type { CalendarEvent } from '@shared/types'

const get = () => yd.getCalendar()
const on = yd.onCalendar
const DOW = ['日', '月', '火', '水', '木', '金', '土']

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function eventDay(e: CalendarEvent): string { return e.allDay ? e.start.slice(0, 10) : ymd(new Date(e.start)) }
function hm(iso: string): string { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

/** Month view: days are soft points of text, today is a breathing ring, events are tiny lights. */
export function Calendar() {
  const data = useFeed(get, on)
  const now = useNow(60_000)
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))
  const [sel, setSel] = useState(() => ymd(now))
  const [connecting, setConnecting] = useState(false)
  const [msg, setMsg] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const acc = useRef(0)
  const lock = useRef(0)
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor

  // A horizontal swipe turns exactly one month (then ignores the rest of that swipe).
  useEffect(() => {
    const el = host.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0)
      if (!dx) return
      e.preventDefault()
      const t = performance.now()
      if (t < lock.current) { acc.current = 0; return }
      acc.current += dx
      if (Math.abs(acc.current) > 40) {
        const n = acc.current > 0 ? 1 : -1
        acc.current = 0; lock.current = t + 600
        const c = cursorRef.current
        setCursor(new Date(c.getFullYear(), c.getMonth() + n, 1))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const e of data?.events ?? []) { const k = eventDay(e); if (!m.has(k)) m.set(k, []); m.get(k)!.push(e) }
    return m
  }, [data])
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = new Date(first); start.setDate(1 - first.getDay())
    const n = Math.ceil((first.getDay() + new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()) / 7) * 7
    return Array.from({ length: n }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [cursor])
  const today = ymd(now)
  const selEvents = byDay.get(sel) ?? []
  const away = cursor.getFullYear() !== now.getFullYear() || cursor.getMonth() !== now.getMonth() || sel !== today
  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1))
  const connect = async () => {
    setConnecting(true); setMsg('ブラウザで Google にログインしてください')
    const r = await yd.calendarConnect()
    setConnecting(false); setMsg(r.ok ? '' : r.message)
  }
  const canConnect = data && !data.connected && data.error !== 'credentials 未設置'

  return (
    <Glass id="calendar" className="v2-cal">
      <div ref={host} style={{ display: 'flex', flexDirection: 'column', height: '100%' }} data-nodrag>
        <div className="head">
          <Glow breathe className="month">{cursor.getMonth() + 1}月</Glow>
          <div className="nav">
            <button onClick={() => move(-1)} aria-label="前の月">‹</button>
            {/* back to this month and today; shown only after moving away from it */}
            {away && <button className="back" onClick={() => { setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSel(today) }}>今日に戻る</button>}
            <button onClick={() => move(1)} aria-label="次の月">›</button>
          </div>
        </div>
        <div className="grid">
          {DOW.map((d) => <span key={d} className="dow">{d}</span>)}
          {cells.map((d) => {
            const k = ymd(d)
            if (d.getMonth() !== cursor.getMonth()) return <span key={k} />
            const evs = byDay.get(k)?.length ?? 0
            return (
              <span key={k} className={`day lt-soft ${k === today ? 'today' : ''} ${k === sel ? 'sel' : ''}`} onClick={() => setSel(k)}>
                {d.getDate()}
                {evs > 0 && <i className="ev" />}
              </span>
            )
          })}
        </div>
        <div className="events">
          {selEvents.slice(0, 6).map((e) => (
            <div key={e.id} className="row"><span className="tm">{e.allDay ? '終日' : hm(e.start)}</span><Glow>{e.title}</Glow></div>
          ))}
        </div>
        {canConnect && (
          <div className="connect">
            <button onClick={connect} disabled={connecting}>{connecting ? 'ログインを待っています' : 'Google カレンダーをつなぐ'}</button>
            {msg && <div className="v2-note">{msg}</div>}
          </div>
        )}
      </div>
    </Glass>
  )
}
